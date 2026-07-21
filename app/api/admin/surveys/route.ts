import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import {
  deleteSurveyConfig,
  isBuiltinSurvey,
  listSurveyConfigs,
  loadSurveyConfig,
  saveSurveyConfig,
  validateSurveyConfig
} from "@/lib/survey-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 설문 목록 조회, 또는 ?id=xxx 로 단건 조회 */
export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) return unauthorized();

  try {
    const surveyId = new URL(request.url).searchParams.get("id");

    if (surveyId) {
      const config = await loadSurveyConfig(surveyId);
      if (!config) {
        return NextResponse.json({ ok: false, message: "설문을 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, config });
    }

    return NextResponse.json({ ok: true, surveys: await listSurveyConfigs() });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** 설문 저장 (같은 ID면 덮어쓰기) */
export async function POST(request: Request) {
  if (!isAdminAuthorized(request)) return unauthorized();

  try {
    if (!isFirebaseConfigured()) {
      return NextResponse.json(
        { ok: false, message: "Firebase가 설정되지 않아 저장할 수 없습니다." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const validation = validateSurveyConfig(body?.config);
    if (!validation.ok) {
      return NextResponse.json({ ok: false, message: validation.message }, { status: 400 });
    }

    await saveSurveyConfig(validation.config);

    return NextResponse.json({ ok: true, survey_id: validation.config.id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/** 설문 정의 삭제 (수집된 응답과 첨부파일은 보존) */
export async function DELETE(request: Request) {
  if (!isAdminAuthorized(request)) return unauthorized();

  try {
    if (!isFirebaseConfigured()) {
      return NextResponse.json(
        { ok: false, message: "Firebase가 설정되지 않아 삭제할 수 없습니다." },
        { status: 503 }
      );
    }

    const surveyId = new URL(request.url).searchParams.get("id");
    if (!surveyId) {
      return NextResponse.json({ ok: false, message: "삭제할 설문 ID가 없습니다." }, { status: 400 });
    }

    await deleteSurveyConfig(surveyId);

    // 코드에 같은 ID가 남아 있으면 삭제해도 그 버전이 계속 노출된다
    if (isBuiltinSurvey(surveyId)) {
      return NextResponse.json({
        ok: true,
        survey_id: surveyId,
        warning: "survey.config.ts에 같은 ID의 설문이 있어 코드 버전이 계속 노출됩니다."
      });
    }

    return NextResponse.json({ ok: true, survey_id: surveyId });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}

function unauthorized() {
  return NextResponse.json({ ok: false, message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
}
