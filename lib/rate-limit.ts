/**
 * 경량 속도 제한(rate limiting).
 *
 * 서버 메모리에 IP별 요청 횟수를 시간창 단위로 기록해, 무차별 대입·스팸을 늦춘다.
 * 별도 인프라 없이 동작하지만, 서버리스(Vercel 등)에서는 인스턴스가 여러 개면
 * 인스턴스마다 카운터가 따로라 100% 분산 방어는 아니다.
 * 더 강한 방어가 필요하면 Vercel KV·Upstash Redis 같은 공유 저장소로 이 파일만 바꾸면 된다.
 */

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

/** 메모리가 너무 커지지 않도록 만료된 항목을 청소 */
function sweep(now: number) {
  if (store.size < 5000) return;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

/**
 * 요청을 1회 계수하고 허용 여부를 반환한다. (제출·업로드 등 일반 요청용)
 */
export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
}

/** 계수하지 않고 현재 차단 상태만 확인 (관리자 인증 시도 전 검사용) */
export function isBlocked(key: string, limit: number): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) return { blocked: false, retryAfterSec: 0 };
  if (entry.count >= limit) {
    return { blocked: true, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

/** 실패를 1회 계수 (관리자 비밀번호 오류 시에만 호출) */
export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  sweep(now);
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
}

/** 카운터 초기화 (관리자 인증 성공 시 호출 → 정상 관리자는 절대 막히지 않음) */
export function clearKey(key: string): void {
  store.delete(key);
}

/** 요청에서 클라이언트 IP를 추출 (Vercel/프록시의 x-forwarded-for 우선) */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
