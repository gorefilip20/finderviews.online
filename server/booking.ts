/**
 * Booking-link detection.
 *
 * A published scheduling link is the single warmest thing Finder can find. Its entire purpose is
 * to receive bookings from strangers — the owner set it up, put it on their own site, and pointed
 * at it. Using it is not cold outreach; it is accepting an invitation.
 *
 * Detection is by provider domain, so a link is only reported when it genuinely resolves to a
 * scheduling tool rather than a page that merely says "book a call".
 */

export type BookingProvider =
  | "Calendly"
  | "Cal.com"
  | "SavvyCal"
  | "TidyCal"
  | "HubSpot Meetings"
  | "Acuity"
  | "Zcal"
  | "Koalendar"
  | "YouCanBookMe"
  | "Microsoft Bookings"
  | "Google Calendar"
  | "Zoho Bookings"
  | "Chili Piper"
  | "SimplyBook"
  | "Doodle";

const PROVIDER_PATTERNS: { provider: BookingProvider; pattern: RegExp }[] = [
  { provider: "Calendly", pattern: /(^|\.)calendly\.com$/i },
  { provider: "Cal.com", pattern: /(^|\.)cal\.com$/i },
  { provider: "SavvyCal", pattern: /(^|\.)savvycal\.com$/i },
  { provider: "TidyCal", pattern: /(^|\.)tidycal\.com$/i },
  { provider: "HubSpot Meetings", pattern: /(^|\.)meetings\.hubspot\.com$|(^|\.)meetings-\w+\.hubspot\.com$/i },
  { provider: "Acuity", pattern: /(^|\.)acuityscheduling\.com$|(^|\.)app\.squarespacescheduling\.com$/i },
  { provider: "Zcal", pattern: /(^|\.)zcal\.co$/i },
  { provider: "Koalendar", pattern: /(^|\.)koalendar\.com$/i },
  { provider: "YouCanBookMe", pattern: /(^|\.)youcanbook\.me$|(^|\.)youcanbookme\.com$/i },
  { provider: "Microsoft Bookings", pattern: /(^|\.)outlook\.office365\.com$|(^|\.)bookings\.microsoft\.com$/i },
  { provider: "Google Calendar", pattern: /(^|\.)calendar\.app\.google$/i },
  { provider: "Zoho Bookings", pattern: /(^|\.)zohobookings\.com$|(^|\.)bookings\.zoho\.com$/i },
  { provider: "Chili Piper", pattern: /(^|\.)chilipiper\.com$/i },
  { provider: "SimplyBook", pattern: /(^|\.)simplybook\.me$/i },
  { provider: "Doodle", pattern: /(^|\.)doodle\.com$/i },
];

export type BookingLink = {
  provider: BookingProvider;
  url: string;
  label: string;
  /** What the link appears to be for, read from its own label and path. */
  intent: "intro" | "sales" | "consultation" | "office-hours" | "interview" | "unspecified";
  minutes: number | null;
};

export function providerFor(hostname: string): BookingProvider | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return PROVIDER_PATTERNS.find(entry => entry.pattern.test(host))?.provider ?? null;
}

/** Reads a duration out of a Calendly-style slug such as `/alex/30min` or `/intro-15`. */
export function durationFrom(url: string, label: string): number | null {
  const match = /(\d{1,3})\s*-?\s*(?:min|minute|minutes|m\b)/i.exec(`${url} ${label}`);
  if (!match) return null;
  const minutes = Number(match[1]);
  return minutes >= 5 && minutes <= 240 ? minutes : null;
}

export function intentFrom(url: string, label: string): BookingLink["intent"] {
  const text = `${url} ${label}`.toLowerCase();
  // \bama\b is anchored: without boundaries it matches inside ordinary names such as "amara".
  if (/office.?hours|\bama\b|ask.?me/.test(text)) return "office-hours";
  if (/interview|podcast|guest|record/.test(text)) return "interview";
  if (/demo|sales|pricing|buy|quote/.test(text)) return "sales";
  if (/consult|advis|coach|mentor|strategy|audit/.test(text)) return "consultation";
  if (/intro|chat|coffee|hello|meet|discovery|connect|15|20|30/.test(text)) return "intro";
  return "unspecified";
}

export function findBookingLinks(html: string, baseUrl: string): BookingLink[] {
  const found = new Map<string, BookingLink>();

  const anchorPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]{0,140}?)<\/a>/gi;
  const candidates: { href: string; label: string }[] = [];

  for (const match of html.matchAll(anchorPattern)) {
    candidates.push({ href: match[1], label: match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() });
  }
  // Embedded widgets carry the destination in a data attribute rather than an anchor.
  for (const match of html.matchAll(/data-url=["']([^"']+)["']/gi)) {
    candidates.push({ href: match[1], label: "Embedded scheduler" });
  }

  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate.href, baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;

    const provider = providerFor(url.hostname);
    if (!provider) continue;

    // A bare provider homepage is not somebody's booking page.
    if (url.pathname === "/" || url.pathname === "") continue;

    const key = url.toString();
    if (found.has(key)) continue;

    found.set(key, {
      provider,
      url: key,
      label: candidate.label.slice(0, 120) || "Book a time",
      intent: intentFrom(key, candidate.label),
      minutes: durationFrom(key, candidate.label),
    });
  }

  return [...found.values()];
}
