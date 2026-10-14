import { NextResponse } from "next/server";
import { getBucket, isStorageConfigured } from "@/lib/firebase-admin";
import { getClientIp, hit } from "@/lib/rate-limit";
import { loadSurveyConfig } from "@/lib/survey-store";
import { isSurveyClosed, sanitizeFilename } from "@/lib/survey-utils";
import { isPersonalizedSurvey, resolveSurveyTarget } from "@/lib/target-store";
import type { SurveyConfig, SurveyDownloadFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOWNLOAD_LIMIT = 30;
const DOWNLOAD_WINDOW_MS = 60 * 1000;

/** 유효한 설문 링크에만 응답자용 자료의 단기 다운로드 URL을 발급한다. */
export async function GET(request: Request) {
  try {
    const rl = hit(`survey-download:${getClientIp(request)}`, DOWNLOAD_LIMIT, DOWNLOAD_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const url = new URL(request.url);
    const surveyId = url.searchParams.get("surveyId") || "";
    const token = url.searchParams.get("t") || undefined;
    if (!surveyId) return bad("설문 ID가 없습니다.");

    const config = await loadSurveyConfig(surveyId);
    if (!config) return NextResponse.json({ ok: false, message: "존재하지 않는 설문입니다." }, { status: 404 });
    if (isSurveyClosed(config)) {
      return NextResponse.json({ ok: false, message: "답변 종료된 설문입니다." }, { status: 410 });
    }

    if (isPersonalizedSurvey(config)) {
      const resolved = await resolveSurveyTarget(config.id, token);
      if (!resolved.ok) {
        return NextResponse.json({ ok: false, message: resolved.message }, { status: resolved.status });
      }
    }

    if (!isStorageConfigured()) {
      return NextResponse.json({ ok: false, message: "파일 다운로드가 설정되지 않았습니다." }, { status: 503 });
    }

    const file = resolveDownloadFile(config, url.searchParams);
    const expectedPrefix = `survey-downloads/${config.id}/`;
    if (!file || !file.path.startsWith(expectedPrefix) || file.path.includes("..")) {
      return NextResponse.json({ ok: false, message: "등록된 다운로드 자료가 없습니다." }, { status: 404 });
    }

    const storageFile = getBucket().file(file.path);
    const [exists] = await storageFile.exists();
    if (!exists) {
      return NextResponse.json({ ok: false, message: "다운로드 자료를 찾을 수 없습니다." }, { status: 404 });
    }

    const downloadName = sanitizeFilename(file.name) || "survey-material";
    const encodedName = encodeURIComponent(downloadName)
      .replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const mode = url.searchParams.get("mode") === "view" ? "view" : "download";
    const [downloadUrl] = await storageFile.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
      responseDisposition: `${mode === "view" ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
      responseType: file.type || "application/octet-stream"
    });

    return NextResponse.redirect(downloadUrl, 307);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "파일 다운로드 중 오류가 발생했습니다." }, { status: 500 });
  }
}

function resolveDownloadFile(config: SurveyConfig, params: URLSearchParams): SurveyDownloadFile | undefined {
  const scope = params.get("scope") || "final";
  if (scope === "final") return config.respondentDownload;

  const ownerId = params.get("ownerId") || "";
  const indexText = params.get("index") || "";
  const index = Number(indexText);
  if (!ownerId || !/^\d+$/.test(indexText) || !Number.isSafeInteger(index) || index < 0) return undefined;

  if (scope === "section") {
    return config.sections.find((section) => section.id === ownerId)?.attachments?.[index];
  }
  if (scope === "question") {
    return config.sections
      .flatMap((section) => section.questions)
      .find((question) => question.id === ownerId)
      ?.attachments?.[index];
  }
  return undefined;
}

function bad(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}
