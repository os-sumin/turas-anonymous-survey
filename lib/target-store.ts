import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getDb, isFirebaseConfigured } from "./firebase-admin";
import { hashToken } from "./survey-utils";
import type {
  SurveyTarget,
  SurveyTargetCompany,
  SurveyTargetContract,
  SurveyTargetSnapshot
} from "./types";

export const TARGET_COLLECTION = "survey_targets";

export type SurveyTargetInput = {
  companyId: string;
  projectId: string;
  contractId?: string;
  company: SurveyTargetCompany;
  contract: SurveyTargetContract;
  expiresAt?: string;
};

export type IssuedSurveyTarget = SurveyTarget & {
  link: string;
};

export type ResolvedSurveyTarget = {
  target: SurveyTarget;
  tokenHash: string;
};

export type TargetResolution =
  | { ok: true; value: ResolvedSurveyTarget }
  | { ok: false; status: 400 | 403 | 404 | 410 | 503; message: string };

export function isPersonalizedSurvey(config: { personalization?: { enabled?: boolean } }): boolean {
  return Boolean(config.personalization?.enabled);
}

export function makeSurveyTargetId(surveyId: string, input: SurveyTargetInput): string {
  const businessKey = [surveyId, input.companyId, input.projectId, input.contractId || "-"]
    .map((value) => String(value).trim())
    .join("|");
  return crypto.createHash("sha256").update(businessKey).digest("hex").slice(0, 32);
}

export function createAccessToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function toTargetSnapshot(target: SurveyTarget): SurveyTargetSnapshot {
  return {
    targetId: target.targetId,
    surveyId: target.surveyId,
    companyId: target.companyId,
    projectId: target.projectId,
    contractId: target.contractId,
    company: { ...target.company },
    contract: { ...target.contract }
  };
}

export async function resolveSurveyTarget(surveyId: string, token?: string): Promise<TargetResolution> {
  if (!token) return { ok: false, status: 400, message: "조사대상 링크 정보가 없습니다." };
  if (!isFirebaseConfigured()) {
    return { ok: false, status: 503, message: "조사대상 저장소가 설정되지 않았습니다." };
  }

  if (!hasSecureTokenSecret()) {
    return { ok: false, status: 503, message: "조사대상 링크 보안 설정이 완료되지 않았습니다." };
  }
  const tokenHash = hashToken(token);
  if (!tokenHash) {
    return { ok: false, status: 503, message: "조사대상 링크 보안 설정이 완료되지 않았습니다." };
  }

  const snap = await getDb()
    .collection(TARGET_COLLECTION)
    .where("token_hash", "==", tokenHash)
    .limit(1)
    .get();

  if (snap.empty) return { ok: false, status: 404, message: "유효하지 않은 조사 링크입니다." };

  const doc = snap.docs[0];
  const data = doc.data() as Record<string, unknown>;
  if (data.survey_id !== surveyId) {
    return { ok: false, status: 403, message: "이 설문에 사용할 수 없는 조사 링크입니다." };
  }
  if (data.active === false) {
    return { ok: false, status: 410, message: "사용이 중지된 조사 링크입니다." };
  }

  const expiresAt = typeof data.expires_at === "string" ? data.expires_at : undefined;
  if (expiresAt) {
    const expires = new Date(expiresAt);
    if (!Number.isNaN(expires.getTime()) && Date.now() > expires.getTime()) {
      return { ok: false, status: 410, message: "사용기간이 만료된 조사 링크입니다." };
    }
  }

  const target: SurveyTarget = {
    targetId: doc.id,
    surveyId,
    companyId: String(data.company_id || ""),
    projectId: String(data.project_id || ""),
    contractId: String(data.contract_id || ""),
    company: normalizeCompany(data.company),
    contract: normalizeContract(data.contract),
    active: data.active !== false,
    expiresAt,
    responseId: typeof data.response_id === "string" ? data.response_id : undefined
  };

  return { ok: true, value: { target, tokenHash } };
}

/**
 * 조사대상을 등록하면서 새 링크를 발급한다. 같은 기업+과제+계약을 다시 올리면
 * targetId는 유지되고 접근 토큰만 교체되어 이전 링크는 자동으로 무효화된다.
 */
export async function issueSurveyTargets(
  surveyId: string,
  inputs: SurveyTargetInput[],
  baseUrl: string
): Promise<IssuedSurveyTarget[]> {
  if (!isFirebaseConfigured()) throw new Error("Firebase가 설정되지 않았습니다.");
  if (!hasSecureTokenSecret()) throw new Error("TOKEN_HASH_SECRET을 32자 이상의 무작위 값으로 설정해 주세요.");

  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const seen = new Set<string>();
  const issued = inputs.map((raw) => {
    const input = normalizeInput(raw);
    const targetId = makeSurveyTargetId(surveyId, input);
    if (seen.has(targetId)) {
      throw new Error(`중복 조사대상이 있습니다: ${input.companyId} / ${input.projectId} / ${input.contractId || "계약ID 없음"}`);
    }
    seen.add(targetId);

    const token = createAccessToken();
    const tokenHash = hashToken(token);
    if (!tokenHash) throw new Error("조사대상 토큰을 생성하지 못했습니다.");

    const target: SurveyTarget = {
      targetId,
      surveyId,
      companyId: input.companyId,
      projectId: input.projectId,
      contractId: input.contractId || "",
      company: input.company,
      contract: input.contract,
      active: true,
      expiresAt: input.expiresAt
    };

    return {
      target,
      tokenHash,
      link: `${normalizedBase}/survey/${encodeURIComponent(surveyId)}?t=${encodeURIComponent(token)}`
    };
  });

  const db = getDb();
  for (let offset = 0; offset < issued.length; offset += 400) {
    const batch = db.batch();
    for (const item of issued.slice(offset, offset + 400)) {
      const ref = db.collection(TARGET_COLLECTION).doc(item.target.targetId);
      batch.set(
        ref,
        {
          survey_id: surveyId,
          company_id: item.target.companyId,
          project_id: item.target.projectId,
          contract_id: item.target.contractId,
          company: item.target.company,
          contract: item.target.contract,
          active: true,
          expires_at: item.target.expiresAt || null,
          token_hash: item.tokenHash,
          updated_at: FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  return issued.map(({ target, link }) => ({ ...target, link }));
}

function normalizeInput(input: SurveyTargetInput): SurveyTargetInput {
  const companyId = String(input.companyId || "").trim();
  const projectId = String(input.projectId || "").trim();
  if (!companyId) throw new Error("기업ID가 비어 있는 조사대상이 있습니다.");
  if (!projectId) throw new Error(`과제ID가 비어 있습니다: ${companyId}`);

  const amount = input.contract?.amount;
  const expiresAt = input.expiresAt ? String(input.expiresAt).trim() : undefined;
  if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) {
    throw new Error(`링크만료일시 형식이 올바르지 않습니다: ${companyId} / ${projectId}`);
  }
  return {
    companyId,
    projectId,
    contractId: String(input.contractId || "").trim(),
    company: normalizeCompany(input.company),
    contract: {
      ...normalizeContract(input.contract),
      amount: amount === null || amount === undefined ? null : Number(amount)
    },
    expiresAt
  };
}

function hasSecureTokenSecret(): boolean {
  return Boolean(process.env.TOKEN_HASH_SECRET && process.env.TOKEN_HASH_SECRET.length >= 32);
}

function normalizeCompany(value: unknown): SurveyTargetCompany {
  const source = (value || {}) as Record<string, unknown>;
  return {
    name: String(source.name || "").trim(),
    businessNumber: String(source.businessNumber || "").trim(),
    representative: String(source.representative || "").trim(),
    region: String(source.region || "").trim(),
    size: String(source.size || "").trim(),
    industry: String(source.industry || "").trim()
  };
}

function normalizeContract(value: unknown): SurveyTargetContract {
  const source = (value || {}) as Record<string, unknown>;
  const rawAmount = source.amount;
  const amount = rawAmount === null || rawAmount === undefined || rawAmount === "" ? null : Number(rawAmount);
  return {
    projectName: String(source.projectName || "").trim(),
    transferInstitution: String(source.transferInstitution || "").trim(),
    contractName: String(source.contractName || "").trim(),
    signedAt: String(source.signedAt || "").trim(),
    amount: Number.isFinite(amount) ? amount : null
  };
}
