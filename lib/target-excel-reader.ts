import crypto from "crypto";
import type ExcelJS from "exceljs";

export type DetectedExcelColumn = {
  key: string;
  sourceHeader: string;
  column: number;
};

export type DetectedExcelTable = {
  sheet: ExcelJS.Worksheet;
  headerRow: number;
  columns: DetectedExcelColumn[];
};

export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined && value.result !== null) return String(value.result).trim();
    if ("text" in value) return String(value.text || "").trim();
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  }
  return String(value).trim();
}

export function normalizeExcelHeader(value: string): string {
  return value.replace(/\s+/g, "").replace(/[·ㆍ]/g, "").trim().toLowerCase();
}

export function makeExcelFieldKey(header: string, column: number): string {
  const hash = crypto.createHash("sha1").update(normalizeExcelHeader(header)).digest("hex").slice(0, 8);
  return `excel_${column}_${hash}`;
}

export function detectExcelTable(workbook: ExcelJS.Workbook): DetectedExcelTable | null {
  const sheets = [...workbook.worksheets].sort((a, b) => {
    if (a.name === "최종계약목록") return -1;
    if (b.name === "최종계약목록") return 1;
    return 0;
  });
  let best: DetectedExcelTable | null = null;
  let bestScore = -1;
  for (const sheet of sheets) {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 30); rowNumber += 1) {
      const headers: Array<{ header: string; column: number }> = [];
      sheet.getRow(rowNumber).eachCell((cell, column) => {
        const header = cellText(cell.value);
        if (header) headers.push({ header, column });
      });
      if (headers.length < 3) continue;
      const normalized = new Set(headers.map((item) => normalizeExcelHeader(item.header)));
      const identityHits = ["계약id", "계약번호", "과제번호", "과제id", "기술실시기업", "기업명"]
        .filter((name) => normalized.has(normalizeExcelHeader(name))).length;
      const score = headers.length + identityHits * 20 + (sheet.name === "최종계약목록" ? 10 : 0);
      if (score <= bestScore) continue;
      const used = new Map<string, number>();
      const columns = headers.map(({ header, column }) => {
        const base = makeExcelFieldKey(header, column);
        const count = used.get(base) || 0;
        used.set(base, count + 1);
        return { key: count ? `${base}_${count + 1}` : base, sourceHeader: header, column };
      });
      best = { sheet, headerRow: rowNumber, columns };
      bestScore = score;
    }
  }
  return best;
}

export function suggestKeyColumn(columns: DetectedExcelColumn[], aliases: string[]): string {
  const names = new Set(aliases.map(normalizeExcelHeader));
  return columns.find((column) => names.has(normalizeExcelHeader(column.sourceHeader)))?.key || "";
}
