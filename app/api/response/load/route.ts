import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 이전 버전의 응답 수정 코드 API를 명시적으로 종료한다.
 * 기존 저장소에 옛 route.ts가 남아 있어도 이 파일로 덮어써져 빌드와 동작이 모두 차단된다.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, message: "응답 수정 코드 기능은 종료되었습니다." },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}

export const GET = POST;
