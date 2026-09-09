import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getBucket, getDb, isFirebaseConfigured, isStorageConfigured } from "@/lib/firebase-admin";
import { loadSurveyConfig } from "@/lib/survey-store";
import { generateEditCode, hashEditCode, hashToken, isSurveyClosed, shouldIncludeTokenHash, validateAnswers } from "@/lib/survey-utils";
import { getClientIp, hit } from "@/lib/rate-limit";
import type { UploadedFile } from "@/lib/types";

// firebase-admin은 Edge 런타임에서 동작하지 않음
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 응답 제출: 한 IP가 1분에 최대 20회 (스팸·중복 대량 제출 방지)
const SUBMIT_LIMIT = 20;
const SUBMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  try {
    const rl = hit(`submit:${getClientIp(request)}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const body = (await request.json()) as {
      survey_id?: string;
      answers?: Record<string, unknown>;
      token?: string;
      edit_code?: string;
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

    // ── 수정 모드: edit_code로 기존 응답을 찾아 덮어쓰기 ──
    if (body.edit_code) {
      if (!config.allowEdit) return badRequest("이 설문은 응답 수정을 지원하지 않습니다.");
      const codeHash = hashEditCode(body.edit_code);
      if (!codeHash) return badRequest("수정 코드가 올바르지 않습니다.");
      const updated = await updateResponseByEditCode(config.id, codeHash, validation.answers);
      if (!updated) return badRequest("일치하는 응답을 찾을 수 없습니다. 수정 코드를 확인해 주세요.");
      return NextResponse.json({ ok: true, response_id: updated, edited: true });
    }

    // ── 신규 제출 ──
    const responseId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    // 이중 제출 방지: 같은 IP·같은 내용이 60초 내 다시 오면 새 응답을 만들지 않고 첫 응답을 반환
    const ip = getClientIp(request);
    const contentHash = createHash("sha256")
      .update(`${config.id}|${ip}|${stableStringify(validation.answers)}`)
      .digest("hex");
    const dup = await claimSubmission(config.id, contentHash, responseId);
    if (dup.duplicate) {
      return NextResponse.json({ ok: true, response_id: dup.responseId || responseId, duplicate: true, edit_code: null });
    }

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

    // 수정 허용 설문이면 수정 코드 발급 (원본은 반환만, 저장은 해시로)
    let editCode: string | null = null;
    if (config.allowEdit) {
      editCode = generateEditCode();
      const codeHash = hashEditCode(editCode);
      if (codeHash) payload.edit_code_hash = codeHash;
      else editCode = null; // TOKEN_HASH_SECRET 미설정 시 발급 불가
    }

    await saveToFirestore(payload, tokenHash);

    return NextResponse.json({ ok: true, response_id: responseId, edit_code: editCode });
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

/** 키 순서와 무관하게 동일 내용이면 같은 문자열을 내는 안정적 직렬화 (중복 감지용) */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * 이중 제출 방지: (설문·IP·내용) 해시로 dedup 문서를 트랜잭션 생성.
 * 60초 내 같은 해시가 이미 있으면 중복으로 보고 첫 응답 id를 돌려준다.
 */
async function claimSubmission(
  surveyId: string,
  contentHash: string,
  responseId: string
): Promise<{ duplicate: boolean; responseId?: string }> {
  if (!isFirebaseConfigured()) return { duplicate: false };
  const WINDOW_MS = 60 * 1000;
  const db = getDb();
  const ref = db.collection("surveys").doc(surveyId).collection("dedup").doc(contentHash);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() as { at?: number; response_id?: string };
      if (data.at && Date.now() - data.at < WINDOW_MS) {
        return { duplicate: true, responseId: data.response_id };
      }
    }
    tx.set(ref, { at: Date.now(), response_id: responseId });
    return { duplicate: false };
  });
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

/**
 * 수정 코드 해시로 기존 응답을 찾아 답변을 덮어쓴다.
 * 성공 시 response_id, 못 찾으면 null. (응답 수 집계는 건드리지 않음)
 */
async function updateResponseByEditCode(
  surveyId: string,
  codeHash: string,
  answers: Record<string, unknown>
): Promise<string | null> {
  if (!isFirebaseConfigured()) {
    console.log("[survey-edit:dry-run]", surveyId, codeHash.slice(0, 8), JSON.stringify(answers).slice(0, 200));
    return "dry-run";
  }

  const db = getDb();
  const responsesRef = db.collection("surveys").doc(surveyId).collection("responses");
  const snap = await responsesRef.where("edit_code_hash", "==", codeHash).limit(1).get();
  if (snap.empty) return null;

  const doc = snap.docs[0];
  await doc.ref.update({
    answers,
    updated_at: FieldValue.serverTimestamp(),
    edit_count: FieldValue.increment(1)
  });
  return doc.id;
}

class DuplicateSubmissionError extends Error {
  constructor() {
    super("이미 제출된 응답입니다.");
    this.name = "DuplicateSubmissionError";
  }
}
