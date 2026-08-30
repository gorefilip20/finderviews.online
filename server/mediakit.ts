/**
 * Media-kit parser.
 *
 * Creators publish their audience size, rates and past partners on a media kit — the same pages
 * contact discovery already fetches for the creator segment. Reading them into structured,
 * comparable fields costs almost nothing extra and is the difference between a list of names and
 * a shortlist you can actually choose from.
 *
 * Everything here comes from what the creator chose to publish about their own business. Nothing
 * is read from a social platform, and no figure is inferred: an unstated rate stays unstated.
 */

export type FollowerCount = { platform: string; followers: number; raw: string };
export type RateCard = { deliverable: string; amount: number; currency: string; raw: string };
export type AudienceFact = { kind: "gender" | "age" | "location" | "engagement"; value: string; raw: string };

export type MediaKitProfile = {
  creatorName?: string;
  followers: FollowerCount[];
  totalReach: number;
  rates: RateCard[];
  audience: AudienceFact[];
  partners: string[];
  niches: string[];
  /** True when the page carried none of the things a media kit normally carries. */
  sparse: boolean;
  summary: string;
};

const PLATFORMS = [
  "instagram", "tiktok", "youtube", "twitter", "x", "facebook", "linkedin", "pinterest",
  "snapchat", "twitch", "substack", "threads", "newsletter", "blog", "podcast",
];

const NICHE_TERMS = [
  "beauty", "skincare", "cosmetics", "fashion", "style", "fitness", "wellness", "yoga",
  "nutrition", "food", "recipe", "travel", "lifestyle", "parenting", "home", "interiors",
  "gaming", "tech", "finance", "business", "education", "music", "art", "photography",
  "sustainability", "outdoors", "automotive", "pets", "books", "comedy", "sports",
];

/** Turns "1.2M", "125K", "45,000" into a number. Returns null when it is not a count. */
export function parseCount(raw: string): number | null {
  const match = /^([\d.,]+)\s*([kmb])?$/i.exec(raw.trim());
  if (!match) return null;

  const digits = match[1].replace(/,/g, "");
  const base = Number(digits);
  if (!Number.isFinite(base)) return null;

  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "b" ? 1_000_000_000 : suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  const value = base * multiplier;

  // A media kit figure below 100 is almost always a percentage or a price, not an audience.
  return value >= 100 && value <= 5_000_000_000 ? Math.round(value) : null;
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFollowers(html: string): FollowerCount[] {
  const text = stripTags(html);
  const found = new Map<string, FollowerCount>();

  // "Instagram 125K", "125K on TikTok", "YouTube: 1.2M subscribers"
  const patterns = [
    new RegExp(`\\b(${PLATFORMS.join("|")})\\b[^\\d\\n]{0,24}([\\d.,]+\\s*[kmb]?)\\b`, "gi"),
    new RegExp(`([\\d.,]+\\s*[kmb]?)\\s*(?:followers|subscribers|fans)?\\s*(?:on|@)\\s*\\b(${PLATFORMS.join("|")})\\b`, "gi"),
  ];

  for (const [index, pattern] of patterns.entries()) {
    for (const match of text.matchAll(pattern)) {
      const platform = (index === 0 ? match[1] : match[2]).toLowerCase();
      const followers = parseCount(index === 0 ? match[2] : match[1]);
      if (followers === null) continue;

      const normalized = platform === "x" ? "twitter" : platform;
      const existing = found.get(normalized);
      // Keep the largest figure quoted for a platform; kits often restate a rounded number.
      if (!existing || followers > existing.followers) {
        found.set(normalized, { platform: normalized, followers, raw: match[0].trim() });
      }
    }
  }

  return [...found.values()].sort((a, b) => b.followers - a.followers);
}

/**
 * Splits markup into the visual blocks a reader sees. Rates are parsed per block: a single
 * flattened string lets a greedy match run past the end of one rate line and swallow the label
 * belonging to the next one.
 */
export function textBlocks(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map(line => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function parseRates(html: string): RateCard[] {
  const rates: RateCard[] = [];
  const seen = new Set<string>();

  // "$500 per post", "£1,200 per reel", "Reels — from €800"
  const pattern =
    /(?:([A-Za-z][A-Za-z ]{2,28}?)\s*[—–\-:]\s*)?(?:from\s+)?([$£€₦₹])\s?([\d,]+(?:\.\d{2})?)\s*(?:per\s+|\/\s*|for\s+)?([A-Za-z]+(?:\s[A-Za-z]+){0,2})?/g;

  for (const block of textBlocks(html)) {
    for (const match of block.matchAll(pattern)) {
      const amount = Number(match[3].replace(/,/g, ""));
      if (!Number.isFinite(amount) || amount < 20 || amount > 5_000_000) continue;

      const deliverable = (match[4] || match[1] || "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!deliverable) continue;
      // Only keep phrases that actually name a piece of content.
      if (!/post|reel|story|stories|video|photo|shoot|day|campaign|package|bundle|integration|mention|ugc|feed|short|tiktok|carousel/i.test(deliverable)) {
        continue;
      }

      const currency = { "$": "USD", "£": "GBP", "€": "EUR", "₦": "NGN", "₹": "INR" }[match[2]] ?? "USD";
      const key = `${deliverable.toLowerCase()}|${amount}|${currency}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rates.push({ deliverable, amount, currency, raw: match[0].trim().slice(0, 80) });
    }
  }

  return rates.slice(0, 12);
}

export function parseAudience(html: string): AudienceFact[] {
  const text = stripTags(html);
  const facts: AudienceFact[] = [];

  const gender = /(\d{1,3})\s*%\s*(female|male|women|men)/i.exec(text);
  if (gender && Number(gender[1]) <= 100) {
    facts.push({ kind: "gender", value: `${gender[1]}% ${gender[2].toLowerCase()}`, raw: gender[0] });
  }

  const age = /(\d{2})\s*[-–]\s*(\d{2})\s*(?:years|yrs|year olds)?/.exec(text);
  if (age && Number(age[1]) >= 13 && Number(age[2]) <= 99) {
    facts.push({ kind: "age", value: `${age[1]}–${age[2]}`, raw: age[0] });
  }

  const engagement = /(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:average\s+)?engagement/i.exec(text);
  if (engagement) {
    facts.push({ kind: "engagement", value: `${engagement[1]}%`, raw: engagement[0] });
  }

  const location = /(\d{1,3})\s*%\s*(?:based\s+)?in\s+(?:the\s+)?([A-Z][A-Za-z .]{2,24})/.exec(text);
  if (location && Number(location[1]) <= 100) {
    facts.push({ kind: "location", value: `${location[1]}% ${location[2].trim()}`, raw: location[0] });
  }

  return facts;
}

export function parsePartners(html: string): string[] {
  const partners = new Set<string>();

  // Brand logo walls carry the name in alt text more reliably than in the copy.
  for (const match of html.matchAll(/<img[^>]+alt=["']([^"']{2,40})["']/gi)) {
    const alt = match[1].trim();
    if (/logo|brand|partner|client/i.test(match[0]) && !/^(logo|image|photo|icon)$/i.test(alt)) {
      partners.add(alt.replace(/\s*logo\s*/i, "").trim());
    }
  }

  const text = stripTags(html);
  const phrase = /(?:worked with|partnered with|collaborations? with|as seen (?:in|on)|featured (?:in|on))\s*:?\s*([^.]{4,160})/i.exec(text);
  if (phrase) {
    for (const part of phrase[1].split(/,| and | \| |•|·/)) {
      const name = part.trim();
      if (name.length >= 2 && name.length <= 40 && /[A-Za-z]/.test(name)) partners.add(name);
    }
  }

  return [...partners].filter(Boolean).slice(0, 20);
}

export function parseNiches(html: string): string[] {
  const text = stripTags(html).toLowerCase();
  return NICHE_TERMS.filter(term => new RegExp(`\\b${term}\\b`).test(text)).slice(0, 8);
}

export function parseMediaKit(html: string, creatorName?: string): MediaKitProfile {
  const followers = parseFollowers(html);
  const rates = parseRates(html);
  const audience = parseAudience(html);
  const partners = parsePartners(html);
  const niches = parseNiches(html);

  const totalReach = followers.reduce((sum, item) => sum + item.followers, 0);
  const sparse = followers.length === 0 && rates.length === 0 && audience.length === 0;

  const summary = sparse
    ? "This page does not publish audience figures or rates. Ask for a media kit directly."
    : [
        followers.length > 0 ? `${followers.length} platform(s), ${totalReach.toLocaleString("en-US")} combined followers` : null,
        rates.length > 0 ? `${rates.length} published rate(s)` : null,
        audience.length > 0 ? `${audience.length} audience detail(s)` : null,
        partners.length > 0 ? `${partners.length} named partner(s)` : null,
      ]
        .filter(Boolean)
        .join(" · ");

  return { creatorName, followers, totalReach, rates, audience, partners, niches, sparse, summary };
}
