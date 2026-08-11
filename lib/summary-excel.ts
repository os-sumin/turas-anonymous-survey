import ExcelJS from "exceljs";
import { buildHeaders, formatAnswer, formatKST, isFileAnswer } from "./response-store";
import type { SurveyConfig, UploadedFile } from "./types";

type ResponseLike = {
  responseId: string;
  submittedAt: string;
  answers: Record<string, unknown>;
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
  sheet.addRow({});

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
