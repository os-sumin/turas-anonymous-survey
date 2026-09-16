import { FieldValue } from "firebase-admin/firestore";
import { getDb, isFirebaseConfigured } from "./firebase-admin";
import { surveys as builtinSurveys } from "./survey.config";
import type { SurveyConfig } from "./types";
import { getPersonalizationBlocks, visibleBlockFields } from "./personalization";

const CONFIG_COLLECTION = "survey_configs";

/**
 * 설문 config 조회.
 * Firestore를 우선 보고, 없으면 survey.config.ts의 하드코딩본으로 폴백한다.
 * (기존에 코드로 관리하던 설문이 계속 동작하도록)
 */
export async function loadSurveyConfig(surveyId: string): Promise<SurveyConfig | null> {
  if (isFirebaseConfigured()) {
    try {
      const snap = await getDb().collection(CONFIG_COLLECTION).doc(surveyId).get();
      if (snap.exists) {
        const data = snap.data() as { config?: SurveyConfig };
        if (data?.config) return data.config;
      }
    } catch (error) {
      console.error("[survey-store] Firestore 조회 실패, 내장 설정으로 폴백", error);
    }
  }

  return builtinSurveys[surveyId] ?? null;
}

export async function saveSurveyConfig(config: SurveyConfig): Promise<void> {
  const db = getDb();
  await db.collection(CONFIG_COLLECTION).doc(config.id).set(
    {
      config,
      survey_id: config.id,
      title: config.title,
      agency: config.agency,
      updated_at: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export type SurveyListItem = {
  id: string;
  title: string;
  agency: string;
  /** 코드(survey.config.ts)에만 있는 설문은 삭제할 수 없음 */
  source: "firestore" | "code";
  responseCount: number;
  /** true면 보관(종료) 상태 */
  archived: boolean;
};

export async function listSurveyConfigs(): Promise<SurveyListItem[]> {
  if (!isFirebaseConfigured()) {
    return Object.values(builtinSurveys).map((c) => ({
      id: c.id,
      title: c.title,
      agency: c.agency,
      source: "code" as const,
      responseCount: 0,
      archived: Boolean(c.archived)
    }));
  }

  const db = getDb();
  const snap = await db.collection(CONFIG_COLLECTION).orderBy("updated_at", "desc").get();

  const fromDb = snap.docs.map((doc) => {
    const data = doc.data() as { title?: string; agency?: string; archived?: boolean };
    return {
      id: doc.id,
      title: data.title || doc.id,
      agency: data.agency || "",
      source: "firestore" as const,
      responseCount: 0,
      archived: Boolean(data.archived)
    };
  });

  const dbIds = new Set(fromDb.map((item) => item.id));
  const fromCode = Object.values(builtinSurveys)
    .filter((c) => !dbIds.has(c.id))
    .map((c) => ({
      id: c.id,
      title: c.title,
      agency: c.agency,
      source: "code" as const,
      responseCount: 0,
      archived: Boolean(c.archived)
    }));

  const items = [...fromDb, ...fromCode];

  // 각 설문의 누적 응답 수를 붙인다 (삭제 전 확인용)
  await Promise.all(
    items.map(async (item) => {
      try {
        const doc = await db.collection("surveys").doc(item.id).get();
        item.responseCount = (doc.data()?.response_count as number) ?? 0;
      } catch {
        item.responseCount = 0;
      }
    })
  );

  return items;
}

/**
 * 설문 정의만 삭제한다. 이미 수집된 응답(surveys/{id}/responses)과
 * 업로드된 첨부파일은 그대로 보존된다.
 */
export async function deleteSurveyConfig(surveyId: string): Promise<void> {
  await getDb().collection(CONFIG_COLLECTION).doc(surveyId).delete();
}

/** survey.config.ts에 하드코딩된 설문인지 */
export function isBuiltinSurvey(surveyId: string): boolean {
  return Boolean(builtinSurveys[surveyId]);
}

/** 저장 전 최소한의 형식 검증 */
export function validateSurveyConfig(value: unknown): { ok: true; config: SurveyConfig } | { ok: false; message: string } {
  const config = value as SurveyConfig;

  if (!config || typeof config !== "object") return { ok: false, message: "설문 데이터가 올바르지 않습니다." };
  if (!config.id || !/^[a-z0-9가-힣_-]+$/i.test(config.id)) {
    return { ok: false, message: "설문 ID는 영문·숫자·한글·_·- 만 사용할 수 있습니다." };
  }
  if (!config.title?.trim()) return { ok: false, message: "설문 제목을 입력해 주세요." };
  if (config.personalization?.enabled && config.anonymous) {
    return { ok: false, message: "맞춤형 설문은 무기명 설문으로 설정할 수 없습니다." };
  }
  if (!Array.isArray(config.sections) || config.sections.length === 0) {
    return { ok: false, message: "섹션이 최소 1개 필요합니다." };
  }

  const questionIds = new Set<string>();
  for (const section of config.sections) {
    if (!Array.isArray(section.questions)) {
      return { ok: false, message: `섹션 "${section.id}"의 문항 형식이 올바르지 않습니다.` };
    }
    for (const question of section.questions) {
      if (!question.id) return { ok: false, message: "문항 ID가 비어 있습니다." };
      if (questionIds.has(question.id)) {
        return { ok: false, message: `문항 ID가 중복되었습니다: ${question.id}` };
      }
      questionIds.add(question.id);
      if (!question.title?.trim()) {
        return { ok: false, message: `문항 "${question.id}"의 제목을 입력해 주세요.` };
      }
    }
  }

  if (config.personalization?.enabled) {
    const blocks = getPersonalizationBlocks(config);
    if (blocks.length === 0) {
      return { ok: false, message: "맞춤형 설문에는 맞춤정보 블록이 최소 1개 필요합니다." };
    }
    const blockIds = new Set<string>();
    const blockSources = new Set<string>();
    for (const block of blocks) {
      if (!block.id || blockIds.has(block.id)) {
        return { ok: false, message: `맞춤정보 블록 ID가 비어 있거나 중복되었습니다: ${block.id || "(빈 값)"}` };
      }
      blockIds.add(block.id);
      if (blockSources.has(block.source)) {
        return { ok: false, message: `${block.source === "company" ? "기업정보" : "기술실시계약 정보"} 블록은 하나만 추가할 수 있습니다.` };
      }
      blockSources.add(block.source);
      if (!block.title.trim()) return { ok: false, message: "맞춤정보 블록 제목을 입력해 주세요." };
      if (visibleBlockFields(block).length === 0) {
        return { ok: false, message: `"${block.title}" 블록의 표시항목을 최소 1개 선택해 주세요.` };
      }
      const section = config.sections.find((item) => item.id === block.sectionId);
      if (!section) return { ok: false, message: `"${block.title}" 블록의 표시 섹션을 확인해 주세요.` };
      if (block.position === "after_question") {
        if (!block.afterQuestionId || !section.questions.some((question) => question.id === block.afterQuestionId)) {
          return { ok: false, message: `"${block.title}" 블록의 기준 문항을 선택해 주세요.` };
        }
      }
    }
    config.personalization.blocks = blocks;
    config.personalization.companyVerification = blocks.some((block) => block.source === "company");
    config.personalization.contractVerification = blocks.some((block) => block.source === "contract");
    config.personalization.contractAfterQuestionId = undefined;
  }

  if (!Array.isArray(config.notice)) config.notice = [];

  return { ok: true, config };
}
