import crypto from "crypto";
import { NextResponse } from "next/server";
import { clearKey, getClientIp, isBlocked, recordFailure } from "./rate-limit";

export const ADMIN_HEADER = "x-admin-password";

/** 관리자 인증 무차별 대입 방어: 한 IP가 15분 내 비밀번호를 10번 틀리면 차단 */
const ADMIN_MAX_FAILS = 10;
const ADMIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * 관리자 비밀번호 검증.
 * ADMIN_PASSWORD 환경변수가 없으면 모든 요청을 거부한다(설정 누락 시 열려버리는 사고 방지).
 */
export function isAdminAuthorized(request: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  const provided = request.headers.get(ADMIN_HEADER);
  if (!provided) return false;

  return timingSafeEqual(provided, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) {
    // 길이가 달라도 동일한 시간을 쓰도록 더미 비교
    crypto.timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * 관리자 API 진입 가드: 속도 제한 + 인증을 한 번에 처리한다.
 * - 이미 차단된 IP면 429 응답을 반환
 * - 비밀번호가 틀리면 실패를 계수하고 401 반환
 * - 성공하면 해당 IP의 실패 카운터를 초기화(정상 관리자는 막히지 않음)
 * 통과 시 null을 반환하므로, 호출부는 `const denied = guardAdmin(request); if (denied) return denied;` 형태로 쓴다.
 */
export function guardAdmin(request: Request): NextResponse | null {
  const ip = getClientIp(request);
  const key = `admin:${ip}`;

  const blocked = isBlocked(key, ADMIN_MAX_FAILS);
  if (blocked.blocked) {
    return NextResponse.json(
      { ok: false, message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(blocked.retryAfterSec) } }
    );
  }

  if (isAdminAuthorized(request)) {
    clearKey(key);
    return null;
  }

  recordFailure(key, ADMIN_WINDOW_MS);
  return NextResponse.json({ ok: false, message: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
}
