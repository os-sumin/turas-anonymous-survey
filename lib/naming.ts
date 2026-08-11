import { flattenQuestions } from "./survey-utils";
import type { SurveyConfig } from "./types";

/** 파일·폴더명에 못 쓰는 문자를 정리한다. */
export function safeName(value: string, fallback = "미입력"): string {
  const cleaned = (value || "")
    .replace(/[\\/:*?"<>|]/g, " ") // 파일시스템 금지 문자
    .replace(/[\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

/**
 * 한 응답에서 ZIP 이름에 쓸 값(기업명, 매출발생여부)을 뽑아낸다.
 *
 * 우선순위:
 *   1) namePart 태그가 지정된 문항 (빌더에서 설정한 경우)
 *   2) 문항 제목으로 자동 추정 ("기업명" 포함 → 기업명, "매출" 포함 → 매출여부)
 */
export function extractNameParts(
  config: SurveyConfig,
  answers: Record<string, unknown>
): { company: string; salesStatus: string } {
  let company = "";
  let salesStatus = "";

  const questions = flattenQuestions(config);

  // 1) 명시적 태그 우선
  for (const question of questions) {
    const text = asText(answers[question.id]);
    if (question.namePart === "company" && text) company = text;
    if (question.namePart === "project" && text) salesStatus = text; // 과제번호 자리를 매출여부로 재사용
  }

  // 2) 제목 기반 자동 추정
  if (!company) {
    const q = questions.find((question) => /기업\s*명|회사\s*명|업체\s*명/.test(question.title));
    if (q) company = asText(answers[q.id]);
  }
  if (!salesStatus) {
    const q = questions.find((question) => /매출\s*발생|매출\s*여부|매출.*실태|보고.*여부/.test(question.title));
    if (q) salesStatus = asText(answers[q.id]);
  }

  return {
    company: safeName(company, "기업명없음"),
    salesStatus: safeName(salesStatus, "")
  };
}

function asText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.filter((v) => typeof v === "string").join(",");
  if (raw === undefined || raw === null) return "";
  return String(raw);
}

/** ZIP·폴더 이름: 기업명_매출발생여부 (매출여부가 없으면 기업명만) */
export function makePrefix(parts: { company: string; salesStatus: string }): string {
  return parts.salesStatus ? `${parts.company}_${parts.salesStatus}` : parts.company;
}

/**
 * ZIP 안에서 같은 이름이 겹칠 때 _2, _3 을 붙인다.
 * (한 문항에 여러 파일을 첨부했거나 원본명이 같은 경우)
 */
export function dedupeName(used: Set<string>, name: string): string {
  const safe = safeName(name, "첨부파일");
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  const dot = safe.lastIndexOf(".");
  const base = dot === -1 ? safe : safe.slice(0, dot);
  const ext = dot === -1 ? "" : safe.slice(dot);
  let index = 2;
  let candidate = `${base}_${index}${ext}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base}_${index}${ext}`;
  }
  used.add(candidate);
  return candidate;
}
