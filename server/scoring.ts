/**
 * Finder scoring.
 *
 * Two indexes drive every ranked list in the product:
 *   gapIndex    — how weak the business's digital presence is (the work to sell)
 *   demandIndex — how much proven commercial activity it has (the ability to pay)
 *
 * A business scores highly only when BOTH are high. A dormant business with no website is
 * not an opportunity, and a thriving business with a good website is not one either.
 *
 * Every factor carries the evidence that produced it and whether it was actually observed.
 * `confidence` reports the share of scoring weight backed by real data, so the UI can never
 * present a guess as a finding.
 */

export type ScoreFactor = {
  key: string;
  label: string;
  group: "gap" | "demand";
  weight: number;
  /** 0-100 contribution before weighting. */
  value: number;
  observed: boolean;
  evidence: string;
};

export type GapScore = {
  score: number;
  gapIndex: number;
  demandIndex: number;
  confidence: number;
  band: "prime" | "strong" | "watch" | "weak";
  headline: string;
  factors: ScoreFactor[];
  missingInputs: string[];
};

export type ScoreInput = {
  hasWebsite?: boolean;
  websiteReachable?: boolean;
  /** 0-100 from the web audit; higher means more decayed. */
  decayScore?: number;
  mobileFriendly?: boolean;
  secure?: boolean;
  listingComplete?: boolean;
  hasPublicContact?: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  /** Reviews per month over the trailing window. */
  reviewVelocity?: number | null;
  hiringNow?: boolean;
  runningAds?: boolean;
  recentlyOpened?: boolean;
  expanding?: boolean;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

function factor(
  key: string,
  label: string,
  group: ScoreFactor["group"],
  weight: number,
  value: number | undefined,
  evidence: string,
  fallback: number,
): ScoreFactor {
  const observed = value !== undefined && Number.isFinite(value);
  return {
    key,
    label,
    group,
    weight,
    value: clamp(observed ? (value as number) : fallback),
    observed,
    evidence: observed ? evidence : "Not observed — excluded from confidence.",
  };
}

function websiteFactor(input: ScoreInput): ScoreFactor {
  if (input.hasWebsite === false) {
    return factor("website", "No website listed", "gap", 30, 100, "No standalone website on the public listing.", 50);
  }
  if (input.hasWebsite === true && input.websiteReachable === false) {
    return factor("website", "Website unreachable", "gap", 30, 92, "A website is listed but did not respond.", 50);
  }
  if (typeof input.decayScore === "number") {
    return factor(
      "website",
      "Website condition",
      "gap",
      30,
      input.decayScore,
      `Automated audit scored the site ${input.decayScore}/100 for decay.`,
      50,
    );
  }
  if (input.hasWebsite === true) {
    return factor("website", "Website present", "gap", 30, 25, "A reachable website is listed; audit not yet run.", 50);
  }
  return factor("website", "Website status", "gap", 30, undefined, "", 50);
}

function reviewVolumeValue(count: number) {
  // Demand rises quickly then plateaus: 0 reviews = 0, ~200 reviews ≈ saturated.
  return clamp(Math.round((Math.log10(count + 1) / Math.log10(201)) * 100));
}

export function scoreProspect(input: ScoreInput): GapScore {
  const factors: ScoreFactor[] = [
    websiteFactor(input),
    factor(
      "mobile",
      "Mobile readiness",
      "gap",
      10,
      input.mobileFriendly === undefined ? undefined : input.mobileFriendly ? 10 : 90,
      input.mobileFriendly ? "Declares a responsive viewport." : "No responsive viewport declared.",
      50,
    ),
    factor(
      "secure",
      "Secure connection",
      "gap",
      6,
      input.secure === undefined ? undefined : input.secure ? 0 : 100,
      input.secure ? "Served over HTTPS." : "No valid HTTPS response.",
      50,
    ),
    factor(
      "listing",
      "Listing completeness",
      "gap",
      9,
      input.listingComplete === undefined ? undefined : input.listingComplete ? 20 : 85,
      input.listingComplete ? "Public listing carries the core business fields." : "Public listing is missing core fields.",
      50,
    ),
    factor(
      "reachability",
      "Public contact route",
      "gap",
      5,
      input.hasPublicContact === undefined ? undefined : input.hasPublicContact ? 15 : 70,
      input.hasPublicContact ? "A public contact point is listed." : "No public contact point found.",
      50,
    ),
    factor(
      "rating",
      "Customer rating",
      "demand",
      12,
      typeof input.rating === "number" ? clamp(((input.rating - 3) / 2) * 100) : undefined,
      typeof input.rating === "number" ? `Public rating of ${input.rating.toFixed(1)}.` : "",
      40,
    ),
    factor(
      "reviewVolume",
      "Review volume",
      "demand",
      12,
      typeof input.reviewCount === "number" ? reviewVolumeValue(input.reviewCount) : undefined,
      typeof input.reviewCount === "number" ? `${input.reviewCount} public reviews.` : "",
      35,
    ),
    factor(
      "momentum",
      "Review momentum",
      "demand",
      10,
      typeof input.reviewVelocity === "number" ? clamp(input.reviewVelocity * 12) : undefined,
      typeof input.reviewVelocity === "number"
        ? `About ${input.reviewVelocity.toFixed(1)} new reviews per month.`
        : "",
      35,
    ),
    factor(
      "hiring",
      "Hiring activity",
      "demand",
      3,
      input.hiringNow === undefined ? undefined : input.hiringNow ? 100 : 20,
      input.hiringNow ? "Posted a role recently." : "No recent public job post found.",
      30,
    ),
    factor(
      "ads",
      "Advertising spend",
      "demand",
      2,
      input.runningAds === undefined ? undefined : input.runningAds ? 100 : 25,
      input.runningAds ? "Active ads in the public ad library." : "No active public ads found.",
      30,
    ),
    factor(
      "expansion",
      "Expansion signal",
      "demand",
      1,
      input.recentlyOpened || input.expanding ? 100 : input.recentlyOpened === undefined ? undefined : 20,
      input.recentlyOpened ? "Recently opened or newly registered." : "Opening or expansion not indicated.",
      30,
    ),
  ];

  const sumFor = (group: ScoreFactor["group"]) => {
    const subset = factors.filter(f => f.group === group);
    const weight = subset.reduce((total, f) => total + f.weight, 0);
    const score = subset.reduce((total, f) => total + f.value * f.weight, 0);
    return weight === 0 ? 0 : Math.round(score / weight);
  };

  const gapIndex = sumFor("gap");
  const demandIndex = sumFor("demand");

  const totalWeight = factors.reduce((total, f) => total + f.weight, 0);
  const observedWeight = factors.filter(f => f.observed).reduce((total, f) => total + f.weight, 0);
  const confidence = Math.round((observedWeight / totalWeight) * 100);

  // Both sides must be present. The geometric-leaning blend keeps a business with one
  // strong side and one absent side out of the top of the list.
  let score = Math.round(Math.sqrt(clamp(gapIndex) * clamp(demandIndex)));
  if (gapIndex < 20) score = Math.min(score, 25);
  if (demandIndex < 20) score = Math.min(score, 30);

  const band: GapScore["band"] =
    score >= 70 ? "prime" : score >= 55 ? "strong" : score >= 35 ? "watch" : "weak";

  const headline =
    band === "prime"
      ? "Proven demand, weak digital presence — highest-value approach."
      : band === "strong"
        ? "Real opportunity with a clear gap to close."
        : band === "watch"
          ? "Worth watching; one side of the signal is still thin."
          : "Low priority on current public evidence.";

  return {
    score,
    gapIndex,
    demandIndex,
    confidence,
    band,
    headline,
    factors,
    missingInputs: factors.filter(f => !f.observed).map(f => f.label),
  };
}

/* ------------------------------------------------------------- deal sizing */

export type DealBand = {
  band: "starter" | "standard" | "premium" | "enterprise";
  low: number;
  high: number;
  currency: string;
  basis: string[];
  caveat: string;
};

const CATEGORY_MULTIPLIER: Record<string, number> = {
  legal: 1.6, medical: 1.6, dental: 1.5, clinic: 1.5, finance: 1.6, accounting: 1.4,
  realestate: 1.4, "real estate": 1.4, construction: 1.3, manufacturing: 1.3,
  automotive: 1.2, auto: 1.2, hotel: 1.3, restaurant: 0.9, cafe: 0.8, bakery: 0.8,
  salon: 0.85, barber: 0.75, retail: 1.0, fitness: 0.95, pet: 0.8, cleaning: 0.9,
};

/** Rough purchasing-power tiers, used only to shape a range, never presented as fact. */
const COUNTRY_TIER: Record<string, number> = {
  "United States": 1.35, Canada: 1.2, "United Kingdom": 1.2, Switzerland: 1.5, Norway: 1.4,
  Germany: 1.2, Netherlands: 1.2, Sweden: 1.15, Denmark: 1.25, Ireland: 1.2, Australia: 1.25,
  France: 1.1, Belgium: 1.1, Austria: 1.1, Finland: 1.1, Singapore: 1.25, Japan: 1.1,
  Israel: 1.15, "United Arab Emirates": 1.2, Qatar: 1.2, Spain: 0.9, Italy: 0.9, Portugal: 0.8,
  Poland: 0.7, Czechia: 0.75, Greece: 0.7, Romania: 0.6, Bulgaria: 0.55, Turkey: 0.5,
  Mexico: 0.6, Brazil: 0.6, Argentina: 0.45, Colombia: 0.5, Chile: 0.65, India: 0.4,
  Vietnam: 0.4, Thailand: 0.5, Philippines: 0.4, Indonesia: 0.45, Malaysia: 0.6,
};

const EMPLOYEE_MULTIPLIER: Record<string, number> = {
  "1-4": 0.7, "5-19": 1.0, "20-49": 1.5, "50-199": 2.2, "200+": 3.2,
};

export function estimateDealBand(params: {
  category?: string | null;
  country?: string | null;
  employeeBand?: string | null;
  gapScore?: number | null;
  hasWebsite?: boolean;
}): DealBand {
  const basis: string[] = [];
  let base = 2800; // baseline small-business site + brand engagement, USD

  const categoryKey = (params.category || "").toLowerCase().trim();
  const categoryMultiplier =
    Object.entries(CATEGORY_MULTIPLIER).find(([key]) => categoryKey.includes(key))?.[1] ?? 1;
  if (categoryMultiplier !== 1) basis.push(`Category "${params.category}" typically supports a higher or lower ticket.`);

  const countryMultiplier = params.country ? (COUNTRY_TIER[params.country] ?? 0.85) : 1;
  if (params.country) basis.push(`Priced against typical ${params.country} agency rates.`);

  const employeeMultiplier = params.employeeBand ? (EMPLOYEE_MULTIPLIER[params.employeeBand] ?? 1) : 1;
  if (params.employeeBand) basis.push(`Team size band ${params.employeeBand}.`);

  if (params.hasWebsite === false) {
    base *= 1.15;
    basis.push("A first website is a larger initial build than a refresh.");
  }

  const gapBoost = typeof params.gapScore === "number" ? 0.85 + (params.gapScore / 100) * 0.5 : 1;
  if (typeof params.gapScore === "number") basis.push(`Scope widened by a gap score of ${params.gapScore}.`);

  const midpoint = base * categoryMultiplier * countryMultiplier * employeeMultiplier * gapBoost;
  const low = Math.round((midpoint * 0.65) / 100) * 100;
  const high = Math.round((midpoint * 1.45) / 100) * 100;

  const band: DealBand["band"] =
    midpoint >= 20000 ? "enterprise" : midpoint >= 9000 ? "premium" : midpoint >= 4000 ? "standard" : "starter";

  return {
    band,
    low,
    high,
    currency: "USD",
    basis,
    caveat:
      "An indicative range from public signals only. Finder has no access to this company's budget or finances — confirm scope and price in conversation.",
  };
}

/* --------------------------------------------------------------- ICP match */

export type IcpCriteria = {
  industries?: string[] | null;
  regions?: string[] | null;
  countries?: string[] | null;
  minGapScore?: number | null;
  minRating?: number | null;
  minReviewCount?: number | null;
};

export type IcpMatch = {
  score: number;
  matched: string[];
  missed: string[];
  verdict: "on-profile" | "near-profile" | "off-profile";
};

export function matchIcp(
  prospect: {
    category?: string | null;
    region?: string | null;
    country?: string | null;
    gapScore?: number | null;
    rating?: number | null;
    reviewCount?: number | null;
  },
  icp: IcpCriteria,
): IcpMatch {
  const matched: string[] = [];
  const missed: string[] = [];
  let earned = 0;
  let possible = 0;

  const check = (weight: number, label: string, pass: boolean | null) => {
    if (pass === null) return;
    possible += weight;
    if (pass) {
      earned += weight;
      matched.push(label);
    } else {
      missed.push(label);
    }
  };

  const industries = icp.industries?.filter(Boolean) ?? [];
  check(
    30,
    `Industry in ${industries.join(", ") || "target set"}`,
    industries.length === 0
      ? null
      : industries.some(i => (prospect.category || "").toLowerCase().includes(i.toLowerCase())),
  );

  const countries = icp.countries?.filter(Boolean) ?? [];
  check(20, `Country in ${countries.join(", ") || "target set"}`, countries.length === 0 ? null : countries.includes(prospect.country || ""));

  const regions = icp.regions?.filter(Boolean) ?? [];
  check(10, `Region in ${regions.join(", ") || "target set"}`, regions.length === 0 ? null : regions.includes(prospect.region || ""));

  check(
    25,
    `Gap score at or above ${icp.minGapScore}`,
    icp.minGapScore == null ? null : (prospect.gapScore ?? 0) >= icp.minGapScore,
  );
  check(
    10,
    `Rating at or above ${icp.minRating}`,
    icp.minRating == null ? null : (prospect.rating ?? 0) >= icp.minRating,
  );
  check(
    5,
    `At least ${icp.minReviewCount} reviews`,
    icp.minReviewCount == null ? null : (prospect.reviewCount ?? 0) >= icp.minReviewCount,
  );

  const score = possible === 0 ? 50 : Math.round((earned / possible) * 100);
  return {
    score,
    matched,
    missed,
    verdict: score >= 75 ? "on-profile" : score >= 45 ? "near-profile" : "off-profile",
  };
}
