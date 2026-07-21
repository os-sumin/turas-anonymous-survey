import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getBucket, getDb, isFirebaseConfigured, isStorageConfigured } from "@/lib/firebase-admin";
import { loadSurveyConfig } from "@/lib/survey-store";
import { hashToken, isSurveyClosed, shouldIncludeTokenHash, validateAnswers } from "@/lib/survey-utils";
import type { UploadedFile } from "@/lib/types";

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

    const config = await loadSurveyConfig(surveyId);
    if (!config) return badRequest("존재하지 않는 설문입니다.");

    if (isSurveyClosed(config)) {
      return NextResponse.json({ ok: false, message: "답변 종료된 설문입니다." }, { status: 410 });
    }

    const validation = validateAnswers(config, body.answers || {});
    if (!validation.ok) return badRequest(validation.message);

    // 첨부가 실제로 Storage에 존재하는지 확인 (경로 위조 방지)
    const missing = await findMissingFiles(validation.answers);
    if (missing.length > 0) {
      return badRequest(`첨부파일 업로드가 완료되지 않았습니다: ${missing.join(", ")}`);
    }

    const responseId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    const payload: Record<string, unknown> = {
      survey_id: config.id,
      response_id: responseId,
      submitted_at: submittedAt,
      answers: validation.answers,
      meta: { source: "vercel-survey", version: "1.1.0" }
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

function collectFiles(answers: Record<string, unknown>): UploadedFile[] {
  const files: UploadedFile[] = [];
  for (const value of Object.values(answers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object" && typeof (item as UploadedFile).path === "string") {
          files.push(item as UploadedFile);
        }
      }
    }
  }
  return files;
}

async function findMissingFiles(answers: Record<string, unknown>): Promise<string[]> {
  const files = collectFiles(answers);
  if (files.length === 0 || !isStorageConfigured()) return [];

  const bucket = getBucket();
  const results = await Promise.all(
    files.map(async (file) => {
      const [exists] = await bucket.file(file.path).exists();
      return exists ? null : file.name;
    })
  );

  return results.filter((name): name is string => Boolean(name));
}

/**
 * 저장 구조
 *   surveys/{survey_id}/responses/{response_id}   ← 응답 본문
 *   surveys/{survey_id}                           ← response_count 집계
 *   surveys/{survey_id}/tokens/{token_hash}       ← 중복제출 방지 (선택)
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
    if (tokenHash) {
      const tokenRef = surveyRef.collection("tokens").doc(tokenHash);
      const existing = await tx.get(tokenRef);
      if (existing.exists) throw new DuplicateSubmissionError();
      tx.set(tokenRef, { used_at: FieldValue.serverTimestamp() });
    }

    tx.set(responseRef, { ...payload, created_at: FieldValue.serverTimestamp() });

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
