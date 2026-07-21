import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { isAdminAuthorized } from "@/lib/admin-auth";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { loadSurveyConfig } from "@/lib/survey-store";
import {
  buildHeaders,
  createDownloadUrl,
  formatAnswer,
  formatKST,
  isFileAnswer,
  listResponses
} from "@/lib/response-store";
import type { UploadedFile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 응답 전체를 엑셀(.xlsx)로 내려받기 */
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

    const headers = buildHeaders(config);
    const records = await listResponses(surveyId, 5000);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TURAS Survey";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("응답내역", {
      views: [{ state: "frozen", ySplit: 1 }]
    });

    sheet.columns = [
      { header: "번호", key: "no", width: 6 },
      { header: "제출일시", key: "submittedAt", width: 20 },
      { header: "응답ID", key: "responseId", width: 38 },
      ...headers.map((header) => ({
        header: header.title,
        key: header.id,
        width: header.type === "textarea" ? 50 : 24
      }))
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.height = 34;

    for (const [index, record] of records.entries()) {
      const row: Record<string, string | number> = {
        no: index + 1,
        submittedAt: formatKST(record.submittedAt),
        responseId: record.responseId
      };

      for (const header of headers) {
        row[header.id] = formatAnswer(record.answers[header.id]);
      }

      const added = sheet.addRow(row);
      added.alignment = { vertical: "top", wrapText: true };

      // 첨부파일 셀에는 다운로드 하이퍼링크를 건다 (7일 유효)
      for (const header of headers) {
        const value = record.answers[header.id];
        if (!isFileAnswer(value)) continue;

        const files = value as UploadedFile[];
        const url = await createDownloadUrl(files[0].path, 7);
        if (!url) continue;

        const cell = added.getCell(header.id);
        cell.value = { text: formatAnswer(value), hyperlink: url };
        cell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
    }

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 3 + headers.length }
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `${surveyId}_응답내역_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "엑셀 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
