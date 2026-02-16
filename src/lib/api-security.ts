import { NextRequest, NextResponse } from 'next/server';

type RateLimitState = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

declare global {
  var __apiRateLimitStore: Map<string, RateLimitState> | undefined;
}

const store = globalThis.__apiRateLimitStore || new Map<string, RateLimitState>();
if (!globalThis.__apiRateLimitStore) {
  globalThis.__apiRateLimitStore = store;
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(limit - 1, 0), retryAfter: Math.ceil(windowMs / 1000) };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  store.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(limit - existing.count, 0),
    retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: '请求过于频繁，请稍后再试' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
      },
    }
  );
}

export function validateJsonBodySize(request: NextRequest, maxBytes: number): NextResponse | null {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) return null;

  const size = Number(contentLength);
  if (!Number.isFinite(size) || size <= maxBytes) return null;

  return NextResponse.json({ error: '请求体过大' }, { status: 413 });
}
