import type { SurveyConfig } from "./types";

export const COMPANY_CORRECTIONS_ID = "keiti_1_1_corrections";
export const CONTRACT_MATCH_ID = "keiti_1_3_match";
export const CONTRACT_CORRECTION_ID = "keiti_1_3_correction";

export const COMPANY_FIELDS = [
  { key: "name", label: "① 기업명" },
  { key: "businessNumber", label: "② 사업자등록번호" },
  { key: "representative", label: "③ 대표자명" },
  { key: "region", label: "④ 소재지(시·도)" },
  { key: "size", label: "⑤ 기업규모" },
  { key: "industry", label: "⑥ 주요 업종" }
] as const;

export const CONTRACT_FIELDS = [
  { key: "projectName", label: "① 연구개발과제명" },
  { key: "transferInstitution", label: "② 기술이전기관(연구기관)" },
  { key: "contractName", label: "③ 기술실시계약명" },
  { key: "signedAt", label: "④ 계약 체결일" },
  { key: "amount", label: "⑤ 계약금액(기술료)" }
] as const;

export const CONTRACT_MATCH_OPTIONS = [
  "모두 일치",
  "계약금액이 다름",
  "기타 항목이 다름",
  "확인이 어려움"
] as const;

export type CompanyCorrectionKey = (typeof COMPANY_FIELDS)[number]["key"];

type ValidationResult =
  | { ok: true; answers: Record<string, unknown> }
  | { ok: false; message: string };

export function hasCompanyVerification(config: SurveyConfig): boolean {
  return Boolean(config.personalization?.enabled && config.personalization.companyVerification !== false);
}

export function hasContractVerification(config: SurveyConfig): boolean {
  return Boolean(config.personalization?.enabled && config.personalization.contractVerification !== false);
}

/** 1-1·1-3 전용 응답은 일반 문항 검증과 분리해 허용된 키·값만 저장한다. */
export function validatePersonalizedAnswers(
  config: SurveyConfig,
  rawAnswers: Record<string, unknown>
): ValidationResult {
  const clean: Record<string, unknown> = {};

  if (hasCompanyVerification(config)) {
    const raw = rawAnswers[COMPANY_CORRECTIONS_ID];
    if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) {
      return { ok: false, message: "1-1 기업정보 정정사항의 형식이 올바르지 않습니다." };
    }

    const corrections: Record<string, string> = {};
    const source = (raw || {}) as Record<string, unknown>;
    for (const field of COMPANY_FIELDS) {
      const value = source[field.key];
      if (value === undefined || value === null || String(value).trim() === "") continue;
      corrections[field.key] = String(value).trim().slice(0, 500);
    }
    clean[COMPANY_CORRECTIONS_ID] = corrections;
  }

  if (hasContractVerification(config)) {
    const rawMatch = rawAnswers[CONTRACT_MATCH_ID];
    if (!Array.isArray(rawMatch) || !rawMatch.every((value) => typeof value === "string")) {
      return { ok: false, message: "1-3 기술실시계약 정보의 일치 여부를 선택해 주세요." };
    }

    const selected = Array.from(new Set(rawMatch)).filter((value) =>
      (CONTRACT_MATCH_OPTIONS as readonly string[]).includes(value)
    );
    if (selected.length !== rawMatch.length || selected.length === 0) {
      return { ok: false, message: "1-3 기술실시계약 정보의 일치 여부를 선택해 주세요." };
    }

    const hasExclusive = selected.includes("모두 일치") || selected.includes("확인이 어려움");
    if (hasExclusive && selected.length > 1) {
      return { ok: false, message: "‘모두 일치’와 ‘확인이 어려움’은 다른 항목과 함께 선택할 수 없습니다." };
    }

    const correction = String(rawAnswers[CONTRACT_CORRECTION_ID] ?? "").trim().slice(0, 3000);
    const needsCorrection = selected.includes("계약금액이 다름") || selected.includes("기타 항목이 다름");
    if (needsCorrection && !correction) {
      return { ok: false, message: "1-3에서 다른 항목을 선택한 경우 정정 내용을 입력해 주세요." };
    }

    clean[CONTRACT_MATCH_ID] = selected;
    clean[CONTRACT_CORRECTION_ID] = correction;
  }

  return { ok: true, answers: clean };
}

