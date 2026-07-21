import crypto from "crypto";

export const ADMIN_HEADER = "x-admin-password";

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
