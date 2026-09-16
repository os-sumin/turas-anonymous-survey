import { getBucket, getDb, isStorageConfigured } from "./firebase-admin";
import { flattenQuestions } from "./survey-utils";
import type { SurveyConfig, SurveyTargetSnapshot, UploadedFile } from "./types";

export type ResponseRecord = {
  responseId: string;
  submittedAt: string;
  answers: Record<string, unknown>;
  target?: SurveyTargetSnapshot;
};

export async function getResponseCount(surveyId: string): Promise<number> {
  const doc = await getDb().collection("surveys").doc(surveyId).get();
  return (doc.data()?.response_count as number) ?? 0;
}

export async function listResponses(surveyId: string, limit = 500): Promise<ResponseRecord[]> {
  const snap = await getDb()
    .collection("surveys")
    .doc(surveyId)
    .collection("responses")
    .orderBy("submitted_at", "desc")
    .limit(limit)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() as {
      response_id?: string;
      submitted_at?: string;
      answers?: Record<string, unknown>;
      target_snapshot?: SurveyTargetSnapshot;
    };
    return {
      responseId: data.response_id || doc.id,
      submittedAt: data.submitted_at || "",
      answers: data.answers || {},
      target: data.target_snapshot
    };
  });
}

/** 첨부파일 다운로드용 임시 URL (기본 7일) */
export async function createDownloadUrl(path: string, days = 7): Promise<string | null> {
  if (!isStorageConfigured()) return null;
  try {
    const [url] = await getBucket()
      .file(path)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + days * 24 * 60 * 60 * 1000
      });
    return url;
  } catch {
    return null;
  }
}

export function isFileAnswer(value: unknown): value is UploadedFile[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === "object" &&
    value[0] !== null &&
    typeof (value[0] as UploadedFile).path === "string"
  );
}

/** 답변값을 표 셀에 넣을 문자열로 변환 */
export function formatAnswer(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (isFileAnswer(value)) return value.map((file) => file.name).join(", ");
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return String(value);
  // 순위·행렬·입력형표 답변(객체)
  //  - 순위/행렬: "1순위: A / 2순위: B", "매출: 증가, 유지 / 고용: 감소"
  //  - 입력형 표(grid): "1차 [연도: 2021, 금액: 5] / 2차 [연도: 2022, 금액: 10]"
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        if (v && typeof v === "object") return Object.keys(v).length > 0;
        return v !== undefined && v !== null && String(v).trim() !== "";
      })
      .map(([key, v]) => {
        if (Array.isArray(v)) return `${key}: ${v.join(", ")}`;
        if (v && typeof v === "object") {
          const inner = Object.entries(v as Record<string, unknown>)
            .filter(([, cell]) => cell !== undefined && cell !== null && String(cell).trim() !== "")
            .map(([col, cell]) => `${col}: ${cell}`)
            .join(", ");
          return `${key} [${inner}]`;
        }
        return `${key}: ${v}`;
      })
      .join(" / ");
  }
  return String(value);
}

export function formatKST(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Seoul"
  }).format(date);
}

/** 화면·엑셀 공용 헤더 */
export function buildHeaders(config: SurveyConfig) {
  return flattenQuestions(config).map((question) => ({
    id: question.id,
    title: question.title,
    type: question.type
  }));
}
