import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { loadSurveyConfig } from "@/lib/survey-store";
import {
  buildHeaders,
  createDownloadUrl,
  formatAnswer,
  getResponseCount,
  isFileAnswer,
  listResponses
} from "@/lib/response-store";
import type { UploadedFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 특정 설문의 응답 현황 + 목록 */
export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ ok: false, message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  try {
    if (!isFirebaseConfigured()) {
      return NextResponse.json({ ok: false, message: "Firebase가 설정되지 않았습니다." }, { status: 503 });
    }

    const surveyId = new URL(request.url).searchParams.get("surveyId");
    if (!surveyId) {
      return NextResponse.json({ ok: false, message: "surveyId가 없습니다." }, { status: 400 });
    }

    const config = await loadSurveyConfig(surveyId);
    if (!config) {
      return NextResponse.json({ ok: false, message: "설문을 찾을 수 없습니다." }, { status: 404 });
    }

    const [count, records] = await Promise.all([
      getResponseCount(surveyId),
      listResponses(surveyId, 300)
    ]);

    const headers = buildHeaders(config);

    // 첨부파일에는 다운로드 URL을 붙인다
    const rows = await Promise.all(
      records.map(async (record) => {
        const cells: Record<string, { text: string; files?: { name: string; url: string | null }[] }> = {};

        for (const header of headers) {
          const value = record.answers[header.id];

          if (isFileAnswer(value)) {
            const files = await Promise.all(
              (value as UploadedFile[]).map(async (file) => ({
                name: file.name,
                url: await createDownloadUrl(file.path, 1)
              }))
            );
            cells[header.id] = { text: formatAnswer(value), files };
          } else {
            cells[header.id] = { text: formatAnswer(value) };
          }
        }

        return { responseId: record.responseId, submittedAt: record.submittedAt, cells };
      })
    );

    return NextResponse.json({
      ok: true,
      survey: { id: config.id, title: config.title, agency: config.agency, endAt: config.endAt },
      count,
      headers,
      rows,
      truncated: records.length >= 300
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
