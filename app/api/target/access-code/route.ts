import { NextResponse } from "next/server";
import { loadSurveyConfig } from "@/lib/survey-store";
import { isSurveyClosed } from "@/lib/survey-utils";
import { getClientIp, hit } from "@/lib/rate-limit";
import {
  isPersonalizedSurvey,
  normalizeContractAccessCode,
  resolveContractAccessCode
} from "@/lib/target-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_LIMIT = 8;
const CODE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const rl = hit(`contract-code:${getClientIp(request)}`, CODE_LIMIT, CODE_WINDOW_MS);
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, message: "계약ID 확인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), "Cache-Control": "no-store" } }
      );
    }

    const body = (await request.json()) as { survey_id?: string; contract_id?: string; company_token?: string };
    const surveyId = String(body.survey_id || "").trim();
    const contractId = normalizeContractAccessCode(String(body.contract_id || ""));
    if (!surveyId || !contractId) return bad("설문 ID와 계약ID를 입력해 주세요.");
    if (contractId.length > 100) return bad("계약ID 형식이 올바르지 않습니다.");

    const config = await loadSurveyConfig(surveyId);
    if (!config || !isPersonalizedSurvey(config)) {
      return NextResponse.json({ ok: false, message: "맞춤형 설문을 찾을 수 없습니다." }, { status: 404 });
    }
    if (isSurveyClosed(config)) {
      return NextResponse.json({ ok: false, message: "답변 종료된 설문입니다." }, { status: 410 });
    }

    const companyToken = String(body.company_token || "").trim();
    if (companyToken.length > 200) return bad("기업 링크 형식이 올바르지 않습니다.");
    const resolved = await resolveContractAccessCode(surveyId, contractId, companyToken || undefined);
    if (!resolved.ok) {
      return NextResponse.json(
        { ok: false, message: resolved.message },
        { status: resolved.status, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        access_token: resolved.accessToken,
        target: resolved.value.target
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: "계약ID 확인 중 오류가 발생했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function bad(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400, headers: { "Cache-Control": "no-store" } });
}
