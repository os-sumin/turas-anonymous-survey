import crypto from "crypto";
import type { SurveyConfig, SurveyQuestion } from "./types";

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
      clean[question.id] = question.type === "multiple" ? [] : "";
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
  }

  return { ok: true, answers: clean };
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
