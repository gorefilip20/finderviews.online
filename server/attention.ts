/**
 * Borrowed attention.
 *
 * Building an audience from scratch is slow. Other people already built one, and many of them
 * published a standing invitation to be approached: a booking link, a be-a-guest page, a sponsor
 * page, a call for speakers. Finder calls these **open doors**, and finding them is the whole
 * point of this module.
 *
 * The distinction matters commercially and ethically. A cold contact address is permission you
 * assume. An open door is permission the owner published, for exactly this purpose. Walking
 * through one is not cold outreach — it is accepting an invitation, and it converts accordingly.
 *
 * Sourcing rule is unchanged from the rest of Finder: everything here is read from the entity's
 * own site. Nothing is scraped from a social platform and no audience figure is invented.
 */
import { findBookingLinks, type BookingLink } from "./booking";
import { parseFollowers, parseNiches, textBlocks, type FollowerCount } from "./mediakit";

/* ------------------------------------------------------------------- doors */

export type DoorKey =
  | "book_a_call"
  | "be_a_guest"
  | "sponsor"
  | "speak"
  | "write"
  | "collaborate"
  | "join_community"
  | "submit";

export type OpenDoor = {
  key: DoorKey;
  label: string;
  url?: string;
  evidence: string;
  /** What this door is worth to someone with nothing yet. */
  why: string;
  /** How to walk through it well. */
  approach: string;
};

const DOOR_DEFINITIONS: {
  key: DoorKey;
  label: string;
  paths: RegExp;
  copy: RegExp;
  why: string;
  approach: string;
}[] = [
  {
    key: "be_a_guest",
    label: "Pitch yourself as a guest",
    paths: /be-a-guest|guest-application|apply-to-be|\/guest|pitch-a-guest|guest-form|nominate/i,
    copy: /be a guest|apply to be a guest|pitch (?:us )?a guest|want to be on the show|guest application|nominate a guest/i,
    why: "You speak directly to an audience someone else spent years building, and you keep the recording forever.",
    approach:
      "Lead with the one story only you can tell, not with what you sell. Name the episode you would make and who it helps.",
  },
  {
    key: "sponsor",
    label: "Sponsor or advertise",
    paths: /\/sponsor|\/advertise|advertising|\/ads\b|media-kit|partnerships?\/brands/i,
    copy: /sponsor (?:us|this|the)|advertise with us|advertising enquiries|sponsorship|media kit|rate card/i,
    why: "The fastest route to a defined audience, and the only one where the price is stated up front.",
    approach:
      "Ask for the media kit and the last three sponsors. Start with one placement, not a package — you are testing the audience, not committing to it.",
  },
  {
    key: "speak",
    label: "Apply to speak",
    paths: /call-for-(?:speakers|papers|proposals)|\/cfp|\/speak|speaker-application|submit-a-talk/i,
    copy: /call for (?:speakers|papers|proposals)|apply to speak|submit a talk|speaker application/i,
    why: "A stage borrows credibility as well as attention. The audience arrives already predisposed to listen.",
    approach:
      "Submit a talk that teaches something specific and does not mention your product until the last slide. Reuse the talk as content afterwards.",
  },
  {
    key: "write",
    label: "Write for them",
    paths: /write-for-us|\/contribute|contributor|guest-post|submit-(?:a-)?(?:post|article|story)/i,
    copy: /write for us|guest post|become a contributor|submit an article|pitch us a story/i,
    why: "Their readers, their credibility, your name on it — and usually a link back.",
    approach:
      "Pitch three headlines, not a finished draft. Match the format and length of their most-shared recent piece.",
  },
  {
    key: "collaborate",
    label: "Propose a collaboration",
    paths: /\/collaborate|work-with-(?:me|us)|\/partner|partnerships?$|co-marketing/i,
    copy: /collaborat|work with (?:me|us)|partner with us|open to partnerships/i,
    why: "Two small audiences pointed at each other beat one small audience shouting.",
    approach: "Propose the specific swap — what you give, what you ask, and the date. Vague partnership offers get ignored.",
  },
  {
    key: "join_community",
    label: "Join the community",
    paths: /\/community|\/join|\/slack|\/discord|\/circle|\/forum|\/members/i,
    copy: /join (?:our|the) (?:community|slack|discord)|become a member|join the group/i,
    why: "The cheapest door of all: you can be useful in public before you ever ask for anything.",
    approach:
      "Answer questions for a month before you mention what you do. Communities remember who helped and ignore who pitched.",
  },
  {
    key: "submit",
    label: "Submit your product",
    paths: /submit-(?:a-)?(?:tool|product|startup|site|resource)|\/submit|add-your|list-your/i,
    copy: /submit (?:your|a) (?:tool|product|startup|site)|get listed|add your (?:tool|product)/i,
    why: "A directory listing is small, permanent and compounds with search.",
    approach: "Submit with a real screenshot and a one-line description that names the buyer, not the technology.",
  },
];

/* ---------------------------------------------------------------- channels */

export type ChannelType = "podcast" | "newsletter" | "community" | "event" | "creator" | "company" | "blog" | "unknown";

const CHANNEL_SIGNALS: { type: ChannelType; pattern: RegExp; weight: number }[] = [
  { type: "podcast", pattern: /podcast|episode\s*\d|listen on|apple podcasts|spotify\.com\/show|rss feed|subscribe on/i, weight: 3 },
  { type: "newsletter", pattern: /newsletter|subscribe|every (?:week|monday|friday)|issue\s*#?\d|substack|beehiiv|convertkit|mailchimp/i, weight: 3 },
  { type: "community", pattern: /community|members|slack|discord|forum|circle\.so|join the group/i, weight: 3 },
  { type: "event", pattern: /conference|summit|meetup|tickets|agenda|speakers|venue|register now|\b20\d\d edition/i, weight: 3 },
  { type: "creator", pattern: /media kit|collaborat|followers|my content|work with me|brand partnerships/i, weight: 2 },
  { type: "blog", pattern: /archive|read more|posted on|categories|tags/i, weight: 1 },
  { type: "company", pattern: /our product|pricing|customers|case stud|book a demo|our team/i, weight: 2 },
];

export function detectChannelType(html: string, url: string): { type: ChannelType; confidence: number } {
  const haystack = `${url} ${textBlocks(html).slice(0, 400).join(" ")}`;
  const scores = new Map<ChannelType, number>();

  for (const signal of CHANNEL_SIGNALS) {
    const matches = haystack.match(new RegExp(signal.pattern.source, "gi"));
    if (matches) scores.set(signal.type, (scores.get(signal.type) ?? 0) + matches.length * signal.weight);
  }

  if (scores.size === 0) return { type: "unknown", confidence: 0 };

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((sum, entry) => sum + entry[1], 0);
  return { type: ranked[0][0], confidence: Math.round((ranked[0][1] / total) * 100) };
}

/* ---------------------------------------------------------------- audience */

export type AudienceSignal = { kind: string; value: string; number: number | null; raw: string };

/**
 * Audience proxies an entity states about itself. Deliberately conservative: a figure is only
 * reported when the page actually claims it, because an invented audience number would make the
 * whole ranking worthless.
 */
export function audienceSignals(html: string): { signals: AudienceSignal[]; followers: FollowerCount[]; estimate: number | null } {
  const signals: AudienceSignal[] = [];
  const text = textBlocks(html).join(" ");

  const patterns: { kind: string; pattern: RegExp }[] = [
    { kind: "subscribers", pattern: /([\d.,]+\s*[kmb]?)\s*(?:\+\s*)?(?:subscribers|readers|sign-?ups)/gi },
    { kind: "listeners", pattern: /([\d.,]+\s*[kmb]?)\s*(?:\+\s*)?(?:listeners|downloads|plays)\b/gi },
    { kind: "members", pattern: /([\d.,]+\s*[kmb]?)\s*(?:\+\s*)?members\b/gi },
    { kind: "attendees", pattern: /([\d.,]+\s*[kmb]?)\s*(?:\+\s*)?(?:attendees|delegates|participants)/gi },
  ];

  for (const { kind, pattern } of patterns) {
    for (const match of text.matchAll(pattern)) {
      const parsed = parseAudienceNumber(match[1]);
      if (parsed === null) continue;
      signals.push({ kind, value: match[1].trim(), number: parsed, raw: match[0].trim().slice(0, 80) });
    }
  }

  const episodes = /(?:episode|ep\.?)\s*#?(\d{1,4})\b/gi;
  const episodeNumbers = [...text.matchAll(episodes)].map(match => Number(match[1])).filter(Number.isFinite);
  if (episodeNumbers.length > 0) {
    const highest = Math.max(...episodeNumbers);
    if (highest >= 3 && highest <= 5000) {
      signals.push({ kind: "episodes", value: String(highest), number: highest, raw: `Episode ${highest}` });
    }
  }

  const followers = parseFollowers(html);
  const stated = signals.map(signal => signal.number ?? 0);
  const social = followers.reduce((sum, item) => sum + item.followers, 0);
  const estimate = Math.max(...stated, social, 0) || null;

  return { signals, followers, estimate };
}

function parseAudienceNumber(raw: string): number | null {
  const match = /^([\d.,]+)\s*([kmb])?$/i.exec(raw.trim());
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === "b" ? 1e9 : suffix === "m" ? 1e6 : suffix === "k" ? 1e3 : 1;
  const value = base * multiplier;
  return value >= 50 && value <= 5e9 ? Math.round(value) : null;
}

/* ------------------------------------------------------------------ doors */

export function findOpenDoors(html: string, baseUrl: string): OpenDoor[] {
  const doors: OpenDoor[] = [];
  const seen = new Set<DoorKey>();

  const anchors: { href: string; label: string }[] = [];
  for (const match of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,140}?)<\/a>/gi)) {
    anchors.push({ href: match[1], label: match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() });
  }
  const pageText = textBlocks(html).join(" ");

  for (const definition of DOOR_DEFINITIONS) {
    if (seen.has(definition.key)) continue;

    const anchor = anchors.find(item => definition.paths.test(item.href) || definition.copy.test(item.label));
    if (anchor) {
      let resolved: string | undefined;
      try {
        resolved = new URL(anchor.href, baseUrl).toString();
      } catch {
        resolved = undefined;
      }
      seen.add(definition.key);
      doors.push({
        key: definition.key,
        label: definition.label,
        url: resolved,
        evidence: `Links to "${anchor.label || anchor.href}".`,
        why: definition.why,
        approach: definition.approach,
      });
      continue;
    }

    const copyMatch = definition.copy.exec(pageText);
    if (copyMatch) {
      seen.add(definition.key);
      doors.push({
        key: definition.key,
        label: definition.label,
        evidence: `The page says "${copyMatch[0].trim().slice(0, 70)}".`,
        why: definition.why,
        approach: definition.approach,
      });
    }
  }

  // A published booking link is the strongest door there is, so it is added explicitly.
  const bookings = findBookingLinks(html, baseUrl);
  if (bookings.length > 0) {
    const best = pickBestBooking(bookings);
    doors.unshift({
      key: "book_a_call",
      label: "Book time directly",
      url: best.url,
      evidence: `Publishes a ${best.provider} link${best.minutes ? ` for a ${best.minutes}-minute slot` : ""}.`,
      why: "They set this up so strangers could book them. No pitch is needed to get the meeting — only to deserve the next one.",
      approach:
        "Book the shortest slot offered and put the reason in the booking notes. Arrive with one specific question, not a pitch.",
    });
  }

  return doors;
}

/** Prefers a short, clearly introductory slot: easiest to get and least presumptuous to take. */
export function pickBestBooking(links: BookingLink[]): BookingLink {
  const rank = (link: BookingLink) => {
    const intentScore = { intro: 5, "office-hours": 4, consultation: 3, interview: 3, unspecified: 2, sales: 1 }[link.intent];
    const durationScore = link.minutes === null ? 1 : link.minutes <= 20 ? 3 : link.minutes <= 45 ? 2 : 1;
    return intentScore * 10 + durationScore;
  };
  return [...links].sort((a, b) => rank(b) - rank(a))[0];
}

/* ------------------------------------------------------------------ score */

export type BorrowFactor = { label: string; value: number; weight: number; note: string };

export type BorrowScore = {
  score: number;
  band: "open" | "reachable" | "closed";
  factors: BorrowFactor[];
  headline: string;
};

/**
 * Openness is weighted above audience size on purpose.
 *
 * A modest audience you can actually reach this week is worth more than a huge one with no way
 * in. The common failure in audience-borrowing is chasing the biggest name and never getting a
 * reply; this scoring is built to steer against exactly that.
 */
export function scoreBorrowability(params: {
  doors: OpenDoor[];
  audienceEstimate: number | null;
  topicOverlap: number;
  channelConfidence: number;
  hasContact: boolean;
}): BorrowScore {
  const hasBooking = params.doors.some(door => door.key === "book_a_call");
  const doorCount = params.doors.length;

  const opennessValue = hasBooking ? 100 : doorCount >= 3 ? 85 : doorCount === 2 ? 70 : doorCount === 1 ? 55 : 10;
  const audienceValue =
    params.audienceEstimate === null
      ? 30
      : Math.min(100, Math.round((Math.log10(params.audienceEstimate) / Math.log10(1_000_000)) * 100));
  const relevanceValue = Math.min(100, params.topicOverlap * 25 + params.channelConfidence * 0.4);
  const reachabilityValue = params.hasContact ? 80 : hasBooking ? 90 : 25;

  const factors: BorrowFactor[] = [
    {
      label: "Openness",
      value: opennessValue,
      weight: 40,
      note: hasBooking
        ? "Publishes a booking link — a standing invitation."
        : doorCount > 0
          ? `${doorCount} published way(s) to approach them.`
          : "No published route for being approached.",
    },
    {
      label: "Audience",
      value: audienceValue,
      weight: 25,
      note:
        params.audienceEstimate === null
          ? "No audience figure published — excluded from confidence."
          : `States roughly ${params.audienceEstimate.toLocaleString("en-US")} people.`,
    },
    {
      label: "Relevance",
      value: relevanceValue,
      weight: 20,
      note: params.topicOverlap > 0 ? `${params.topicOverlap} topic(s) overlap with yours.` : "No stated topic overlap.",
    },
    {
      label: "Reachability",
      value: reachabilityValue,
      weight: 15,
      note: params.hasContact ? "A contact address is published." : hasBooking ? "Reachable through the booking link." : "No published contact route.",
    },
  ];

  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const score = Math.round(factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0) / totalWeight);

  // Hard gate: with no published door and no contact address there is genuinely no route in,
  // however large the audience. Calling that "reachable" because the numbers are big would be
  // precisely the mistake this feature exists to stop people making.
  const noRouteIn = doorCount === 0 && !params.hasContact;
  const band: BorrowScore["band"] = noRouteIn
    ? "closed"
    : hasBooking || score >= 68
      ? "open"
      : score >= 45
        ? "reachable"
        : "closed";
  const headline =
    band === "open"
      ? hasBooking
        ? "Door is wide open — you can book time with them today."
        : "Several published routes in. Approach this week."
      : band === "reachable"
        ? "Reachable, but you will need a reason they care about."
        : "No published way in. Earn their attention somewhere else first.";

  return { score, band, factors, headline };
}

/* --------------------------------------------------------------- analysis */

export type AttentionAnalysis = {
  url: string;
  finalUrl: string;
  reachable: boolean;
  name?: string;
  channel: { type: ChannelType; confidence: number };
  topics: string[];
  doors: OpenDoor[];
  bookingLinks: BookingLink[];
  audience: ReturnType<typeof audienceSignals>;
  score: BorrowScore;
  nextStep: string;
  summary: string;
};

function readTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]{0,160}?)<\/title>/i.exec(html);
  if (!match) return undefined;
  return match[1]
    .replace(/\s+/g, " ")
    .replace(/\s*[|–—-]\s*(home|official site|podcast|newsletter)\s*$/i, "")
    .trim();
}

/**
 * Turns one fetched page into a ranked, actionable read. `myTopics` is the caller's own subject
 * matter, used only to measure overlap.
 */
export function analyseAttentionPage(params: {
  html: string;
  url: string;
  finalUrl: string;
  myTopics?: string[];
  hasContact?: boolean;
}): AttentionAnalysis {
  const { html, finalUrl } = params;

  const channel = detectChannelType(html, finalUrl);
  const topics = parseNiches(html);
  const doors = findOpenDoors(html, finalUrl);
  const bookingLinks = findBookingLinks(html, finalUrl);
  const audience = audienceSignals(html);

  const mine = (params.myTopics ?? []).map(topic => topic.toLowerCase().trim()).filter(Boolean);
  const topicOverlap = mine.length === 0 ? 0 : topics.filter(topic => mine.some(item => item.includes(topic) || topic.includes(item))).length;

  const score = scoreBorrowability({
    doors,
    audienceEstimate: audience.estimate,
    topicOverlap,
    channelConfidence: channel.confidence,
    hasContact: Boolean(params.hasContact),
  });

  const primary = doors[0];
  const nextStep = primary
    ? `${primary.label}. ${primary.approach}`
    : "No published door. Follow their work, reply usefully in public, and approach once you are a familiar name.";

  const summary = [
    channel.type !== "unknown" ? `Looks like a ${channel.type}.` : "Channel type unclear.",
    doors.length > 0 ? `${doors.length} open door(s).` : "No open doors found.",
    audience.estimate ? `States about ${audience.estimate.toLocaleString("en-US")} people.` : "No audience figure published.",
  ].join(" ");

  return {
    url: params.url,
    finalUrl,
    reachable: true,
    name: readTitle(html),
    channel,
    topics,
    doors,
    bookingLinks,
    audience,
    score,
    nextStep,
    summary,
  };
}

/** Where to go looking, when the user has no list yet. Plain guidance, not a data source. */
export const HUNTING_GROUNDS: { channel: ChannelType; where: string; tip: string }[] = [
  {
    channel: "podcast",
    where: "Podcast directories and the guest lists of shows your buyers already listen to",
    tip: "Shows under 5,000 listeners reply the most and still convert — they need guests more than you need them.",
  },
  {
    channel: "newsletter",
    where: "Substack and beehiiv leaderboards for your category, and the sponsor slots of newsletters you read",
    tip: "Ask what a single placement costs before a package. One test tells you whether the audience is really yours.",
  },
  {
    channel: "community",
    where: "Slack and Discord directories, industry forums, and the communities your first customers already belong to",
    tip: "Be useful for a month before mentioning what you do. This is the slowest door and the most durable.",
  },
  {
    channel: "event",
    where: "Meetup and conference sites in your city, and any event publishing a call for speakers",
    tip: "Local meetups almost always need speakers and will say yes far faster than a conference.",
  },
  {
    channel: "creator",
    where: "Creators whose audience matches yours and who publish a media kit",
    tip: "A creator with 20k engaged followers in your niche beats one with 500k who is not.",
  },
];
