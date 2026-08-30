/**
 * Organisation contact discovery.
 *
 * Finds the contact points a business has *itself published* — on its own website, in its own
 * structured data, on its own contact or legal-notice page. That single sourcing rule is what
 * makes this both legally defensible and accurate: it is not a people-search, it does not guess
 * addresses from name patterns, and it never asserts a contact point Finder did not read.
 *
 * What it deliberately does NOT do:
 *  - look up a private individual by name and location
 *  - infer or permutate an address (`firstname@company.com`) and present it as real
 *  - source anything from breached, scraped-profile or resold personal-data sets
 *
 * Every returned item carries the exact page it came from, so any claim can be checked, and the
 * governing data-protection regime for the market, so the user knows the rules before sending.
 */
import { complianceFor, COMPLIANCE_DISCLAIMER, type ComplianceProfile } from "@shared/compliance";
import { assertPublicUrl } from "./webaudit";

export const CONTACT_FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_200_000;
const MAX_PAGES = 4;

/**
 * Pages a business commonly publishes contact details on. `impressum` and `legal-notice` matter
 * disproportionately: German, Austrian and Swiss sites are legally required to carry one, so it
 * is often the only page with a real address on it.
 */
const CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/contacts",
  "/get-in-touch",
  "/about",
  "/about-us",
  "/impressum",
  "/legal-notice",
  "/kontakt",
  "/contacto",
  "/nous-contacter",
];

const ROLE_PREFIXES = new Set([
  "info", "hello", "hi", "contact", "contacts", "enquiries", "enquiry", "inquiries", "inquiry",
  "sales", "team", "office", "admin", "support", "help", "hey", "mail", "email", "general",
  "reception", "bookings", "booking", "orders", "studio", "hq", "post", "kontakt", "welcome",
  "newbusiness", "new.business", "business", "partnerships", "press", "media", "marketing",
]);

/** Addresses belonging to the platform a site is built on, not to the business itself. */
const THIRD_PARTY_DOMAINS = [
  "wix.com", "wixpress.com", "squarespace.com", "shopify.com", "godaddy.com", "wordpress.com",
  "sentry.io", "example.com", "domain.com", "yourdomain.com", "email.com", "sentry-cdn.com",
];

const FREE_PROVIDERS = [
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "aol.com", "protonmail.com", "proton.me", "gmx.com", "yandex.com", "mail.ru",
  "web.de", "orange.fr", "free.fr", "163.com", "qq.com",
];

export type ContactKind = "role" | "individual" | "unknown";

export type DiscoveredEmail = {
  address: string;
  kind: ContactKind;
  /** Domain matches the business's own site — strong signal it is really theirs. */
  ownDomain: boolean;
  /** A free mailbox provider; common and legitimate for very small businesses. */
  freeProvider: boolean;
  foundOn: string;
  note: string;
};

export type DiscoveredPhone = { number: string; foundOn: string };

export type ContactDiscoveryResult = {
  query: { name?: string; website: string; country?: string; segment: SegmentKey };
  segmentNote: string;
  resolvedUrl: string;
  reachable: boolean;
  organisationName?: string;
  emails: DiscoveredEmail[];
  phones: DiscoveredPhone[];
  postalAddress?: string;
  contactPageUrl?: string;
  pagesChecked: string[];
  compliance?: ComplianceProfile & { country: string; disclaimer: string };
  summary: string;
  /** Populated when nothing was published; explains what to do instead. */
  advice?: string;
};

/* ----------------------------------------------------------------- segments */

/**
 * Who you are trying to reach changes which published inbox is the right one, and which pages
 * carry it. A creator publishes business terms on a media-kit or collaborate page; an investor
 * publishes a deal-submission address; an agency publishes a new-business address.
 *
 * The sourcing rule does not change between segments: Finder reads what the entity published on
 * its own site. Segments only change where it looks and how it ranks what it finds.
 */
export const SEGMENTS = {
  business: {
    label: "Business or organisation",
    preferred: ["info", "hello", "contact", "enquiries", "office", "sales"],
    paths: [] as string[],
    note: "General business contact.",
  },
  creator: {
    label: "Creator, influencer or model",
    preferred: ["business", "bookings", "booking", "management", "press", "media", "collab", "partnerships", "pr"],
    paths: ["/media-kit", "/press", "/collaborate", "/work-with-me", "/partnerships", "/bookings"],
    note:
      "Creators and models publish a business-enquiries address on their own site, media kit or link-in-bio page. That published address is the contact route — Finder does not read it from a social platform.",
  },
  founder: {
    label: "Founder or business owner",
    preferred: ["founders", "founder", "team", "hello", "info", "contact"],
    paths: ["/team", "/about", "/about-us", "/leadership"],
    note:
      "Reaches the founder through the company's own published inbox. Finder identifies the decision-maker's role, never a private individual's personal details.",
  },
  investor: {
    label: "Investor, VC or private equity",
    preferred: ["deals", "dealflow", "pitch", "submissions", "ir", "investor", "investors", "info", "contact"],
    paths: ["/contact", "/portfolio", "/submit", "/pitch", "/for-founders", "/team"],
    note:
      "Investment firms publish a deal-submission or IR address precisely so they can be reached. That inbox is the correct route and is far more likely to be read than a personal address.",
  },
} as const;

export type SegmentKey = keyof typeof SEGMENTS;
export const SEGMENT_KEYS = Object.keys(SEGMENTS) as SegmentKey[];

/* ------------------------------------------------------------------ parsing */

// Deliberately conservative: requires a plausible TLD so asset filenames and version strings
// are not mistaken for addresses.
const EMAIL_PATTERN = /[a-z0-9!#$%&'*+/=?^_`{|}~.-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}/gi;

/** Handles the `name [at] domain [dot] com` obfuscation businesses use to dodge scrapers. */
function deobfuscate(html: string): string {
  return html
    .replace(/\s*\[\s*at\s*\]\s*/gi, "@")
    .replace(/\s*\(\s*at\s*\)\s*/gi, "@")
    .replace(/\s+at\s+(?=[a-z0-9-]+\s*(?:\[|\()?\s*dot)/gi, "@")
    .replace(/\s*\[\s*dot\s*\]\s*/gi, ".")
    .replace(/\s*\(\s*dot\s*\)\s*/gi, ".");
}

export function segmentRank(address: string, segment: SegmentKey): number {
  const local = address.split("@")[0]?.toLowerCase().replace(/[._-]/g, "") ?? "";
  const preferred = SEGMENTS[segment].preferred;
  const index = preferred.findIndex(prefix => local === prefix.replace(/[._-]/g, "") || local.startsWith(prefix.replace(/[._-]/g, "")));
  return index === -1 ? 0 : preferred.length - index;
}

export function classifyEmail(address: string, siteDomain: string): Omit<DiscoveredEmail, "foundOn"> {
  const lower = address.toLowerCase();
  const [localPart, domain = ""] = lower.split("@");
  const normalizedLocal = localPart.replace(/\+.*$/, "");

  const ownDomain = Boolean(siteDomain) && (domain === siteDomain || domain.endsWith(`.${siteDomain}`));
  const freeProvider = FREE_PROVIDERS.includes(domain);

  let kind: ContactKind = "unknown";
  if (ROLE_PREFIXES.has(normalizedLocal) || ROLE_PREFIXES.has(normalizedLocal.replace(/[._-]/g, ""))) {
    kind = "role";
  } else if (/^[a-z]+([._-][a-z]+)?$/.test(normalizedLocal) && normalizedLocal.length <= 24) {
    // A short, name-shaped local part with no role word: most likely a person.
    kind = "individual";
  }

  const note =
    kind === "role"
      ? "Shared business inbox published by the organisation."
      : kind === "individual"
        ? "Looks like a named person. At a very small business this is often the only business address — still personal data in most markets."
        : "Published address; could not be classified confidently.";

  return { address: lower, kind, ownDomain, freeProvider, note };
}

export function extractEmails(html: string): string[] {
  const text = deobfuscate(html);
  const found = new Set<string>();

  for (const match of text.matchAll(/href=["']mailto:([^"'?]+)/gi)) {
    const value = decodeURIComponent(match[1]).trim().toLowerCase();
    if (value.includes("@")) found.add(value);
  }
  for (const match of text.matchAll(EMAIL_PATTERN)) found.add(match[0].trim().toLowerCase());

  return [...found].filter(address => {
    const domain = address.split("@")[1] ?? "";
    if (!domain || THIRD_PARTY_DOMAINS.some(bad => domain === bad || domain.endsWith(`.${bad}`))) return false;
    // Image and asset filenames occasionally survive the pattern; drop them.
    return !/\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/i.test(address);
  });
}

export function extractPhones(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/href=["']tel:([^"']+)/gi)) {
    const value = decodeURIComponent(match[1]).replace(/[^\d+()\-.\s]/g, "").trim();
    if (value.replace(/\D/g, "").length >= 7) found.add(value);
  }
  return [...found];
}

type JsonLdOrganisation = { name?: string; email?: string; telephone?: string; address?: unknown };

/** Reads schema.org Organization/LocalBusiness blocks, the most reliable source when present. */
export function extractJsonLd(html: string): JsonLdOrganisation {
  const result: JsonLdOrganisation = {};

  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue; // Malformed structured data is common; skip it rather than fail the lookup.
    }

    const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;

      if (Array.isArray(record["@graph"])) queue.push(...(record["@graph"] as unknown[]));
      if (Array.isArray(record.contactPoint)) queue.push(...(record.contactPoint as unknown[]));
      else if (record.contactPoint) queue.push(record.contactPoint);

      if (!result.name && typeof record.name === "string") result.name = record.name;
      if (!result.email && typeof record.email === "string") {
        result.email = record.email.replace(/^mailto:/i, "").trim();
      }
      if (!result.telephone && typeof record.telephone === "string") result.telephone = record.telephone.trim();
      if (!result.address && record.address) result.address = record.address;
    }
  }

  return result;
}

export function formatPostalAddress(address: unknown): string | undefined {
  if (typeof address === "string") return address.trim() || undefined;
  if (!address || typeof address !== "object") return undefined;

  const record = address as Record<string, unknown>;
  const parts = [
    record.streetAddress,
    record.addressLocality,
    record.addressRegion,
    record.postalCode,
    record.addressCountry,
  ]
    .map(part => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

/* ------------------------------------------------------------------ fetching */

async function fetchPage(url: URL): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTACT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "FinderBot/1.0 (+https://finderviews.online/bot) business-contact-lookup",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return null;

    const reader = response.body?.getReader();
    if (!reader) return null;
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
    return { html, finalUrl: response.url || url.toString() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Finds a same-site contact link in the page's own navigation. */
export function findContactLink(html: string, origin: string): string | null {
  const pattern = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = match[1];
    const label = match[2].replace(/<[^>]*>/g, " ").toLowerCase();
    if (!/contact|kontakt|impressum|get in touch|contacto/i.test(`${href} ${label}`)) continue;
    try {
      const resolved = new URL(href, origin);
      if (resolved.origin === new URL(origin).origin) return resolved.toString();
    } catch {
      continue;
    }
  }
  return null;
}

/* ----------------------------------------------------------------- discovery */

export async function discoverContacts(input: {
  website: string;
  name?: string;
  country?: string;
  segment?: SegmentKey;
}): Promise<ContactDiscoveryResult> {
  const segment: SegmentKey = input.segment ?? "business";
  const url = await assertPublicUrl(input.website);
  const siteDomain = url.hostname.replace(/^www\./i, "").toLowerCase();

  const pagesChecked: string[] = [];
  const emails = new Map<string, DiscoveredEmail>();
  const phones = new Map<string, DiscoveredPhone>();
  let organisationName = input.name;
  let postalAddress: string | undefined;
  let contactPageUrl: string | undefined;
  let reachable = false;

  const compliance = input.country
    ? { ...complianceFor(input.country), country: input.country, disclaimer: COMPLIANCE_DISCLAIMER }
    : undefined;

  const absorb = (html: string, foundOn: string) => {
    for (const address of extractEmails(html)) {
      if (emails.has(address)) continue;
      emails.set(address, { ...classifyEmail(address, siteDomain), foundOn });
    }
    for (const number of extractPhones(html)) {
      if (!phones.has(number)) phones.set(number, { number, foundOn });
    }

    const structured = extractJsonLd(html);
    if (structured.name && !organisationName) organisationName = structured.name;
    if (structured.email) {
      const address = structured.email.toLowerCase();
      if (!emails.has(address)) emails.set(address, { ...classifyEmail(address, siteDomain), foundOn });
    }
    if (structured.telephone && !phones.has(structured.telephone)) {
      phones.set(structured.telephone, { number: structured.telephone, foundOn });
    }
    if (!postalAddress) postalAddress = formatPostalAddress(structured.address);
  };

  // 1. The homepage, which is usually enough.
  const home = await fetchPage(url);
  if (home) {
    reachable = true;
    pagesChecked.push(home.finalUrl);
    absorb(home.html, home.finalUrl);

    // 2. The contact link the site itself advertises, which beats guessing paths.
    const linked = findContactLink(home.html, home.finalUrl);
    if (linked) {
      const page = await fetchPage(new URL(linked));
      if (page) {
        contactPageUrl = page.finalUrl;
        pagesChecked.push(page.finalUrl);
        absorb(page.html, page.finalUrl);
      }
    }
  }

  // 3. Only if still empty, try the conventional paths.
  if (reachable && emails.size === 0) {
    for (const path of [...SEGMENTS[segment].paths, ...CONTACT_PATHS]) {
      if (pagesChecked.length >= MAX_PAGES) break;
      const candidate = new URL(path, url.origin);
      if (pagesChecked.includes(candidate.toString())) continue;

      const page = await fetchPage(candidate);
      if (!page) continue;
      pagesChecked.push(page.finalUrl);
      absorb(page.html, page.finalUrl);
      if (!contactPageUrl) contactPageUrl = page.finalUrl;
      if (emails.size > 0) break;
    }
  }

  const emailList = [...emails.values()].sort((a, b) => {
    // Segment-preferred inboxes first, then own-domain role addresses: the most useful and the
    // safest to contact.
    const score = (item: DiscoveredEmail) =>
      segmentRank(item.address, segment) * 10 + (item.kind === "role" ? 2 : 0) + (item.ownDomain ? 1 : 0);
    return score(b) - score(a);
  });
  const phoneList = [...phones.values()];

  const roleCount = emailList.filter(item => item.kind === "role").length;
  const summary = !reachable
    ? "The website could not be reached, so nothing could be read from it."
    : emailList.length === 0 && phoneList.length === 0
      ? "This business publishes no email address or phone number Finder could read."
      : `Found ${emailList.length} published email address(es)${roleCount > 0 ? ` (${roleCount} shared business inbox)` : ""} and ${phoneList.length} phone number(s).`;

  const advice =
    reachable && emailList.length === 0
      ? contactPageUrl
        ? "No address is published — the site uses a contact form. Use the form, or the phone number if one is listed."
        : "No address is published. The phone number or the public listing is the route here."
      : !reachable
        ? "Check the address, or fall back to the public business listing for a phone number."
        : undefined;

  return {
    query: { name: input.name, website: url.toString(), country: input.country, segment },
    segmentNote: SEGMENTS[segment].note,
    resolvedUrl: url.toString(),
    reachable,
    organisationName,
    emails: emailList,
    phones: phoneList,
    postalAddress,
    contactPageUrl,
    pagesChecked,
    compliance,
    summary,
    advice,
  };
}
