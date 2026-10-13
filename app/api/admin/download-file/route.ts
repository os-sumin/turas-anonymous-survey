import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-auth";
import { getBucket, isStorageConfigured } from "@/lib/firebase-admin";
import { sanitizeFilename } from "@/lib/survey-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** 설문 마지막에 표시할 응답자용 자료의 Storage 직접 업로드 URL을 발급한다. */
export async function POST(request: Request) {
  const denied = guardAdmin(request);
  if (denied) return denied;

  try {
    if (!isStorageConfigured()) {
      return NextResponse.json(
        { ok: false, message: "파일 업로드가 설정되지 않았습니다. (FIREBASE_STORAGE_BUCKET)" },
        { status: 503 }
      );
    }

    const body = (await request.json()) as {
      survey_id?: string;
      filename?: string;
      content_type?: string;
      size?: number;
    };
    const surveyId = body.survey_id?.trim() || "";
    const filename = body.filename?.trim() || "";
    const size = body.size;
    const contentType = body.content_type?.trim() || "application/octet-stream";

    if (!surveyId || !/^[a-z0-9가-힣_-]+$/i.test(surveyId)) {
      return bad("설문 ID가 올바르지 않습니다.");
    }
    if (!filename || typeof size !== "number" || !Number.isFinite(size)) {
      return bad("업로드 요청 정보가 부족합니다.");
    }
    if (size <= 0 || size > MAX_SIZE_BYTES) {
      return bad("다운로드 자료는 50MB 이하 파일만 등록할 수 있습니다.");
    }

    const safeName = sanitizeFilename(filename);
    const path = `survey-downloads/${surveyId}/${crypto.randomUUID()}_${safeName}`;
    const [uploadUrl] = await getBucket().file(path).getSignedUrl({
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
    return NextResponse.json({ ok: false, message: "파일 업로드 준비 중 오류가 발생했습니다." }, { status: 500 });
  }
}

function bad(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}
