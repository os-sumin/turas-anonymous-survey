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
 * 한 응답에서 과제번호·기업명을 뽑아낸다.
 * namePart 태그가 붙은 문항을 우선 쓰고, 없으면 빈 값으로 폴백한다.
 */
export function extractNameParts(
  config: SurveyConfig,
  answers: Record<string, unknown>
): { project: string; company: string } {
  let project = "";
  let company = "";

  for (const question of flattenQuestions(config)) {
    if (!question.namePart) continue;
    const raw = answers[question.id];
    const text = typeof raw === "string" ? raw : Array.isArray(raw) ? "" : String(raw ?? "");
    if (question.namePart === "project" && text) project = text;
    if (question.namePart === "company" && text) company = text;
  }

  return { project: safeName(project, "과제번호없음"), company: safeName(company, "기업명없음") };
}

/** 과제번호_기업명 (ZIP·폴더 공통 접두어) */
export function makePrefix(parts: { project: string; company: string }): string {
  return `${parts.project}_${parts.company}`;
}

/** 개별 첨부파일명: 과제번호_기업명_문항제목.확장자 */
export function makeAttachmentName(
  prefix: string,
  questionTitle: string,
  originalName: string
): string {
  const ext = extractExt(originalName);
  const label = safeName(questionTitle, "첨부").slice(0, 40);
  return `${prefix}_${label}${ext}`;
}

function extractExt(filename: string): string {
  const match = /\.[a-z0-9]{1,8}$/i.exec(filename || "");
  return match ? match[0].toLowerCase() : "";
}

/**
 * ZIP 안에서 같은 이름이 겹칠 때 _2, _3 을 붙인다.
 * (한 문항에 여러 파일을 첨부한 경우)
 */
export function dedupeName(used: Set<string>, name: string): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  let index = 2;
  let candidate = `${base}_${index}${ext}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base}_${index}${ext}`;
  }
  used.add(candidate);
  return candidate;
}
