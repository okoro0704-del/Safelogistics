/**
 * In-memory rate limits for public endpoints.
 * Sufficient for single-instance / local; use a shared store in multi-instance production.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const existing = buckets.get(options.key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(options.key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { allowed: true };
  }

  if (existing.count >= options.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000),
      ),
    };
  }

  existing.count += 1;
  return { allowed: true };
}

/** Public tracking: 30 lookups / minute / IP (+ optional host). */
export function rateLimitPublicTracking(ip: string, host?: string) {
  return rateLimit({
    key: `track:${host ?? "platform"}:${ip}`,
    limit: 30,
    windowMs: 60_000,
  });
}
