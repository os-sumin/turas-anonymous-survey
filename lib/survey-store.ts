import { FieldValue } from "firebase-admin/firestore";
import { getDb, isFirebaseConfigured } from "./firebase-admin";
import { surveys as builtinSurveys } from "./survey.config";
import type { SurveyConfig } from "./types";

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

export async function listSurveyConfigs(): Promise<
  { id: string; title: string; agency: string }[]
> {
  if (!isFirebaseConfigured()) {
    return Object.values(builtinSurveys).map((c) => ({
      id: c.id,
      title: c.title,
      agency: c.agency
    }));
  }

  const snap = await getDb().collection(CONFIG_COLLECTION).orderBy("updated_at", "desc").get();
  const fromDb = snap.docs.map((doc) => {
    const data = doc.data() as { title?: string; agency?: string };
    return { id: doc.id, title: data.title || doc.id, agency: data.agency || "" };
  });

  const dbIds = new Set(fromDb.map((item) => item.id));
  const fromCode = Object.values(builtinSurveys)
    .filter((c) => !dbIds.has(c.id))
    .map((c) => ({ id: c.id, title: c.title, agency: c.agency }));

  return [...fromDb, ...fromCode];
}

/** 저장 전 최소한의 형식 검증 */
export function validateSurveyConfig(value: unknown): { ok: true; config: SurveyConfig } | { ok: false; message: string } {
  const config = value as SurveyConfig;

  if (!config || typeof config !== "object") return { ok: false, message: "설문 데이터가 올바르지 않습니다." };
  if (!config.id || !/^[a-z0-9가-힣_-]+$/i.test(config.id)) {
    return { ok: false, message: "설문 ID는 영문·숫자·한글·_·- 만 사용할 수 있습니다." };
  }
  if (!config.title?.trim()) return { ok: false, message: "설문 제목을 입력해 주세요." };
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

  if (!Array.isArray(config.notice)) config.notice = [];

  return { ok: true, config };
}
