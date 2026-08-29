/**
 * Small fixed-window limiter for the endpoints that reach out to third-party sites on
 * behalf of an anonymous caller. Keeps the public site audit usable as a demo without
 * turning it into an open scanning proxy.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function consume(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (bucket.count >= limit) return { ok: false, retryAfterMs: bucket.resetAt - now };

  bucket.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

/** Prevents unbounded growth in long-running processes. */
export function sweep(now = Date.now()) {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}
