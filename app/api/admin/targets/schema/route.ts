import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-auth";
import { detectExcelTable, suggestKeyColumn } from "@/lib/target-excel-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guardAdmin(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, message: "엑셀 파일이 필요합니다." }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const table = detectExcelTable(workbook);
    if (!table) return NextResponse.json({ ok: false, message: "열 이름이 있는 표를 찾지 못했습니다." }, { status: 400 });
    const columns = table.columns.map(({ key, sourceHeader }) => ({ key, sourceHeader }));
    return NextResponse.json({
      ok: true,
      sheetName: table.sheet.name,
      headerRow: table.headerRow,
      columns,
      suggested: {
        contractId: suggestKeyColumn(table.columns, ["계약ID", "계약번호"]),
        projectId: suggestKeyColumn(table.columns, ["과제번호", "과제ID"]),
        companyName: suggestKeyColumn(table.columns, ["기술실시기업", "기업명"]),
        companyId: suggestKeyColumn(table.columns, ["기업ID", "기업관리ID"]),
        targetStatus: suggestKeyColumn(table.columns, ["조사대상 여부"]),
        expiresAt: suggestKeyColumn(table.columns, ["링크만료일시"])
      }
    });
  } catch (error) {
    console.error("[target-schema]", error);
    return NextResponse.json({ ok: false, message: "엑셀을 읽지 못했습니다. 암호가 없는 .xlsx 파일인지 확인해 주세요." }, { status: 400 });
  }
}
