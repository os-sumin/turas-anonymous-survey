import { NextResponse } from "next/server";
import { getSurveyConfig } from "@/lib/survey.config";
import { hashToken, isSurveyClosed, shouldIncludeTokenHash, validateAnswers } from "@/lib/survey-utils";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      survey_id?: string;
      answers?: Record<string, unknown>;
      token?: string;
    };

    const surveyId = body.survey_id;
    if (!surveyId) return badRequest("survey_id가 없습니다.");

    const config = getSurveyConfig(surveyId);
    if (!config) return badRequest("존재하지 않는 설문입니다.");

    if (isSurveyClosed(config)) {
      return NextResponse.json({ ok: false, message: "답변 종료된 설문입니다." }, { status: 410 });
    }

    const validation = validateAnswers(config, body.answers || {});
    if (!validation.ok) return badRequest(validation.message);

    const responseId = crypto.randomUUID();
    const submittedAt = new Date().toISOString();

    const payload: Record<string, unknown> = {
      survey_id: config.id,
      response_id: responseId,
      submitted_at: submittedAt,
      answers: validation.answers,
      meta: { source: "vercel-survey", version: "1.0.0" }
    };

    if (shouldIncludeTokenHash() && body.token) {
      const tokenHash = hashToken(body.token);
      if (tokenHash) payload.token_hash = tokenHash;
    }

    await submitToServer(payload);

    return NextResponse.json({ ok: true, response_id: responseId });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, message: "서버 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

async function submitToServer(payload: Record<string, unknown>) {
  const apiUrl = process.env.SURVEY_API_URL;
  const apiKey = process.env.SURVEY_API_KEY;

  if (!apiUrl) {
    console.log("[survey-submit:dry-run]", JSON.stringify(payload, null, 2));
    return;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Survey API error: ${response.status} ${text}`);
  }
}
