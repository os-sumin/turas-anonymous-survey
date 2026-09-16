import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-auth";
import { getSurveyTargetPreview } from "@/lib/target-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = guardAdmin(request);
  if (denied) return denied;

  try {
    const surveyId = new URL(request.url).searchParams.get("surveyId")?.trim();
    if (!surveyId) {
      return NextResponse.json({ ok: false, message: "surveyId가 없습니다." }, { status: 400 });
    }
    const target = await getSurveyTargetPreview(surveyId);
    return NextResponse.json({ ok: true, target });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "미리보기 자료를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
