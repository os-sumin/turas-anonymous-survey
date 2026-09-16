import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-auth";
import { styleTargetSheet, TARGET_TEMPLATE_HEADERS } from "@/lib/target-excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = guardAdmin(request);
  if (denied) return denied;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TURAS Survey";
  const sheet = workbook.addWorksheet("조사대상", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.addRow(TARGET_TEMPLATE_HEADERS);
  styleTargetSheet(sheet);

  const example = workbook.addWorksheet("작성예시", { views: [{ state: "frozen", ySplit: 1 }] });
  example.addRow(TARGET_TEMPLATE_HEADERS);
  example.addRow([
    "COMP-001",
    "PRJ-001",
    "CONT-001",
    "예시기업",
    "123-45-67890",
    "홍길동",
    "서울",
    "중소",
    "환경서비스업",
    "환경기술 연구개발 예시과제",
    "예시연구원",
    "환경기술 실시계약",
    "2026-01-15",
    10000000,
    "2026-10-31T23:59:59+09:00"
  ]);
  styleTargetSheet(example);
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("TURAS_맞춤형설문_조사대상_업로드양식.xlsx")}`,
      "Cache-Control": "no-store"
    }
  });
}
