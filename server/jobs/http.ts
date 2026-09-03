/**
 * Shared HTTP for job sources.
 *
 * Two things here are the difference between a feed that works in production and one that
 * silently returns nothing:
 *
 *  1. A real User-Agent. Several of these providers sit behind a CDN that answers 403 to a
 *     request with no UA, which surfaces as "no jobs" rather than as an error. The original
 *     integration sent only an Accept header, which is the most likely reason the live site
 *     returned an empty list.
 *  2. A timeout. Without one a stalled provider hangs the whole search, because the aggregator
 *     waits on every source.
 */
export const JOB_FETCH_TIMEOUT_MS = 12_000;

export const JOB_USER_AGENT =
  "FinderviewsBot/1.0 (+https://finderviews.online/bot; job-search) Mozilla/5.0 (compatible)";

export type FetchJsonResult<T> = { ok: true; data: T; ms: number } | { ok: false; error: string; ms: number };

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<FetchJsonResult<T>> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JOB_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": JOB_USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en",
        ...(init?.headers ?? {}),
      },
    });

    const ms = Date.now() - startedAt;
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}`, ms };

    const text = await response.text();
    if (!text.trim()) return { ok: false, error: "Empty response", ms };

    try {
      return { ok: true, data: JSON.parse(text) as T, ms };
    } catch {
      // A provider answering with an HTML error or challenge page is a common real failure and
      // should be reported as such rather than as a parse crash.
      return { ok: false, error: "Response was not JSON", ms };
    }
  } catch (error) {
    const ms = Date.now() - startedAt;
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: `Timed out after ${JOB_FETCH_TIMEOUT_MS / 1000}s`, ms };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Request failed", ms };
  } finally {
    clearTimeout(timer);
  }
}

/** Providers quote dates as ISO strings, unix seconds or unix milliseconds. */
export function toIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim().length >= 9 && !value.includes("-")) {
      return toIsoDate(numeric);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export function stripHtml(value: unknown, limit = 7000): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

export function safeHttpsUrl(value: unknown, fallback: string): string {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : fallback;
}
