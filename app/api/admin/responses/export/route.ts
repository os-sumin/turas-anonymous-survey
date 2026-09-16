import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-auth";
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
import {
  COMPANY_CORRECTIONS_ID,
  CONTRACT_CORRECTION_ID,
  CONTRACT_MATCH_ID,
  getPersonalizationBlocks,
  targetFieldValue,
  visibleBlockFields
} from "@/lib/personalization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 응답 전체를 엑셀(.xlsx)로 내려받기 */
export async function GET(request: Request) {
  const denied = guardAdmin(request);
    if (denied) return denied;

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
    const personalizationBlocks = getPersonalizationBlocks(config);
    const companyBlock = personalizationBlocks.find((block) => block.source === "company");
    const contractBlock = personalizationBlocks.find((block) => block.source === "contract");
    const companyFields = companyBlock ? visibleBlockFields(companyBlock) : [];
    const contractFields = contractBlock ? visibleBlockFields(contractBlock) : [];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TURAS Survey";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("응답내역", {
      views: [{ state: "frozen", ySplit: 1 }]
    });

    const personalizedColumns = config.personalization?.enabled
      ? [
          { header: "조사대상ID", key: "targetId", width: 34 },
          { header: "기업ID", key: "companyId", width: 18 },
          { header: "과제ID", key: "projectId", width: 20 },
          { header: "계약ID", key: "contractId", width: 20 },
          ...companyFields.map((field) => ({
            header: `KEITI 보유_${field.label}`,
            key: `held_company_${field.key}`,
            width: 24
          })),
          ...companyFields.map((field) => ({
            header: `${companyBlock?.title || "기업정보"}_정정_${field.label}`,
            key: `correction_${field.key}`,
            width: 24
          })),
          ...contractFields.map((field) => ({
            header: `KEITI 보유_${field.label}`,
            key: `held_contract_${field.key}`,
            width: field.key === "projectName" ? 40 : 24
          })),
          ...(contractBlock
            ? [
                { header: `${contractBlock.title}_일치 여부`, key: "contractMatch", width: 28 },
                { header: `${contractBlock.title}_정정 내용`, key: "contractCorrection", width: 45 }
              ]
            : [])
        ]
      : [];

    sheet.columns = [
      { header: "번호", key: "no", width: 6 },
      { header: "제출일시", key: "submittedAt", width: 20 },
      { header: "응답ID", key: "responseId", width: 38 },
      ...personalizedColumns,
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

      if (record.target) {
        row.targetId = record.target.targetId;
        row.companyId = record.target.companyId;
        row.projectId = record.target.projectId;
        row.contractId = record.target.contractId;
        for (const field of companyFields) {
          row[`held_company_${field.key}`] = targetFieldValue(record.target, "company", field.key) ?? "";
        }
        for (const field of contractFields) {
          row[`held_contract_${field.key}`] = targetFieldValue(record.target, "contract", field.key) ?? "";
        }
      }

      const companyCorrections = record.answers[COMPANY_CORRECTIONS_ID];
      const correctionMap =
        companyCorrections && typeof companyCorrections === "object" && !Array.isArray(companyCorrections)
          ? companyCorrections as Record<string, unknown>
          : {};
      for (const field of companyFields) {
        row[`correction_${field.key}`] = String(correctionMap[field.key] ?? "");
      }
      if (contractBlock) {
        row.contractMatch = formatAnswer(record.answers[CONTRACT_MATCH_ID]);
        row.contractCorrection = formatAnswer(record.answers[CONTRACT_CORRECTION_ID]);
      }

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
      to: { row: 1, column: 3 + personalizedColumns.length + headers.length }
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
