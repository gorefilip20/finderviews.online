/**
 * Creator ↔ brand matching, and the collaboration brief that follows it.
 *
 * Deliberately one-sided: a workspace builds its own creator roster with the media-kit parser,
 * then matches that roster against a brand it already works with. No two-sided marketplace, no
 * cold-start problem, and every creator in the roster is one whose own published figures were
 * read rather than bought.
 *
 * Match scores explain themselves. A number without reasons is not usable in a client
 * conversation, which is where these results actually get spent.
 */
import type { MediaKitProfile } from "./mediakit";

export type BrandBrief = {
  name: string;
  category: string;
  city?: string;
  country?: string;
  /** Total campaign budget in the brand's currency. */
  budget?: number;
  currency?: string;
  goal?: "awareness" | "launch" | "sales" | "content";
  audienceNote?: string;
};

export type CreatorCandidate = MediaKitProfile & {
  id?: number;
  website: string;
  contactEmail?: string | null;
  city?: string | null;
  country?: string | null;
};

export type CollabStructure = "gifted" | "paid" | "affiliate" | "hybrid";

export type CreatorMatch = {
  creator: CreatorCandidate;
  score: number;
  reasons: string[];
  concerns: string[];
  suggestedStructure: CollabStructure;
  estimatedCost: number | null;
  currency: string;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

/** Cheapest published rate, which is the realistic entry point for a first collaboration. */
export function entryRate(creator: CreatorCandidate): { amount: number; currency: string } | null {
  if (creator.rates.length === 0) return null;
  const cheapest = creator.rates.reduce((low, rate) => (rate.amount < low.amount ? rate : low));
  return { amount: cheapest.amount, currency: cheapest.currency };
}

export function suggestStructure(params: {
  budget?: number;
  entry: { amount: number; currency: string } | null;
  reach: number;
  goal?: BrandBrief["goal"];
}): CollabStructure {
  // No published rate and a small audience: gifted product is the normal opening.
  if (!params.entry && params.reach < 25_000) return "gifted";
  if (params.goal === "sales") return params.entry && params.budget && params.budget >= params.entry.amount ? "hybrid" : "affiliate";
  if (!params.budget) return params.entry ? "paid" : "gifted";
  if (params.entry && params.budget < params.entry.amount) return "gifted";
  return "paid";
}

/**
 * Scores one creator against one brand. Weighted toward relevance over raw reach: a small,
 * on-topic audience outperforms a large, unrelated one on nearly every campaign that matters.
 */
export function scoreMatch(brand: BrandBrief, creator: CreatorCandidate): CreatorMatch {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const currency = brand.currency ?? entryRate(creator)?.currency ?? "USD";

  // Niche relevance — the heaviest single factor.
  const brandTerms = `${brand.category} ${brand.audienceNote ?? ""}`.toLowerCase();
  const overlap = creator.niches.filter(niche => brandTerms.includes(niche));
  const nicheScore = overlap.length > 0 ? clamp(55 + overlap.length * 15) : 20;
  if (overlap.length > 0) reasons.push(`Publishes in ${overlap.join(", ")}, which matches ${brand.category}.`);
  else concerns.push(`No published niche overlaps with ${brand.category}.`);

  // Reach, on a curve that saturates: 100k is not ten times better than 10k for a local brand.
  const reach = creator.totalReach;
  const reachScore = reach === 0 ? 25 : clamp(Math.round((Math.log10(reach) / Math.log10(500_000)) * 100));
  if (reach > 0) reasons.push(`${reach.toLocaleString("en-US")} combined followers across ${creator.followers.length} platform(s).`);
  else concerns.push("No audience figures published — ask for a media kit before committing.");

  // Engagement, where stated, is a stronger signal than size.
  const engagement = creator.audience.find(fact => fact.kind === "engagement");
  let engagementScore = 50;
  if (engagement) {
    const value = Number.parseFloat(engagement.value);
    engagementScore = clamp(Math.round((value / 6) * 100));
    if (value >= 3) reasons.push(`States ${engagement.value} engagement, which is strong for this audience size.`);
    else concerns.push(`States ${engagement.value} engagement, which is modest.`);
  }

  // Affordability.
  const entry = entryRate(creator);
  let affordabilityScore = 60;
  if (entry && brand.budget) {
    if (brand.budget >= entry.amount * 2) {
      affordabilityScore = 95;
      reasons.push(`Entry rate of ${entry.currency} ${entry.amount.toLocaleString("en-US")} fits comfortably in the budget.`);
    } else if (brand.budget >= entry.amount) {
      affordabilityScore = 75;
      reasons.push(`Entry rate of ${entry.currency} ${entry.amount.toLocaleString("en-US")} fits the budget.`);
    } else {
      affordabilityScore = 25;
      concerns.push(`Entry rate of ${entry.currency} ${entry.amount.toLocaleString("en-US")} is above the stated budget.`);
    }
  } else if (!entry) {
    concerns.push("No published rates — cost is unknown until you ask.");
    affordabilityScore = 45;
  }

  // Location, when both sides state one.
  let locationScore = 60;
  if (brand.city && creator.city) {
    const sameCity = creator.city.toLowerCase().includes(brand.city.toLowerCase());
    locationScore = sameCity ? 100 : 45;
    if (sameCity) reasons.push(`Based in ${creator.city}, the same market as ${brand.name}.`);
  } else if (brand.country && creator.country) {
    locationScore = creator.country === brand.country ? 85 : 40;
    if (creator.country === brand.country) reasons.push(`Based in ${creator.country}.`);
  }

  if (creator.partners.length > 0) {
    reasons.push(`Has worked with ${creator.partners.slice(0, 3).join(", ")}.`);
  }
  if (!creator.contactEmail) {
    concerns.push("No published contact address — you will need to reach them another way.");
  }

  const score = Math.round(
    nicheScore * 0.34 + reachScore * 0.2 + engagementScore * 0.16 + affordabilityScore * 0.2 + locationScore * 0.1,
  );

  const suggestedStructure = suggestStructure({ budget: brand.budget, entry, reach, goal: brand.goal });

  return {
    creator,
    score: clamp(score),
    reasons,
    concerns,
    suggestedStructure,
    estimatedCost: suggestedStructure === "gifted" ? null : (entry?.amount ?? null),
    currency,
  };
}

export function matchCreators(brand: BrandBrief, creators: CreatorCandidate[]): CreatorMatch[] {
  return creators.map(creator => scoreMatch(brand, creator)).sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------------- brief */

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

const STRUCTURE_COPY: Record<CollabStructure, { name: string; how: string }> = {
  gifted: {
    name: "Gifted product",
    how: "The brand sends product; the creator posts if it genuinely fits. No fee, no guaranteed deliverable, and both sides should say so openly.",
  },
  paid: {
    name: "Paid partnership",
    how: "A fixed fee for named deliverables, with usage rights and timing agreed in writing before anything is made.",
  },
  affiliate: {
    name: "Affiliate / revenue share",
    how: "A tracked code or link with an agreed percentage. Lower risk for the brand, higher upside for the creator when the product genuinely sells.",
  },
  hybrid: {
    name: "Base fee plus affiliate",
    how: "A smaller guaranteed fee covering production, plus a share of tracked sales. Aligns both sides on results rather than on posting.",
  },
};

export type CollabBriefInput = {
  agencyName: string;
  brand: BrandBrief;
  match: CreatorMatch;
  deliverables?: string[];
};

export function defaultDeliverables(structure: CollabStructure, goal?: BrandBrief["goal"]): string[] {
  const base = ["One in-feed post", "Two stories with a link", "Raw footage supplied to the brand"];
  if (structure === "gifted") return ["One post or story if the product fits", "Honest feedback either way"];
  if (goal === "launch") return ["Launch-day in-feed post", "Three-part story sequence", "One short-form video", "Usage rights for 90 days"];
  if (goal === "content") return ["Three pieces of short-form video for brand use", "Full usage rights", "No posting obligation"];
  return base;
}

export function renderCollabBriefHtml(input: CollabBriefInput): string {
  const { brand, match } = input;
  const creator = match.creator;
  const structure = STRUCTURE_COPY[match.suggestedStructure];
  const deliverables = input.deliverables ?? defaultDeliverables(match.suggestedStructure, brand.goal);

  const row = (label: string, value: string) =>
    `<div class="row"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(brand.name)} × ${escapeHtml(creator.creatorName ?? "Creator")} — collaboration brief</title>
<style>
  :root { --paper:#F7F6F1; --ink:#1D241F; --stone:#E7E5DE; --lime:#C8FF3D; --muted:#6d7469; }
  *,*::before,*::after { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font-family:Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif; }
  .sheet { max-width:800px; margin:0 auto; background:#fff; border:1px solid var(--stone); }
  .pad { padding:40px 48px; }
  .rule { border-top:1px solid var(--stone); }
  .label { font:500 10px/1.4 'DM Mono',ui-monospace,monospace; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); }
  h1 { font-family:'Space Grotesk',sans-serif; font-size:32px; line-height:1.1; letter-spacing:-.025em; margin:10px 0 0; }
  h2 { font-family:'Space Grotesk',sans-serif; font-size:18px; letter-spacing:-.015em; margin:0 0 8px; }
  p { font-size:14px; line-height:1.65; color:#3c433a; }
  .row { display:flex; gap:14px; padding:11px 0; border-top:1px solid #ecebe4; font-size:14px; }
  .row b { min-width:150px; font:500 10px/1.5 'DM Mono',monospace; letter-spacing:.1em; text-transform:uppercase;
           color:var(--muted); padding-top:2px; }
  ul { padding-left:18px; font-size:14px; line-height:1.75; color:#3c433a; }
  .fit { display:flex; align-items:baseline; gap:12px; }
  .fit b { font-family:'Space Grotesk',sans-serif; font-size:44px; font-weight:700; letter-spacing:-.03em; }
  .bar { height:8px; background:var(--stone); margin-top:12px; }
  .bar span { display:block; height:100%; background:var(--lime); }
  .cols { display:grid; grid-template-columns:1fr 1fr; gap:26px; }
  .concern { color:#7a5a1a; }
  .foot { font-size:11.5px; line-height:1.7; color:var(--muted); }
  @media (max-width:720px) { .cols { grid-template-columns:1fr; } .pad { padding:28px 24px; } }
  @media print { .sheet { border:0; } }
</style></head>
<body><div class="sheet">

  <div class="pad">
    <div class="label">${escapeHtml(input.agencyName)} · Collaboration brief</div>
    <h1>${escapeHtml(brand.name)} × ${escapeHtml(creator.creatorName ?? "Creator")}</h1>
    <p style="margin-top:12px;">A proposed partnership between ${escapeHtml(brand.name)} and a creator whose published
    audience and rates were read from their own media kit.</p>
  </div>

  <div class="pad rule">
    <div class="label">Fit</div>
    <div class="fit"><b>${match.score}</b><span style="color:var(--muted);font-size:13px;">/100 · suggested structure: ${escapeHtml(structure.name.toLowerCase())}</span></div>
    <div class="bar"><span style="width:${match.score}%"></span></div>
    <div class="cols" style="margin-top:22px;">
      <div>
        <h2>Why this works</h2>
        <ul>${match.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("") || "<li>No supporting signals published.</li>"}</ul>
      </div>
      <div>
        <h2>What to check</h2>
        <ul class="concern">${match.concerns.map(concern => `<li>${escapeHtml(concern)}</li>`).join("") || "<li>Nothing outstanding.</li>"}</ul>
      </div>
    </div>
  </div>

  <div class="pad rule">
    <h2>The creator, as they describe themselves</h2>
    ${creator.followers.length > 0 ? row("Audience", creator.followers.map(f => `${f.platform} ${f.followers.toLocaleString("en-US")}`).join(" · ")) : ""}
    ${creator.niches.length > 0 ? row("Publishes in", creator.niches.join(", ")) : ""}
    ${creator.audience.map(fact => row(fact.kind, fact.value)).join("")}
    ${creator.rates.length > 0 ? row("Published rates", creator.rates.map(r => `${r.deliverable} ${r.currency} ${r.amount.toLocaleString("en-US")}`).join(" · ")) : ""}
    ${creator.partners.length > 0 ? row("Previous partners", creator.partners.slice(0, 8).join(", ")) : ""}
    ${row("Source", creator.website)}
  </div>

  <div class="pad rule">
    <h2>Proposed structure — ${escapeHtml(structure.name)}</h2>
    <p style="max-width:64ch;">${escapeHtml(structure.how)}</p>
    ${match.estimatedCost !== null ? row("Indicative cost", `${match.currency} ${match.estimatedCost.toLocaleString("en-US")} based on their published entry rate`) : ""}
    ${brand.budget ? row("Brand budget", `${brand.currency ?? "USD"} ${brand.budget.toLocaleString("en-US")}`) : ""}
    ${brand.goal ? row("Campaign goal", brand.goal) : ""}
  </div>

  <div class="pad rule">
    <h2>Deliverables</h2>
    <ul>${deliverables.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <p style="max-width:64ch;">Usage rights, exclusivity and posting dates should be agreed in writing before production
    begins. Disclosure of a paid or gifted partnership is the creator's legal obligation in most markets and should be
    treated as non-negotiable by both sides.</p>
  </div>

  <div class="pad rule">
    <p class="foot">Prepared by ${escapeHtml(input.agencyName)}. Audience figures, rates and partners are as published by
    the creator on their own media kit and have not been independently verified. Ask for current figures before
    committing budget.</p>
  </div>

</div></body></html>`;
}

export function buildCollabBrief(input: CollabBriefInput) {
  const deliverables = input.deliverables ?? defaultDeliverables(input.match.suggestedStructure, input.brand.goal);
  return {
    html: renderCollabBriefHtml({ ...input, deliverables }),
    deliverables,
    structure: input.match.suggestedStructure,
    title: `${input.brand.name} × ${input.match.creator.creatorName ?? "Creator"} — collaboration brief`,
  };
}
