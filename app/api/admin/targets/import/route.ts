import ExcelJS from "exceljs";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-auth";
import { isFirebaseConfigured } from "@/lib/firebase-admin";
import { loadSurveyConfig } from "@/lib/survey-store";
import { isPersonalizedSurvey, issueSurveyTargets, type SurveyTargetInput } from "@/lib/target-store";
import { styleTargetSheet, TARGET_TEMPLATE_HEADERS } from "@/lib/target-excel";
import { getPersonalizationBlocks, visibleBlockFields } from "@/lib/personalization";
import { cellText as dynamicCellText, detectExcelTable, normalizeExcelHeader } from "@/lib/target-excel-reader";
import type { PersonalizationFieldConfig, SurveyConfig } from "@/lib/types";

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
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    if (fileBuffer.length < 4 || fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4b) {
      return jsonError("올바른 Excel 통합문서(.xlsx)가 아닙니다. Excel에서 ‘다른 이름으로 저장’ 후 다시 올려 주세요.", 400);
    }
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer as unknown as ExcelJS.Buffer);
    } catch (error) {
      console.error("[target-import] 엑셀 통합문서 해석 실패", error);
      return jsonError(
        "엑셀 파일을 읽지 못했습니다. 암호가 걸리지 않은 .xlsx 파일인지 확인하고 Excel에서 다시 저장한 뒤 올려 주세요.",
        400
      );
    }
    if (config.personalization?.excelSchema) {
      return importDynamicTargets(workbook, config, surveyId, baseUrl);
    }
    const detected = findTargetTable(workbook);
    if (!detected) {
      return jsonError("조사대상 표를 찾지 못했습니다. 계약ID·과제번호·기술실시기업 열을 확인해 주세요.", 400);
    }
    const { sheet, headerMap, headerRowNumber, targetStatusColumn } = detected;

    const requiredHeaders = new Set<HeaderName>(["과제ID", "계약ID", "기업명"]);
    const missing = [...requiredHeaders].filter((header) => !headerMap.has(header));
    if (missing.length > 0) return jsonError(`필수 열이 없습니다: ${missing.join(", ")}`, 400);

    const displayedHeaders = new Set<HeaderName>();
    for (const block of getPersonalizationBlocks(config)) {
      for (const field of visibleBlockFields(block)) displayedHeaders.add(field.header as HeaderName);
    }

    const inputs: SurveyTargetInput[] = [];
    const sourceRows: Record<HeaderName, string | number | null>[] = [];
    const warningFlags: boolean[] = [];
    let skippedCount = 0;
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const projectId = readText(row, headerMap, "과제ID");
      const contractId = readText(row, headerMap, "계약ID");
      const companyName = readText(row, headerMap, "기업명");
      if (!projectId && !contractId && !companyName) continue;

      const targetStatus = targetStatusColumn ? cellText(row.getCell(targetStatusColumn).value) : "";
      if (targetStatusColumn && targetStatus && targetStatus !== "조사대상") {
        skippedCount += 1;
        continue;
      }

      if (!projectId || !contractId || !companyName) {
        return jsonError(`${sheet.name} 시트 ${rowNumber}행의 계약ID·과제번호·기술실시기업 값을 확인해 주세요.`, 400);
      }

      const companyId = readText(row, headerMap, "기업ID") || stableId("COMP", companyName);
      const contractName = readText(row, headerMap, "기술실시계약명");

      const amount = readAmount(row, headerMap, "계약금액(기술료)");
      const source = Object.fromEntries(
        TARGET_TEMPLATE_HEADERS.map((header) => [header, header === "계약금액(기술료)" ? amount : readText(row, headerMap, header)])
      ) as Record<HeaderName, string | number | null>;
      source["기업ID"] = companyId;
      source["과제ID"] = projectId;
      source["계약ID"] = contractId;
      source["기업명"] = companyName;
      source["연구개발과제명"] = readText(row, headerMap, "연구개발과제명") || contractName;
      const missingValues = [...displayedHeaders].filter((header) => {
        const value = source[header];
        return value === null || value === undefined || String(value).trim() === "";
      });

      inputs.push({
        companyId,
        projectId,
        contractId,
        company: {
          name: companyName,
          businessNumber: readText(row, headerMap, "사업자등록번호"),
          representative: readText(row, headerMap, "대표자명"),
          region: readText(row, headerMap, "소재지(시·도)"),
          size: readText(row, headerMap, "기업규모"),
          industry: readText(row, headerMap, "주요업종")
        },
        contract: {
          projectName: String(source["연구개발과제명"] || ""),
          transferInstitution: readText(row, headerMap, "기술이전기관(연구기관)"),
          contractName,
          signedAt: readText(row, headerMap, "계약체결일"),
          periodStart: readText(row, headerMap, "실시 시작일"),
          periodEnd: readText(row, headerMap, "실시 종료일"),
          amount
        },
        expiresAt: readText(row, headerMap, "링크만료일시") || undefined
      });
      sourceRows.push(source);
      warningFlags.push(missingValues.length > 0);
    }

    if (inputs.length === 0) return jsonError("등록할 조사대상 행이 없습니다.", 400);

    const issued = await issueSurveyTargets(surveyId, inputs, baseUrl);
    const output = new ExcelJS.Workbook();
    output.creator = "TURAS Survey";
    const outSheet = output.addWorksheet("개별설문링크", { views: [{ state: "frozen", ySplit: 1 }] });
    outSheet.addRow([...TARGET_TEMPLATE_HEADERS, "기업 안내 코드(계약ID)", "조사대상ID", "기업 맞춤형 설문링크", "계약별 바로가기", "처리결과"]);
    issued.forEach((item, index) => {
      outSheet.addRow([
        ...TARGET_TEMPLATE_HEADERS.map((header) => sourceRows[index][header]),
        item.contractId,
        item.targetId,
        item.link,
        item.directLink,
        warningFlags[index] ? "등록 완료(표시정보 일부 없음)" : "등록 완료"
      ]);
    });
    styleTargetSheet(outSheet);
    outSheet.getColumn(TARGET_TEMPLATE_HEADERS.length + 1).width = 24;
    outSheet.getColumn(TARGET_TEMPLATE_HEADERS.length + 2).width = 36;
    outSheet.getColumn(TARGET_TEMPLATE_HEADERS.length + 3).width = 70;
    outSheet.getColumn(TARGET_TEMPLATE_HEADERS.length + 4).width = 70;
    outSheet.getColumn(TARGET_TEMPLATE_HEADERS.length + 5).width = 24;

    const buffer = await output.xlsx.writeBuffer();
    const filename = `${surveyId}_기업과제별_설문링크_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        "X-Imported-Count": String(issued.length),
        "X-Import-Warning-Count": String(warningFlags.filter(Boolean).length),
        "X-Skipped-Count": String(skippedCount)
      }
    });
  } catch (error) {
    console.error(error);
    return jsonError(error instanceof Error ? error.message : "조사대상 등록 중 오류가 발생했습니다.", 500);
  }
}

async function importDynamicTargets(workbook: ExcelJS.Workbook, config: SurveyConfig, surveyId: string, baseUrl: string) {
  const schema = config.personalization?.excelSchema;
  if (!schema) return jsonError("엑셀 열 연결 설정이 없습니다.", 400);
  const detected = detectExcelTable(workbook);
  if (!detected) return jsonError("조사대상 표를 찾지 못했습니다.", 400);
  const allFields = getPersonalizationBlocks(config).flatMap((block) => block.fields)
    .filter((field): field is PersonalizationFieldConfig & { sourceHeader: string } => Boolean(field.sourceHeader));
  const configuredByHeader = new Map(allFields.map((field) => [normalizeExcelHeader(field.sourceHeader), field]));
  const actualByHeader = new Map(detected.columns.map((column) => [normalizeExcelHeader(column.sourceHeader), column.column]));
  const missingHeaders = [...configuredByHeader.keys()].filter((header) => !actualByHeader.has(header));
  if (missingHeaders.length) {
    const names = allFields.filter((field) => missingHeaders.includes(normalizeExcelHeader(field.sourceHeader))).map((field) => field.sourceHeader);
    return jsonError(`연결된 엑셀 열이 없습니다: ${names.join(", ")}. 설문 편집기에서 엑셀 열을 다시 불러와 주세요.`, 400);
  }
  const fieldByKey = new Map(allFields.map((field) => [field.key, field]));
  const readKey = (row: ExcelJS.Row, key?: string) => {
    if (!key) return "";
    const field = fieldByKey.get(key);
    const column = field ? actualByHeader.get(normalizeExcelHeader(field.sourceHeader)) : undefined;
    return column ? dynamicCellText(row.getCell(column).value) : "";
  };
  for (const [name, label] of [[schema.keyColumns.contractId, "계약ID"], [schema.keyColumns.projectId, "과제번호"], [schema.keyColumns.companyName, "기업명"]] as const) {
    if (!name || !fieldByKey.has(name)) return jsonError(`${label} 식별 열 연결을 설문 편집기에서 지정해 주세요.`, 400);
  }

  const inputs: SurveyTargetInput[] = [];
  const outputRows: Array<Array<string | number | null>> = [];
  let skippedCount = 0;
  for (let rowNumber = detected.headerRow + 1; rowNumber <= detected.sheet.rowCount; rowNumber += 1) {
    const row = detected.sheet.getRow(rowNumber);
    const contractId = readKey(row, schema.keyColumns.contractId);
    const projectId = readKey(row, schema.keyColumns.projectId);
    const companyName = readKey(row, schema.keyColumns.companyName);
    if (!contractId && !projectId && !companyName) continue;
    const status = readKey(row, schema.keyColumns.targetStatus);
    if (schema.keyColumns.targetStatus && status && status !== "조사대상") { skippedCount += 1; continue; }
    if (!contractId || !projectId || !companyName) {
      return jsonError(`${detected.sheet.name} 시트 ${rowNumber}행의 계약ID·과제번호·기업명 값을 확인해 주세요.`, 400);
    }
    const companyId = readKey(row, schema.keyColumns.companyId) || stableId("COMP", companyName);
    const sourceData: Record<string, string | number | null> = {};
    allFields.forEach((field) => {
      const column = actualByHeader.get(normalizeExcelHeader(field.sourceHeader));
      sourceData[field.key] = column ? dynamicCellText(row.getCell(column).value) : "";
    });
    const byHeader = (aliases: string[]) => {
      const normalized = new Set(aliases.map(normalizeExcelHeader));
      const field = allFields.find((item) => normalized.has(normalizeExcelHeader(item.sourceHeader)));
      return field ? String(sourceData[field.key] ?? "") : "";
    };
    const amountText = byHeader(["계약금액(기술료)", "계약금액_최종", "계약금액"]);
    const amount = amountText ? Number(amountText.replace(/[^0-9.-]/g, "")) : null;
    inputs.push({
      companyId, projectId, contractId, sourceData,
      company: {
        name: companyName,
        businessNumber: byHeader(["사업자등록번호"]), representative: byHeader(["대표자명"]),
        region: byHeader(["소재지(시·도)", "소재지"]), size: byHeader(["기업규모"]), industry: byHeader(["주요업종", "업종"])
      },
      contract: {
        projectName: byHeader(["연구개발과제명", "과제명", "계약명"]),
        transferInstitution: byHeader(["기술이전기관(연구기관)", "비영리기관/기술보유기관"]),
        contractName: byHeader(["기술실시계약명", "계약명"]), signedAt: byHeader(["계약체결일", "계약일_최종"]),
        periodStart: byHeader(["실시 시작일"]), periodEnd: byHeader(["실시 종료일"]),
        amount: amount !== null && Number.isFinite(amount) ? amount : null
      },
      expiresAt: readKey(row, schema.keyColumns.expiresAt) || undefined
    });
    outputRows.push(detected.columns.map((column) => dynamicCellText(row.getCell(column.column).value)));
  }
  if (!inputs.length) return jsonError("등록할 조사대상 행이 없습니다.", 400);
  const issued = await issueSurveyTargets(surveyId, inputs, baseUrl);
  const output = new ExcelJS.Workbook();
  const outSheet = output.addWorksheet("개별설문링크", { views: [{ state: "frozen", ySplit: 1 }] });
  outSheet.addRow([...detected.columns.map((column) => column.sourceHeader), "기업 안내 코드(계약ID)", "조사대상ID", "기업 맞춤형 설문링크", "계약별 바로가기", "처리결과"]);
  issued.forEach((item, index) => outSheet.addRow([...outputRows[index], item.contractId, item.targetId, item.link, item.directLink, "등록 완료"]));
  styleTargetSheet(outSheet);
  const buffer = await output.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${surveyId}_기업과제별_설문링크_${new Date().toISOString().slice(0, 10)}.xlsx`)}`,
      "Cache-Control": "no-store", "X-Imported-Count": String(issued.length), "X-Skipped-Count": String(skippedCount)
    }
  });
}

function readHeaderMap(sheet: ExcelJS.Worksheet, rowNumber: number): Map<HeaderName, number> {
  const result = new Map<HeaderName, number>();
  const aliases = new Map<string, HeaderName>();
  for (const header of TARGET_TEMPLATE_HEADERS) aliases.set(normalizeHeader(header), header);
  aliases.set(normalizeHeader("과제번호"), "과제ID");
  aliases.set(normalizeHeader("기업관리ID"), "기업ID");
  aliases.set(normalizeHeader("계약번호"), "계약ID");
  aliases.set(normalizeHeader("기술실시기업"), "기업명");
  aliases.set(normalizeHeader("비영리기관/기술보유기관"), "기술이전기관(연구기관)");
  aliases.set(normalizeHeader("계약명"), "기술실시계약명");
  aliases.set(normalizeHeader("계약 체결일"), "계약체결일");
  aliases.set(normalizeHeader("계약일_최종"), "계약체결일");
  aliases.set(normalizeHeader("계약금액"), "계약금액(기술료)");
  aliases.set(normalizeHeader("계약금액_최종"), "계약금액(기술료)");

  sheet.getRow(rowNumber).eachCell((cell, column) => {
    const canonical = aliases.get(normalizeHeader(cellText(cell.value)));
    if (canonical) result.set(canonical, column);
  });
  return result;
}

function findTargetTable(workbook: ExcelJS.Workbook): {
  sheet: ExcelJS.Worksheet;
  headerMap: Map<HeaderName, number>;
  headerRowNumber: number;
  targetStatusColumn?: number;
} | null {
  const sheets = [...workbook.worksheets].sort((a, b) => {
    if (a.name === "최종계약목록") return -1;
    if (b.name === "최종계약목록") return 1;
    return 0;
  });

  let best: ReturnType<typeof findSheetHeader> | null = null;
  for (const sheet of sheets) {
    const found = findSheetHeader(sheet);
    if (found && (!best || found.headerMap.size > best.headerMap.size)) best = found;
    if (found?.headerMap.has("계약ID") && found.headerMap.has("과제ID") && found.headerMap.has("기업명")) {
      return found;
    }
  }
  return best && best.headerMap.has("계약ID") ? best : null;
}

function findSheetHeader(sheet: ExcelJS.Worksheet) {
  let best: {
    sheet: ExcelJS.Worksheet;
    headerMap: Map<HeaderName, number>;
    headerRowNumber: number;
    targetStatusColumn?: number;
  } | null = null;
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
    const headerMap = readHeaderMap(sheet, rowNumber);
    if (!best || headerMap.size > best.headerMap.size) {
      let targetStatusColumn: number | undefined;
      sheet.getRow(rowNumber).eachCell((cell, column) => {
        if (normalizeHeader(cellText(cell.value)) === normalizeHeader("조사대상 여부")) targetStatusColumn = column;
      });
      best = { sheet, headerMap, headerRowNumber: rowNumber, targetStatusColumn };
    }
  }
  return best;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${crypto.createHash("sha256").update(value.trim()).digest("hex").slice(0, 16).toUpperCase()}`;
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
