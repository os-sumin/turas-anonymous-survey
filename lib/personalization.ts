import type {
  PersonalizationBlock,
  PersonalizationFieldConfig,
  PersonalizationSource,
  SurveyConfig,
  SurveyTarget,
  SurveyTargetSnapshot
} from "./types";

export const COMPANY_CORRECTIONS_ID = "keiti_1_1_corrections";
export const CONTRACT_MATCH_ID = "keiti_1_3_match";
export const CONTRACT_CORRECTION_ID = "keiti_1_3_correction";

export const COMPANY_FIELDS = [
  { key: "name", label: "기업명", header: "기업명" },
  { key: "businessNumber", label: "사업자등록번호", header: "사업자등록번호" },
  { key: "representative", label: "대표자명", header: "대표자명" },
  { key: "region", label: "소재지(시·도)", header: "소재지(시·도)" },
  { key: "size", label: "기업규모", header: "기업규모" },
  { key: "industry", label: "주요 업종", header: "주요업종" }
] as const;

export const CONTRACT_FIELDS = [
  { key: "projectName", label: "연구개발과제명", header: "연구개발과제명" },
  { key: "transferInstitution", label: "기술이전기관(연구기관)", header: "기술이전기관(연구기관)" },
  { key: "contractName", label: "기술실시계약명", header: "기술실시계약명" },
  { key: "signedAt", label: "계약 체결일", header: "계약체결일" },
  { key: "amount", label: "계약금액(기술료)", header: "계약금액(기술료)" }
] as const;

export const CONTRACT_MATCH_OPTIONS = [
  "모두 일치",
  "계약금액이 다름",
  "기타 항목이 다름",
  "확인이 어려움"
] as const;

export type CompanyCorrectionKey = (typeof COMPANY_FIELDS)[number]["key"];

export type PersonalizationFieldDefinition =
  | (typeof COMPANY_FIELDS)[number]
  | (typeof CONTRACT_FIELDS)[number];

type ValidationResult =
  | { ok: true; answers: Record<string, unknown> }
  | { ok: false; message: string; source: PersonalizationSource };

const DEFAULT_TITLES: Record<PersonalizationSource, string> = {
  company: "1-1. 아래 기업정보가 귀사와 일치합니까? 다른 내용이 있으면 정정하여 작성해주십시오.",
  contract: "1-3. 아래 기술실시계약 정보가 계약서와 일치합니까?"
};

export function fieldCatalog(source: PersonalizationSource): readonly PersonalizationFieldDefinition[] {
  return source === "company" ? COMPANY_FIELDS : CONTRACT_FIELDS;
}

export function sourceLabel(source: PersonalizationSource): string {
  return source === "company" ? "기업정보" : "기술실시계약 정보";
}

export function makePersonalizationBlock(
  source: PersonalizationSource,
  config: Pick<SurveyConfig, "sections">
): PersonalizationBlock {
  const firstSection = config.sections[0];
  const firstQuestion = firstSection?.questions[0];
  return {
    id: source === "company" ? "company_verification" : "contract_verification",
    source,
    title: DEFAULT_TITLES[source],
    sectionId: firstSection?.id,
    position: source === "company" ? "before_first" : firstQuestion ? "after_question" : "after_last",
    afterQuestionId: source === "contract" ? firstQuestion?.id : undefined,
    fields: fieldCatalog(source).map((field) => ({
      key: field.key,
      label: field.label,
      visible: true
    }))
  };
}

export function makeDefaultPersonalizationBlocks(
  config: Pick<SurveyConfig, "sections">
): PersonalizationBlock[] {
  return [makePersonalizationBlock("company", config), makePersonalizationBlock("contract", config)];
}

/** 구버전의 companyVerification/contractVerification 설정도 새 블록 구조로 읽는다. */
export function getPersonalizationBlocks(config: SurveyConfig): PersonalizationBlock[] {
  if (!config.personalization?.enabled) return [];
  const stored = config.personalization?.blocks;
  if (Array.isArray(stored) && stored.length > 0) {
    return stored
      .filter((block) => block && (block.source === "company" || block.source === "contract"))
      .map((block) => normalizeBlock(block, config));
  }

  const result: PersonalizationBlock[] = [];
  if (config.personalization?.companyVerification !== false) {
    result.push(makePersonalizationBlock("company", config));
  }
  if (config.personalization?.contractVerification !== false) {
    const block = makePersonalizationBlock("contract", config);
    if (config.personalization?.contractAfterQuestionId) {
      block.position = "after_question";
      block.afterQuestionId = config.personalization.contractAfterQuestionId;
    }
    result.push(block);
  }
  return result;
}

function normalizeBlock(block: PersonalizationBlock, config: SurveyConfig): PersonalizationBlock {
  const catalog = fieldCatalog(block.source);
  const known = new Map<string, PersonalizationFieldDefinition>(catalog.map((field) => [field.key, field]));
  const saved = Array.isArray(block.fields) ? block.fields : [];
  const normalized: PersonalizationFieldConfig[] = [];
  const used = new Set<string>();

  for (const field of saved) {
    const definition = known.get(field.key);
    if (!definition || used.has(field.key)) continue;
    used.add(field.key);
    normalized.push({
      key: field.key,
      label: String(field.label || definition.label).trim() || definition.label,
      visible: field.visible !== false
    });
  }
  for (const definition of catalog) {
    if (used.has(definition.key)) continue;
    normalized.push({ key: definition.key, label: definition.label, visible: false });
  }

  const firstSectionId = config.sections[0]?.id;
  const validSectionId = config.sections.some((section) => section.id === block.sectionId)
    ? block.sectionId
    : firstSectionId;
  return {
    ...block,
    id: String(block.id || `${block.source}_verification`),
    title: String(block.title || DEFAULT_TITLES[block.source]),
    sectionId: validSectionId,
    position: ["before_first", "after_question", "after_last"].includes(block.position)
      ? block.position
      : "after_last",
    fields: normalized
  };
}

export function visibleBlockFields(block: PersonalizationBlock): Array<PersonalizationFieldConfig & { header: string }> {
  const headers = new Map<string, string>(fieldCatalog(block.source).map((field) => [field.key, field.header]));
  return block.fields
    .filter((field) => field.visible && headers.has(field.key))
    .map((field) => ({ ...field, header: headers.get(field.key)! }));
}

export function blocksForSection(config: SurveyConfig, sectionId: string): PersonalizationBlock[] {
  const firstSectionId = config.sections[0]?.id;
  return getPersonalizationBlocks(config).filter((block) => (block.sectionId || firstSectionId) === sectionId);
}

export function targetFieldValue(
  target: SurveyTarget | SurveyTargetSnapshot,
  source: PersonalizationSource,
  key: string
): string | number | null {
  const record = source === "company" ? target.company : target.contract;
  const value = (record as unknown as Record<string, string | number | null>)[key];
  return value === undefined ? "" : value;
}

export function formatTargetFieldValue(value: string | number | null, key: string): string {
  if (value === null || value === "") return "보유정보 없음";
  if (key === "amount" && typeof value === "number" && Number.isFinite(value)) {
    return `${value.toLocaleString("ko-KR")}원`;
  }
  return String(value);
}

export function hasCompanyVerification(config: SurveyConfig): boolean {
  return Boolean(config.personalization?.enabled && getPersonalizationBlocks(config).some((block) => block.source === "company"));
}

export function hasContractVerification(config: SurveyConfig): boolean {
  return Boolean(config.personalization?.enabled && getPersonalizationBlocks(config).some((block) => block.source === "contract"));
}

/** 1-1·1-3 전용 응답은 일반 문항 검증과 분리해 허용된 키·값만 저장한다. */
export function validatePersonalizedAnswers(
  config: SurveyConfig,
  rawAnswers: Record<string, unknown>,
  onlySources?: PersonalizationSource[]
): ValidationResult {
  const clean: Record<string, unknown> = {};
  const blocks = getPersonalizationBlocks(config);
  const sources = new Set(
    blocks
      .map((block) => block.source)
      .filter((source) => !onlySources || onlySources.includes(source))
  );

  if (sources.has("company")) {
    const raw = rawAnswers[COMPANY_CORRECTIONS_ID];
    if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) {
      return { ok: false, message: "기업정보 정정사항의 형식이 올바르지 않습니다.", source: "company" };
    }

    const corrections: Record<string, string> = {};
    const source = (raw || {}) as Record<string, unknown>;
    const companyBlock = blocks.find((block) => block.source === "company");
    for (const field of companyBlock ? visibleBlockFields(companyBlock) : COMPANY_FIELDS) {
      const value = source[field.key];
      if (value === undefined || value === null || String(value).trim() === "") continue;
      corrections[field.key] = String(value).trim().slice(0, 500);
    }
    clean[COMPANY_CORRECTIONS_ID] = corrections;
  }

  if (sources.has("contract")) {
    const rawMatch = rawAnswers[CONTRACT_MATCH_ID];
    if (!Array.isArray(rawMatch) || !rawMatch.every((value) => typeof value === "string")) {
      return { ok: false, message: "기술실시계약 정보의 일치 여부를 선택해 주세요.", source: "contract" };
    }

    const selected = Array.from(new Set(rawMatch)).filter((value) =>
      (CONTRACT_MATCH_OPTIONS as readonly string[]).includes(value)
    );
    if (selected.length !== rawMatch.length || selected.length === 0) {
      return { ok: false, message: "기술실시계약 정보의 일치 여부를 선택해 주세요.", source: "contract" };
    }

    const hasExclusive = selected.includes("모두 일치") || selected.includes("확인이 어려움");
    if (hasExclusive && selected.length > 1) {
      return { ok: false, message: "‘모두 일치’와 ‘확인이 어려움’은 다른 항목과 함께 선택할 수 없습니다.", source: "contract" };
    }

    const correction = String(rawAnswers[CONTRACT_CORRECTION_ID] ?? "").trim().slice(0, 3000);
    const needsCorrection = selected.includes("계약금액이 다름") || selected.includes("기타 항목이 다름");
    if (needsCorrection && !correction) {
      return { ok: false, message: "기술실시계약 정보에서 다른 항목을 선택한 경우 정정 내용을 입력해 주세요.", source: "contract" };
    }

    clean[CONTRACT_MATCH_ID] = selected;
    clean[CONTRACT_CORRECTION_ID] = correction;
  }

  return { ok: true, answers: clean };
}
