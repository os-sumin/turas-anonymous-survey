import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-auth";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { loadSurveyConfig } from "@/lib/survey-store";
import { isPersonalizedSurvey, issueSurveyTargets, type SurveyTargetInput } from "@/lib/target-store";
import { styleTargetSheet, TARGET_TEMPLATE_HEADERS } from "@/lib/target-excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type HeaderName = (typeof TARGET_TEMPLATE_HEADERS)[number];

export async function POST(request: Request) {
  const denied = guardAdmin(request);
  if (denied) return denied;

  try {
    if (!isFirebaseConfigured()) return jsonError("Firebase가 설정되지 않았습니다.", 503);

    const form = await request.formData();
    const surveyId = String(form.get("survey_id") || "").trim();
    const baseUrlInput = String(form.get("base_url") || "").trim();
    const file = form.get("file");
    if (!surveyId || !(file instanceof File)) return jsonError("설문 ID와 엑셀 파일이 필요합니다.", 400);

    const config = await loadSurveyConfig(surveyId);
    if (!config) return jsonError("설문을 찾을 수 없습니다.", 404);
    if (!isPersonalizedSurvey(config)) {
      return jsonError("설문 편집 화면에서 ‘기업·과제별 맞춤형 설문’을 먼저 켜고 저장해 주세요.", 400);
    }

    const baseUrl = validBaseUrl(baseUrlInput) || new URL(request.url).origin;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer() as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return jsonError("엑셀에 시트가 없습니다.", 400);

    const headerMap = readHeaderMap(sheet);
    const missing = TARGET_TEMPLATE_HEADERS.filter((header) => header !== "계약ID" && header !== "링크만료일시" && !headerMap.has(header));
    if (missing.length > 0) return jsonError(`필수 열이 없습니다: ${missing.join(", ")}`, 400);

    const inputs: SurveyTargetInput[] = [];
    const sourceRows: Record<HeaderName, string | number | null>[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const companyId = readText(row, headerMap, "기업ID");
      const projectId = readText(row, headerMap, "과제ID");
      const companyName = readText(row, headerMap, "기업명");
      if (!companyId && !projectId && !companyName) continue;
      if (!companyId || !projectId) return jsonError(`${rowNumber}행의 기업ID 또는 과제ID가 비어 있습니다.`, 400);

      const amount = readAmount(row, headerMap, "계약금액(기술료)");
      const source = Object.fromEntries(
        TARGET_TEMPLATE_HEADERS.map((header) => [header, header === "계약금액(기술료)" ? amount : readText(row, headerMap, header)])
      ) as Record<HeaderName, string | number | null>;

      inputs.push({
        companyId,
        projectId,
        contractId: readText(row, headerMap, "계약ID"),
        company: {
          name: companyName,
          businessNumber: readText(row, headerMap, "사업자등록번호"),
          representative: readText(row, headerMap, "대표자명"),
          region: readText(row, headerMap, "소재지(시·도)"),
          size: readText(row, headerMap, "기업규모"),
          industry: readText(row, headerMap, "주요업종")
        },
        contract: {
          projectName: readText(row, headerMap, "연구개발과제명"),
          transferInstitution: readText(row, headerMap, "기술이전기관(연구기관)"),
          contractName: readText(row, headerMap, "기술실시계약명"),
          signedAt: readText(row, headerMap, "계약체결일"),
          amount
        },
        expiresAt: readText(row, headerMap, "링크만료일시") || undefined
      });
      sourceRows.push(source);
    }

    if (inputs.length === 0) return jsonError("등록할 조사대상 행이 없습니다.", 400);

    const issued = await issueSurveyTargets(surveyId, inputs, baseUrl);
    const output = new ExcelJS.Workbook();
    output.creator = "TURAS Survey";
    const outSheet = output.addWorksheet("개별설문링크", { views: [{ state: "frozen", ySplit: 1 }] });
    outSheet.addRow([...TARGET_TEMPLATE_HEADERS, "조사대상ID", "설문링크", "처리결과"]);
    issued.forEach((item, index) => {
      outSheet.addRow([
        ...TARGET_TEMPLATE_HEADERS.map((header) => sourceRows[index][header]),
        item.targetId,
        item.link,
        "등록 완료"
      ]);
    });
    styleTargetSheet(outSheet);
    outSheet.getColumn(TARGET_TEMPLATE_HEADERS.length + 1).width = 36;
    outSheet.getColumn(TARGET_TEMPLATE_HEADERS.length + 2).width = 70;
    outSheet.getColumn(TARGET_TEMPLATE_HEADERS.length + 3).width = 14;

    const buffer = await output.xlsx.writeBuffer();
    const filename = `${surveyId}_기업과제별_설문링크_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "X-Imported-Count": String(issued.length)
      }
    });
  } catch (error) {
    console.error(error);
    return jsonError(error instanceof Error ? error.message : "조사대상 등록 중 오류가 발생했습니다.", 500);
  }
}

function readHeaderMap(sheet: ExcelJS.Worksheet): Map<HeaderName, number> {
  const result = new Map<HeaderName, number>();
  const aliases = new Map<string, HeaderName>();
  for (const header of TARGET_TEMPLATE_HEADERS) aliases.set(normalizeHeader(header), header);
  aliases.set(normalizeHeader("과제번호"), "과제ID");
  aliases.set(normalizeHeader("기업관리ID"), "기업ID");
  aliases.set(normalizeHeader("계약번호"), "계약ID");
  aliases.set(normalizeHeader("계약 체결일"), "계약체결일");
  aliases.set(normalizeHeader("계약금액"), "계약금액(기술료)");

  sheet.getRow(1).eachCell((cell, column) => {
    const canonical = aliases.get(normalizeHeader(cellText(cell.value)));
    if (canonical) result.set(canonical, column);
  });
  return result;
}

function readText(row: ExcelJS.Row, map: Map<HeaderName, number>, name: HeaderName): string {
  const column = map.get(name);
  if (!column) return "";
  return cellText(row.getCell(column).value);
}

function readAmount(row: ExcelJS.Row, map: Map<HeaderName, number>, name: HeaderName): number | null {
  const raw = readText(row, map, name).replace(/[^0-9.-]/g, "");
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined && value.result !== null) return String(value.result).trim();
    if ("text" in value) return String(value.text || "").trim();
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim();
  }
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, "").replace(/[·ㆍ]/g, "").trim();
}

function validBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}
