import crypto from "crypto";
import type { SurveyConfig, SurveyQuestion, UploadedFile } from "./types";

export const DEFAULT_MAX_SIZE_MB = 20;
export const HARD_MAX_SIZE_MB = 100;

export function getEffectiveEndAt(config: SurveyConfig): string | undefined {
  return process.env.SURVEY_END_AT || config.endAt;
}

export function isSurveyClosed(config: SurveyConfig): boolean {
  const endAt = getEffectiveEndAt(config);
  if (!endAt) return false;
  const end = new Date(endAt);
  if (Number.isNaN(end.getTime())) return false;
  return Date.now() > end.getTime();
}

export function flattenQuestions(config: SurveyConfig): SurveyQuestion[] {
  return config.sections.flatMap((section) => section.questions);
}

export function findQuestion(config: SurveyConfig, questionId: string): SurveyQuestion | null {
  return flattenQuestions(config).find((q) => q.id === questionId) ?? null;
}

export function validateAnswers(
  config: SurveyConfig,
  rawAnswers: Record<string, unknown>
): { ok: true; answers: Record<string, unknown> } | { ok: false; message: string } {
  const clean: Record<string, unknown> = {};

  for (const question of flattenQuestions(config)) {
    const value = rawAnswers[question.id];

    if (question.required && isEmptyAnswer(value)) {
      return { ok: false, message: `"${question.title}" 문항은 필수입니다.` };
    }

    if (isEmptyAnswer(value)) {
      clean[question.id] =
        question.type === "multiple" || question.type === "file" ? [] : "";
      continue;
    }

    if (question.type === "single") {
      if (typeof value !== "string") return { ok: false, message: `"${question.title}" 응답 형식이 올바르지 않습니다.` };
      if (question.options && !question.options.includes(value)) return { ok: false, message: `"${question.title}" 선택지가 올바르지 않습니다.` };
      clean[question.id] = value;
    }

    if (question.type === "multiple") {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return { ok: false, message: `"${question.title}" 응답 형식이 올바르지 않습니다.` };
      const invalid = value.find((v) => question.options && !question.options.includes(v));
      if (invalid) return { ok: false, message: `"${question.title}" 선택지가 올바르지 않습니다.` };
      clean[question.id] = value;
    }

    if (question.type === "number") {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) return { ok: false, message: `"${question.title}"에는 숫자를 입력해 주세요.` };
      clean[question.id] = numberValue;
    }

    if (question.type === "scale") {
      const numberValue = Number(value);
      const min = question.min ?? 1;
      const max = question.max ?? 5;
      if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
        return { ok: false, message: `"${question.title}" 응답 범위가 올바르지 않습니다.` };
      }
      clean[question.id] = numberValue;
    }

    if (question.type === "text" || question.type === "textarea") {
      if (typeof value !== "string") return { ok: false, message: `"${question.title}" 응답 형식이 올바르지 않습니다.` };
      clean[question.id] = value.trim().slice(0, question.type === "textarea" ? 3000 : 500);
    }

    if (question.type === "file") {
      const result = validateFileAnswer(config, question, value);
      if (!result.ok) return result;
      clean[question.id] = result.files;
    }
  }

  return { ok: true, answers: clean };
}

function validateFileAnswer(
  config: SurveyConfig,
  question: SurveyQuestion,
  value: unknown
): { ok: true; files: UploadedFile[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, message: `"${question.title}" 첨부 형식이 올바르지 않습니다.` };
  }

  const maxFiles = question.maxFiles ?? 1;
  if (value.length > maxFiles) {
    return { ok: false, message: `"${question.title}"에는 최대 ${maxFiles}개까지 첨부할 수 있습니다.` };
  }

  const files: UploadedFile[] = [];
  const expectedPrefix = `uploads/${config.id}/${question.id}/`;

  for (const item of value) {
    const file = item as Partial<UploadedFile>;

    if (typeof file?.path !== "string" || typeof file?.name !== "string" || typeof file?.size !== "number") {
      return { ok: false, message: `"${question.title}" 첨부 정보가 올바르지 않습니다.` };
    }

    // 클라이언트가 임의 경로를 보내지 못하도록 경로 검증
    if (!file.path.startsWith(expectedPrefix) || file.path.includes("..")) {
      return { ok: false, message: `"${question.title}" 첨부 경로가 올바르지 않습니다.` };
    }

    const limitMB = Math.min(question.maxSizeMB ?? DEFAULT_MAX_SIZE_MB, HARD_MAX_SIZE_MB);
    if (file.size > limitMB * 1024 * 1024) {
      return { ok: false, message: `"${question.title}" 첨부 용량은 ${limitMB}MB를 초과할 수 없습니다.` };
    }

    if (!isAllowedExtension(file.name, question.accept)) {
      return {
        ok: false,
        message: `"${question.title}"에는 ${(question.accept || []).join(", ")} 형식만 첨부할 수 있습니다.`
      };
    }

    files.push({
      path: file.path,
      name: file.name.slice(0, 300),
      size: file.size,
      type: typeof file.type === "string" ? file.type.slice(0, 200) : undefined
    });
  }

  return { ok: true, files };
}

export function isAllowedExtension(filename: string, accept?: string[]): boolean {
  if (!accept || accept.length === 0) return true;
  const lower = filename.toLowerCase();
  return accept.some((ext) => lower.endsWith(ext.toLowerCase().trim()));
}

/** 저장 경로에 쓸 수 있도록 파일명 정리 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\\/]/g, "_")
    .replace(/[\x00-\x1f]/g, "")
    .replace(/\s+/g, "_")
    .slice(-120);
}

function isEmptyAnswer(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export function shouldIncludeTokenHash(): boolean {
  return process.env.ALLOW_RESPONSE_TOKEN_HASH === "true";
}

export function hashToken(token: string): string | null {
  const secret = process.env.TOKEN_HASH_SECRET;
  if (!secret || !token) return null;
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}
