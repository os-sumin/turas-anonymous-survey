import ExcelJS from "exceljs";
import { buildHeaders, formatAnswer, formatKST, isFileAnswer } from "./response-store";
import type { SurveyConfig, SurveyTargetSnapshot, UploadedFile } from "./types";
import {
  COMPANY_CORRECTIONS_ID,
  CONTRACT_CORRECTION_ID,
  CONTRACT_MATCH_ID,
  formatTargetFieldValue,
  getPersonalizationBlocks,
  targetFieldValue,
  visibleBlockFields
} from "./personalization";

type ResponseLike = {
  responseId: string;
  submittedAt: string;
  answers: Record<string, unknown>;
  target?: SurveyTargetSnapshot;
};

/**
 * 응답 1건을 세로형(문항 | 답변) 요약 시트로 만든다.
 * 기업별 ZIP 안에 "..._요약.xlsx" 로 넣는다.
 */
export async function buildSummaryWorkbook(
  config: SurveyConfig,
  record: ResponseLike
): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TURAS Survey";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("응답요약");
  sheet.columns = [
    { header: "구분", key: "section", width: 22 },
    { header: "문항", key: "question", width: 46 },
    { header: "답변", key: "answer", width: 60 }
  ];

  styleHeader(sheet.getRow(1));

  // 상단 메타
  addMetaRow(sheet, "설문", config.title);
  addMetaRow(sheet, "기관", config.agency);
  addMetaRow(sheet, "제출일시", formatKST(record.submittedAt));
  addMetaRow(sheet, "응답ID", record.responseId);
  if (record.target) {
    addMetaRow(sheet, "조사대상ID", record.target.targetId);
    addMetaRow(sheet, "기업ID", record.target.companyId);
    addMetaRow(sheet, "과제ID", record.target.projectId);
    addMetaRow(sheet, "계약ID", record.target.contractId);
  }
  sheet.addRow({});

  if (record.target) {
    const personalizationBlocks = getPersonalizationBlocks(config);
    const companyBlock = personalizationBlocks.find((block) => block.source === "company");
    const contractBlock = personalizationBlocks.find((block) => block.source === "contract");
    const correctionSource = record.answers[COMPANY_CORRECTIONS_ID];
    const corrections =
      correctionSource && typeof correctionSource === "object" && !Array.isArray(correctionSource)
        ? correctionSource as Record<string, unknown>
        : {};
    if (companyBlock) {
      for (const field of visibleBlockFields(companyBlock)) {
        sheet.addRow({
          section: companyBlock.title,
          question: field.label,
          answer: `KEITI 보유: ${formatTargetFieldValue(targetFieldValue(record.target, "company", field.key), field.key)}\n정정: ${String(corrections[field.key] ?? "")}`
        }).alignment = { vertical: "top", wrapText: true };
      }
    }
    if (contractBlock) {
      for (const field of visibleBlockFields(contractBlock)) {
        sheet.addRow({
          section: contractBlock.title,
          question: field.label,
          answer: formatTargetFieldValue(targetFieldValue(record.target, "contract", field.key), field.key)
        }).alignment = { vertical: "top", wrapText: true };
      }
      sheet.addRow({
        section: contractBlock.title,
        question: "일치 여부 및 정정 내용",
        answer: `${formatAnswer(record.answers[CONTRACT_MATCH_ID])}\n${formatAnswer(record.answers[CONTRACT_CORRECTION_ID])}`.trim()
      }).alignment = { vertical: "top", wrapText: true };
    }
    sheet.addRow({});
  }

  for (const section of config.sections) {
    for (const question of section.questions) {
      const value = record.answers[question.id];
      const answerText = isFileAnswer(value)
        ? (value as UploadedFile[]).map((file) => file.name).join("\n")
        : formatAnswer(value);

      const row = sheet.addRow({
        section: section.title,
        question: question.title,
        answer: answerText
      });
      row.alignment = { vertical: "top", wrapText: true };
    }
  }

  sheet.getColumn("section").font = { color: { argb: "FF64748B" } };
  sheet.getColumn("question").font = { bold: true };

  return workbook.xlsx.writeBuffer();
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 28;
}

function addMetaRow(sheet: ExcelJS.Worksheet, label: string, value: string) {
  const row = sheet.addRow({ section: label, question: value });
  sheet.mergeCells(`B${row.number}:C${row.number}`);
  row.getCell("section").font = { bold: true, color: { argb: "FF334155" } };
  row.getCell("section").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  row.alignment = { vertical: "middle" };
}
