/**
 * Decaying web presence detector.
 *
 * Runs entirely on public HTTP responses, so it needs no vendor key. It fetches the page
 * once, reads only markup-level signals, and reports each check with the evidence behind it.
 *
 * Safety: the target URL comes from user input, so `assertPublicUrl` rejects non-http(s)
 * schemes, credentials in the URL, and hosts that resolve into private/loopback ranges.
 * Without that guard this endpoint would be a server-side request forgery hole.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const AUDIT_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;

export type AuditCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail" | "unknown";
  weight: number;
  detail: string;
};

export type WebAuditResult = {
  url: string;
  finalUrl: string;
  reachable: boolean;
  httpStatus: number | null;
  responseMs: number | null;
  secure: boolean;
  mobileFriendly: boolean;
  decayScore: number;
  verdict: "healthy" | "aging" | "decayed" | "broken" | "unreachable";
  headline: string;
  checks: AuditCheck[];
  fetchedAt: string;
};

function isPrivateIPv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return a >= 224;
}

function isPrivateIPv6(address: string) {
  const value = address.toLowerCase();
  return (
    value === "::1" ||
    value === "::" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe80") ||
    value.startsWith("::ffff:")
  );
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("A website address is required.");
  // Only a bare host gets an assumed scheme. Anything that already declares one is left
  // intact so the protocol check below can reject it, rather than being rewritten into a
  // syntactically valid https URL.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  return hasScheme ? trimmed : `https://${trimmed}`;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(normalizeUrl(raw));
  } catch {
    throw new Error("That does not look like a valid website address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https addresses can be audited.");
  }
  if (url.username || url.password) {
    throw new Error("Addresses containing credentials cannot be audited.");
  }

  // URL.hostname keeps the brackets around an IPv6 literal, which isIP does not accept —
  // strip them so an IPv6 address is range-checked rather than falling through to DNS.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("That address is not publicly routable.");
  }

  const literal = isIP(host);
  const addresses = literal
    ? [{ address: host, family: literal }]
    : await lookup(host, { all: true }).catch(() => {
        throw new Error("That domain could not be resolved.");
      });

  for (const entry of addresses) {
    const blocked = entry.family === 6 ? isPrivateIPv6(entry.address) : isPrivateIPv4(entry.address);
    if (blocked) throw new Error("That address resolves to a private network and cannot be audited.");
  }

  return url;
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let received = 0;
  let html = "";
  while (received < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    html += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return html;
}

const has = (html: string, pattern: RegExp) => pattern.test(html);

export function buildChecks(html: string, response: Response, responseMs: number, finalUrl: URL): AuditCheck[] {
  const now = new Date();
  const checks: AuditCheck[] = [];

  const secure = finalUrl.protocol === "https:";
  checks.push({
    key: "https",
    label: "Secure connection",
    status: secure ? "pass" : "fail",
    weight: 14,
    detail: secure ? "Served over HTTPS." : "Served over plain HTTP — browsers mark this as not secure.",
  });

  const mobile = has(html, /<meta[^>]+name=["']viewport["']/i);
  checks.push({
    key: "viewport",
    label: "Mobile responsive",
    status: mobile ? "pass" : "fail",
    weight: 16,
    detail: mobile ? "Declares a responsive viewport." : "No responsive viewport — the site will not adapt to phones.",
  });

  const title = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(html)?.[1]?.trim();
  checks.push({
    key: "title",
    label: "Page title",
    status: title && title.length > 3 ? "pass" : "fail",
    weight: 6,
    detail: title ? `Title: "${title.slice(0, 90)}".` : "No page title — weak search result presentation.",
  });

  const description = has(html, /<meta[^>]+name=["']description["']/i);
  checks.push({
    key: "description",
    label: "Search description",
    status: description ? "pass" : "warn",
    weight: 5,
    detail: description ? "Meta description present." : "No meta description for search listings.",
  });

  const h1 = has(html, /<h1[\s>]/i);
  checks.push({
    key: "h1",
    label: "Primary heading",
    status: h1 ? "pass" : "warn",
    weight: 4,
    detail: h1 ? "Page states a primary heading." : "No H1 heading found.",
  });

  const speedStatus = responseMs < 800 ? "pass" : responseMs < 2500 ? "warn" : "fail";
  checks.push({
    key: "speed",
    label: "Server response time",
    status: speedStatus,
    weight: 12,
    detail: `First byte in ${responseMs}ms.`,
  });

  // Stale copyright year is the single most reliable "nobody maintains this" tell.
  const years = [...html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,20}(19|20)\d{2}/gi)]
    .map(match => Number(match[0].match(/(19|20)\d{2}/)?.[0]))
    .filter(Boolean);
  const latestYear = years.length ? Math.max(...years) : null;
  const yearGap = latestYear ? now.getFullYear() - latestYear : null;
  checks.push({
    key: "copyright",
    label: "Content freshness",
    status: yearGap === null ? "unknown" : yearGap <= 1 ? "pass" : yearGap <= 3 ? "warn" : "fail",
    weight: 14,
    detail:
      yearGap === null
        ? "No copyright year found in the page."
        : `Footer copyright reads ${latestYear} — ${yearGap} year(s) behind.`,
  });

  const generator = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1];
  checks.push({
    key: "platform",
    label: "Publishing platform",
    status: generator ? "pass" : "unknown",
    weight: 3,
    detail: generator ? `Built with ${generator}.` : "Platform not declared.",
  });

  const flash = has(html, /\.swf\b|<embed[^>]+application\/x-shockwave-flash/i);
  const tableLayout = (html.match(/<table[\s>]/gi) || []).length > 6 && !has(html, /display\s*:\s*grid|flex/i);
  const legacy = flash || tableLayout;
  checks.push({
    key: "legacy",
    label: "Legacy build techniques",
    status: legacy ? "fail" : "pass",
    weight: 10,
    detail: legacy
      ? flash
        ? "Page still references Flash, which no browser supports."
        : "Layout appears to be built on nested tables."
      : "No obsolete layout techniques detected.",
  });

  const parked = has(
    html,
    /under construction|coming soon|domain (is )?for sale|this site is parked|default web page|it works!/i,
  );
  checks.push({
    key: "parked",
    label: "Live content",
    status: parked ? "fail" : "pass",
    weight: 12,
    detail: parked ? "The page reads as parked, default, or under construction." : "The page serves real content.",
  });

  const contact = has(html, /mailto:|tel:|href=["'][^"']*contact/i);
  checks.push({
    key: "contact",
    label: "Contact route",
    status: contact ? "pass" : "warn",
    weight: 6,
    detail: contact ? "A contact link or address is present." : "No contact link, phone, or email found on the page.",
  });

  const social = has(html, /facebook\.com|instagram\.com|linkedin\.com|x\.com|twitter\.com|tiktok\.com/i);
  checks.push({
    key: "social",
    label: "Social presence",
    status: social ? "pass" : "warn",
    weight: 4,
    detail: social ? "Links out to social profiles." : "No social profile links found.",
  });

  const analytics = has(html, /googletagmanager|gtag\(|analytics\.js|plausible|matomo|umami|fathom|posthog/i);
  checks.push({
    key: "analytics",
    label: "Measurement",
    status: analytics ? "pass" : "warn",
    weight: 5,
    detail: analytics ? "An analytics tag is installed." : "No analytics tag — the owner cannot see their traffic.",
  });

  const lastModified = response.headers.get("last-modified");
  if (lastModified) {
    const modified = new Date(lastModified);
    const months = Number.isNaN(modified.getTime())
      ? null
      : Math.round((now.getTime() - modified.getTime()) / (1000 * 60 * 60 * 24 * 30));
    checks.push({
      key: "lastModified",
      label: "Last published",
      status: months === null ? "unknown" : months <= 6 ? "pass" : months <= 24 ? "warn" : "fail",
      weight: 8,
      detail: months === null ? "Last-Modified header unreadable." : `Server reports the page last changed ~${months} month(s) ago.`,
    });
  }

  return checks;
}

const STATUS_PENALTY: Record<AuditCheck["status"], number> = { pass: 0, warn: 0.5, fail: 1, unknown: 0.35 };

export function scoreChecks(checks: AuditCheck[]): number {
  const total = checks.reduce((sum, check) => sum + check.weight, 0);
  if (!total) return 0;
  const penalty = checks.reduce((sum, check) => sum + check.weight * STATUS_PENALTY[check.status], 0);
  return Math.round((penalty / total) * 100);
}

export async function auditWebsite(rawUrl: string): Promise<WebAuditResult> {
  const url = await assertPublicUrl(rawUrl);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUDIT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "FinderBot/1.0 (+https://finderviews.online/bot) website-health-check",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const responseMs = Date.now() - startedAt;
    const finalUrl = new URL(response.url || url.toString());

    if (!response.ok) {
      const checks: AuditCheck[] = [
        {
          key: "status",
          label: "Server response",
          status: "fail",
          weight: 100,
          detail: `The site answered with HTTP ${response.status}.`,
        },
      ];
      return {
        url: url.toString(),
        finalUrl: finalUrl.toString(),
        reachable: true,
        httpStatus: response.status,
        responseMs,
        secure: finalUrl.protocol === "https:",
        mobileFriendly: false,
        decayScore: 100,
        verdict: "broken",
        headline: `The published website returns HTTP ${response.status} — visitors cannot use it.`,
        checks,
        fetchedAt: new Date().toISOString(),
      };
    }

    const html = await readCapped(response);
    const checks = buildChecks(html, response, responseMs, finalUrl);
    const decayScore = scoreChecks(checks);
    const verdict: WebAuditResult["verdict"] =
      decayScore >= 60 ? "decayed" : decayScore >= 32 ? "aging" : "healthy";

    const failing = checks.filter(c => c.status === "fail");
    const headline =
      verdict === "decayed"
        ? `Significant decay: ${failing.length} critical issue(s) including ${failing[0]?.label.toLowerCase() ?? "core gaps"}.`
        : verdict === "aging"
          ? "The site works but is falling behind on current standards."
          : "The site is in good working order — a rebuild is a harder sell.";

    return {
      url: url.toString(),
      finalUrl: finalUrl.toString(),
      reachable: true,
      httpStatus: response.status,
      responseMs,
      secure: finalUrl.protocol === "https:",
      mobileFriendly: checks.find(c => c.key === "viewport")?.status === "pass",
      decayScore,
      verdict,
      headline,
      checks,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      url: url.toString(),
      finalUrl: url.toString(),
      reachable: false,
      httpStatus: null,
      responseMs: null,
      secure: false,
      mobileFriendly: false,
      decayScore: 100,
      verdict: "unreachable",
      headline: aborted
        ? `The site did not respond within ${AUDIT_TIMEOUT_MS / 1000} seconds.`
        : "The site could not be reached at all.",
      checks: [
        {
          key: "reachable",
          label: "Reachability",
          status: "fail",
          weight: 100,
          detail: aborted ? "Connection timed out." : "No response from the server.",
        },
      ],
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}
