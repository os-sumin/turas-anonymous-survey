import JSZip from "jszip";
import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { getBucket, isFirebaseConfigured, isStorageConfigured } from "@/lib/firebase-admin";
import { loadSurveyConfig } from "@/lib/survey-store";
import { listResponses, isFileAnswer } from "@/lib/response-store";
import { buildSummaryWorkbook } from "@/lib/summary-excel";
import {
  dedupeName,
  extractNameParts,
  makeAttachmentName,
  makePrefix,
  safeName
} from "@/lib/naming";
import { flattenQuestions } from "@/lib/survey-utils";
import type { UploadedFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 제출자별로 ZIP을 만든다.
 *   ?surveyId=xxx&responseId=yyy  → 특정 1명분 ZIP
 *   ?surveyId=xxx                 → 전체를 기업별 폴더로 묶은 ZIP 하나
 *
 * ZIP 구조:
 *   과제번호_기업명/
 *     과제번호_기업명_서류종류.pdf
 *     과제번호_기업명_요약.xlsx
 */
export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  try {
    if (!isFirebaseConfigured()) {
      return NextResponse.json({ ok: false, message: "Firebase가 설정되지 않았습니다." }, { status: 503 });
    }

    const url = new URL(request.url);
    const surveyId = url.searchParams.get("surveyId");
    const responseId = url.searchParams.get("responseId");

    if (!surveyId) {
      return NextResponse.json({ ok: false, message: "surveyId가 없습니다." }, { status: 400 });
    }

    const config = await loadSurveyConfig(surveyId);
    if (!config) {
      return NextResponse.json({ ok: false, message: "설문을 찾을 수 없습니다." }, { status: 404 });
    }

    const all = await listResponses(surveyId, 5000);
    const records = responseId ? all.filter((r) => r.responseId === responseId) : all;

    if (records.length === 0) {
      return NextResponse.json({ ok: false, message: "해당 응답을 찾을 수 없습니다." }, { status: 404 });
    }

    const bucket = isStorageConfigured() ? getBucket() : null;
    const fileQuestions = flattenQuestions(config).filter((q) => q.type === "file");

    const zip = new JSZip();
    const single = Boolean(responseId);
    const usedFolders = new Set<string>();

    for (const record of records) {
      const parts = extractNameParts(config, record.answers);
      const prefix = makePrefix(parts);

      // 단건이면 ZIP 루트에 바로, 전체면 기업별 폴더로
      const folderName = single ? "" : dedupeName(usedFolders, prefix) + "/";
      const usedFiles = new Set<string>();

      // 1) 첨부파일들
      for (const question of fileQuestions) {
        const value = record.answers[question.id];
        if (!isFileAnswer(value)) continue;

        for (const file of value as UploadedFile[]) {
          const label = question.fileLabel?.trim() || question.title;
          const name = dedupeName(usedFiles, makeAttachmentName(prefix, label, file.name));
          if (!bucket) {
            zip.file(`${folderName}${name}.링크없음.txt`, "Storage가 설정되지 않아 파일을 가져올 수 없습니다.");
            continue;
          }
          try {
            const [buffer] = await bucket.file(file.path).download();
            zip.file(`${folderName}${name}`, buffer);
          } catch {
            zip.file(`${folderName}${name}.누락.txt`, `원본 파일을 찾을 수 없습니다: ${file.path}`);
          }
        }
      }

      // 2) 응답 요약 엑셀
      const summary = await buildSummaryWorkbook(config, record);
      zip.file(`${folderName}${prefix}_요약.xlsx`, summary);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

    const baseName = single
      ? makePrefix(extractNameParts(config, records[0].answers))
      : `${safeName(config.title)}_전체제출`;
    const filename = `${baseName}.zip`;

    return new NextResponse(zipBuffer as unknown as ArrayBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "ZIP 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
