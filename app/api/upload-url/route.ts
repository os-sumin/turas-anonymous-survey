import { NextResponse } from "next/server";
import { getBucket, isStorageConfigured } from "@/lib/firebase-admin";
import { loadSurveyConfig } from "@/lib/survey-store";
import {
  DEFAULT_MAX_SIZE_MB,
  HARD_MAX_SIZE_MB,
  findQuestion,
  isAllowedExtension,
  isSurveyClosed,
  sanitizeFilename
} from "@/lib/survey-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 브라우저가 Storage에 직접 업로드할 수 있는 임시 URL을 발급한다.
 * 파일 본문이 Vercel을 거치지 않으므로 4.5MB 요청 제한을 받지 않는다.
 */
export async function POST(request: Request) {
  try {
    if (!isStorageConfigured()) {
      return NextResponse.json(
        { ok: false, message: "파일 업로드가 설정되지 않았습니다. (FIREBASE_STORAGE_BUCKET)" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      survey_id?: string;
      question_id?: string;
      filename?: string;
      content_type?: string;
      size?: number;
    };

    const { survey_id: surveyId, question_id: questionId, filename, size } = body;
    const contentType = body.content_type || "application/octet-stream";

    if (!surveyId || !questionId || !filename || typeof size !== "number") {
      return bad("업로드 요청 정보가 부족합니다.");
    }

    const config = await loadSurveyConfig(surveyId);
    if (!config) return bad("존재하지 않는 설문입니다.");

    if (isSurveyClosed(config)) {
      return NextResponse.json({ ok: false, message: "답변 종료된 설문입니다." }, { status: 410 });
    }

    const question = findQuestion(config, questionId);
    if (!question || question.type !== "file") {
      return bad("파일 첨부 문항이 아닙니다.");
    }

    const limitMB = Math.min(question.maxSizeMB ?? DEFAULT_MAX_SIZE_MB, HARD_MAX_SIZE_MB);
    if (size <= 0 || size > limitMB * 1024 * 1024) {
      return bad(`첨부 용량은 ${limitMB}MB를 초과할 수 없습니다.`);
    }

    if (!isAllowedExtension(filename, question.accept)) {
      return bad(`${(question.accept || []).join(", ")} 형식만 첨부할 수 있습니다.`);
    }

    const safeName = sanitizeFilename(filename);
    const path = `uploads/${config.id}/${question.id}/${crypto.randomUUID()}_${safeName}`;

    const [uploadUrl] = await getBucket()
      .file(path)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType
      });

    return NextResponse.json({
      ok: true,
      upload_url: uploadUrl,
      path,
      content_type: contentType
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "업로드 준비 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

function bad(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}
