import type ExcelJS from "exceljs";

export const TARGET_TEMPLATE_HEADERS = [
  "기업ID",
  "과제ID",
  "계약ID",
  "기업명",
  "사업자등록번호",
  "대표자명",
  "소재지(시·도)",
  "기업규모",
  "주요업종",
  "연구개발과제명",
  "기술이전기관(연구기관)",
  "기술실시계약명",
  "계약체결일",
  "계약금액(기술료)",
  "링크만료일시"
] as const;

export function styleTargetSheet(sheet: ExcelJS.Worksheet) {
  const widths = [16, 18, 18, 22, 18, 14, 16, 12, 22, 38, 28, 32, 16, 20, 30];
  sheet.columns.forEach((column, index) => {
    column.width = widths[index] || 22;
  });
  [1, 2, 3, 5, 13, 15].forEach((index) => {
    sheet.getColumn(index).numFmt = "@";
  });
  sheet.getColumn(14).numFmt = "#,##0";
  const header = sheet.getRow(1);
  header.height = 32;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: "top", wrapText: true };
  });
}
