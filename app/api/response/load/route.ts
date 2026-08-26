import { NextResponse } from "next/server";
import { getDb, isFirebaseConfigured } from "@/lib/firebase-admin";
import { loadSurveyConfig } from "@/lib/survey-store";
import { hashEditCode, isSurveyClosed } from "@/lib/survey-utils";
import { getClientIp, hit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 수정 코드 조회: 한 IP가 1분에 최대 15회 (코드 무차별 대입 방지)
const LOAD_LIMIT = 15;
const LOAD_WINDOW_MS = 60 * 1000;

/**
 * 수정 코드로 기존 응답의 답변을 불러온다.
 * 코드가 맞아야만 answers를 반환한다.
 */
export async function POST(request: Request) {
  try {
    const rl = hit(`load:${getClientIp(request)}`, LOAD_LIMIT, LOAD_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const body = (await request.json()) as { survey_id?: string; edit_code?: string };
    const surveyId = body.survey_id;
    const editCode = body.edit_code;
    if (!surveyId || !editCode) {
      return NextResponse.json({ ok: false, message: "정보가 부족합니다." }, { status: 400 });
    }

    const config = await loadSurveyConfig(surveyId);
    if (!config) return NextResponse.json({ ok: false, message: "존재하지 않는 설문입니다." }, { status: 404 });
    if (!config.allowEdit) {
      return NextResponse.json({ ok: false, message: "이 설문은 응답 수정을 지원하지 않습니다." }, { status: 400 });
    }
    if (isSurveyClosed(config)) {
      return NextResponse.json({ ok: false, message: "답변이 종료된 설문입니다." }, { status: 410 });
    }

    const codeHash = hashEditCode(editCode);
    if (!codeHash) {
      return NextResponse.json({ ok: false, message: "수정 코드가 올바르지 않습니다." }, { status: 400 });
    }

    if (!isFirebaseConfigured()) {
      return NextResponse.json({ ok: false, message: "저장소가 설정되지 않았습니다." }, { status: 503 });
    }

    const snap = await getDb()
      .collection("surveys")
      .doc(surveyId)
      .collection("responses")
      .where("edit_code_hash", "==", codeHash)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ ok: false, message: "일치하는 응답이 없습니다. 수정 코드를 확인해 주세요." }, { status: 404 });
    }

    const data = snap.docs[0].data() as { answers?: Record<string, unknown>; submitted_at?: string };
    return NextResponse.json({ ok: true, answers: data.answers || {}, submitted_at: data.submitted_at || null });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "서버 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
