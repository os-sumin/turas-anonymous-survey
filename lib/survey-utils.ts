import crypto from "crypto";
import type { SurveyConfig, SurveyQuestion, UploadedFile } from "./types";

export const DEFAULT_MAX_SIZE_MB = 20;
export const HARD_MAX_SIZE_MB = 100;

export function getEffectiveEndAt(config: SurveyConfig): string | undefined {
  return process.env.SURVEY_END_AT || config.endAt;
}

export function isSurveyClosed(config: SurveyConfig): boolean {
  if (config.archived) return true;
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
      if (question.type === "multiple" || question.type === "file") clean[question.id] = [];
      else if (question.type === "ranking" || question.type === "matrix" || question.type === "grid") clean[question.id] = {};
      else clean[question.id] = "";
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
      const unique = Array.from(new Set(value));
      if (question.maxSelections && unique.length > question.maxSelections) {
        return { ok: false, message: `"${question.title}"은 최대 ${question.maxSelections}개까지 선택할 수 있습니다.` };
      }
      if (question.minSelections && unique.length > 0 && unique.length < question.minSelections) {
        return { ok: false, message: `"${question.title}"은 최소 ${question.minSelections}개를 선택해 주세요.` };
      }
      clean[question.id] = unique;
    }

    if (question.type === "ranking") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, message: `"${question.title}" 응답 형식이 올바르지 않습니다.` };
      }
      const entries = Object.entries(value as Record<string, unknown>);
      const rankCount = question.rankCount ?? 3;
      const allowedLabels = Array.from({ length: rankCount }, (_, i) => `${i + 1}순위`);
      const seen = new Set<string>();
      const ordered: Record<string, string> = {};
      for (const label of allowedLabels) {
        const picked = (value as Record<string, unknown>)[label];
        if (picked === undefined || picked === null || picked === "") continue;
        if (typeof picked !== "string") return { ok: false, message: `"${question.title}" 응답 형식이 올바르지 않습니다.` };
        if (question.options && !question.options.includes(picked)) return { ok: false, message: `"${question.title}" 선택지가 올바르지 않습니다.` };
        if (seen.has(picked)) return { ok: false, message: `"${question.title}"에서 같은 항목을 중복 선택할 수 없습니다.` };
        seen.add(picked);
        ordered[label] = picked;
      }
      const invalidLabel = entries.find(([label]) => !allowedLabels.includes(label));
      if (invalidLabel) return { ok: false, message: `"${question.title}" 순위 정보가 올바르지 않습니다.` };
      if (question.required && question.requireAllRanks) {
        const need = Math.min(rankCount, (question.options?.length ?? rankCount) || rankCount);
        if (Object.keys(ordered).length < need) {
          return { ok: false, message: `"${question.title}"의 모든 순위를 선택해 주세요.` };
        }
      }
      clean[question.id] = ordered;
    }

    if (question.type === "matrix") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, message: `"${question.title}" 응답 형식이 올바르지 않습니다.` };
      }
      const rows = question.rows ?? [];
      const columns = question.columns ?? [];
      const multiple = Boolean(question.matrixMultiple);
      const ordered: Record<string, string | string[]> = {};

      for (const [row, picked] of Object.entries(value as Record<string, unknown>)) {
        if (!rows.includes(row)) return { ok: false, message: `"${question.title}" 항목 정보가 올바르지 않습니다.` };

        if (multiple) {
          if (picked === undefined || picked === null) continue;
          if (!Array.isArray(picked) || !picked.every((v) => typeof v === "string")) {
            return { ok: false, message: `"${question.title}" 응답 형식이 올바르지 않습니다.` };
          }
          const unique = Array.from(new Set(picked));
          const invalid = unique.find((v) => !columns.includes(v));
          if (invalid) return { ok: false, message: `"${question.title}" 선택지가 올바르지 않습니다.` };
          if (unique.length > 0) ordered[row] = unique;
        } else {
          if (picked === undefined || picked === null || picked === "") continue;
          if (typeof picked !== "string" || !columns.includes(picked)) {
            return { ok: false, message: `"${question.title}" 선택지가 올바르지 않습니다.` };
          }
          ordered[row] = picked;
        }
      }

      if (question.required) {
        const answered = rows.filter((row) => {
          const cell = ordered[row];
          return Array.isArray(cell) ? cell.length > 0 : Boolean(cell);
        });
        if (question.allowRowSkip) {
          if (answered.length === 0) return { ok: false, message: `"${question.title}"에서 최소 한 개는 선택해 주세요.` };
        } else if (answered.length < rows.length) {
          return { ok: false, message: `"${question.title}"의 모든 항목에 답해 주세요.` };
        }
      }

      // 행 순서대로 재정렬
      const sorted: Record<string, string | string[]> = {};
      for (const row of rows) if (ordered[row] !== undefined) sorted[row] = ordered[row];
      clean[question.id] = sorted;
    }

    if (question.type === "grid") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, message: `"${question.title}" 응답 형식이 올바르지 않습니다.` };
      }
      const rows = question.rows ?? [];
      const cols = question.gridColumns ?? [];
      const colByLabel = new Map(cols.map((c) => [c.label, c]));
      const cleanGrid: Record<string, Record<string, string>> = {};
      let filledCells = 0;

      for (const [row, rowVal] of Object.entries(value as Record<string, unknown>)) {
        if (!rows.includes(row)) return { ok: false, message: `"${question.title}" 항목 정보가 올바르지 않습니다.` };
        if (rowVal === undefined || rowVal === null) continue;
        if (typeof rowVal !== "object" || Array.isArray(rowVal)) {
          return { ok: false, message: `"${question.title}" 응답 형식이 올바르지 않습니다.` };
        }
        const cleanRow: Record<string, string> = {};
        for (const [colLabel, cell] of Object.entries(rowVal as Record<string, unknown>)) {
          const col = colByLabel.get(colLabel);
          if (!col) return { ok: false, message: `"${question.title}" 열 정보가 올바르지 않습니다.` };
          if (cell === undefined || cell === null || String(cell).trim() === "") continue;
          const text = String(cell).trim();
          if (col.type === "select" && col.options && !col.options.includes(text)) {
            return { ok: false, message: `"${question.title}" 선택지가 올바르지 않습니다.` };
          }
          if (col.type === "number" && !Number.isFinite(Number(text))) {
            return { ok: false, message: `"${question.title}"의 "${col.label}"에는 숫자를 입력해 주세요.` };
          }
          cleanRow[colLabel] = text;
          filledCells += 1;
        }
        if (Object.keys(cleanRow).length > 0) cleanGrid[row] = cleanRow;
      }

      if (question.required && filledCells === 0) {
        return { ok: false, message: `"${question.title}" 문항을 입력해 주세요.` };
      }
      if (question.required && question.requireAllCells && cols.length > 0) {
        const incomplete = rows.some((row) => Object.keys(cleanGrid[row] || {}).length < cols.length);
        if (incomplete) {
          return { ok: false, message: `"${question.title}"의 모든 칸을 입력해 주세요.` };
        }
      }

      // 행 순서대로 재정렬
      const sortedGrid: Record<string, Record<string, string>> = {};
      for (const row of rows) if (cleanGrid[row]) sortedGrid[row] = cleanGrid[row];
      clean[question.id] = sortedGrid;
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
  // 순위·행렬 답변(객체)이 비어 있는 경우
  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0) return true;
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

/** 혼동되는 문자(I, L, O, U, 0, 1)를 뺀 Crockford 계열 문자셋 */
const EDIT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 수정 코드 생성. 예: "A3F9-K2M7-P8QX-R5TV" (약 80비트, 링크로 전달) */
export function generateEditCode(): string {
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i += 1) {
    raw += EDIT_CODE_ALPHABET[bytes[i] % EDIT_CODE_ALPHABET.length];
  }
  return raw.match(/.{1,4}/g)!.join("-");
}

/** 입력된 코드에서 대시·공백을 없애고 대문자로 정규화 (사용자가 어떻게 적든 동일 처리) */
export function normalizeEditCode(code: string): string {
  return (code || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** 수정 코드 해시 (원본 코드는 저장하지 않고 이 해시로만 조회) */
export function hashEditCode(code: string): string | null {
  const secret = process.env.TOKEN_HASH_SECRET;
  const normalized = normalizeEditCode(code);
  if (!secret || !normalized) return null;
  return crypto.createHmac("sha256", secret).update(`edit:${normalized}`).digest("hex");
}
