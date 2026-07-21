import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getSurveyConfig } from "@/lib/survey.config";
import { getDb, isFirebaseConfigured } from "@/lib/firebase-admin";
import { hashToken, isSurveyClosed, shouldIncludeTokenHash, validateAnswers } from "@/lib/survey-utils";

// firebase-admin은 Edge 런타임에서 동작하지 않음
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      survey_id?: string;
      answers?: Record<string, unknown>;
      token?: string;
    };

    const surveyId = body.survey_id;
    if (!surveyId) return badRequest("survey_id가 없습니다.");

    const config = getSurveyConfig(surveyId);
    if (!config) return badRequest("존재하지 않는 설문입니다.");

    if (isSurveyClosed(config)) {
      return NextResponse.json({ ok: false, message: "답변 종료된 설문입니다." }, { status: 410 });
    }

    const validation = validateAnswers(config, body.answers || {});
    if (!validation.ok) return badRequest(validation.message);

    const responseId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    const payload: Record<string, unknown> = {
      survey_id: config.id,
      response_id: responseId,
      submitted_at: submittedAt,
      answers: validation.answers,
      meta: { source: "vercel-survey", version: "1.0.0" }
    };

    let tokenHash: string | null = null;
    if (shouldIncludeTokenHash() && body.token) {
      tokenHash = hashToken(body.token);
      if (tokenHash) payload.token_hash = tokenHash;
    }

    await saveToFirestore(payload, tokenHash);

    return NextResponse.json({ ok: true, response_id: responseId });
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateSubmissionError") {
      return NextResponse.json({ ok: false, message: "이미 제출된 응답입니다." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ ok: false, message: "서버 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

/**
 * 저장 구조
 *   surveys/{survey_id}/responses/{response_id}   ← 응답 본문
 *   surveys/{survey_id}                           ← response_count 집계
 *   surveys/{survey_id}/tokens/{token_hash}       ← 중복제출 방지 (ALLOW_RESPONSE_TOKEN_HASH=true 일 때만)
 */
async function saveToFirestore(payload: Record<string, unknown>, tokenHash: string | null) {
  if (!isFirebaseConfigured()) {
    console.log("[survey-submit:dry-run]", JSON.stringify(payload, null, 2));
    return;
  }

  const db = getDb();
  const surveyId = payload.survey_id as string;
  const responseId = payload.response_id as string;

  const surveyRef = db.collection("surveys").doc(surveyId);
  const responseRef = surveyRef.collection("responses").doc(responseId);

  await db.runTransaction(async (tx) => {
    // 토큰 해시가 있으면 중복 제출 차단
    if (tokenHash) {
      const tokenRef = surveyRef.collection("tokens").doc(tokenHash);
      const existing = await tx.get(tokenRef);
      if (existing.exists) {
        throw new DuplicateSubmissionError();
      }
      tx.set(tokenRef, { used_at: FieldValue.serverTimestamp() });
    }

    tx.set(responseRef, {
      ...payload,
      created_at: FieldValue.serverTimestamp()
    });

    tx.set(
      surveyRef,
      {
        survey_id: surveyId,
        response_count: FieldValue.increment(1),
        last_response_at: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });
}

class DuplicateSubmissionError extends Error {
  constructor() {
    super("이미 제출된 응답입니다.");
    this.name = "DuplicateSubmissionError";
  }
}
