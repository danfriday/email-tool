// Simple in-memory sliding-window rate limiter.
//
// NOTE: serverless instances don't share memory, so this caps abuse per
// instance rather than globally. For strict global limits in production,
// back this with Upstash/Redis. It's still a meaningful first line of
// defence against bursts and accidental loops.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const b = buckets.get(key);

  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count++;
  return { ok: true, retryAfter: 0 };
}

// Opportunistically evict expired buckets so the map can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}, 60_000).unref?.();
