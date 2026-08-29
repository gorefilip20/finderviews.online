/**
 * The finders.
 *
 * Each finder turns one or more public sources into ranked, evidence-carrying prospects.
 * They share a single record shape so the pipeline, proposal builder, export and alerting
 * all work identically regardless of which signal surfaced the business.
 */
import { isExcludedMarket, type MarketRegion } from "@shared/marketCoverage";
import { badRequest, failedPrecondition } from "./_core/errors";
import {
  allProviderStatuses,
  searchActiveAds,
  searchLocalJobs,
  searchPlaces,
  searchRegistrations,
  type ProviderStatus,
} from "./providers";
import { auditWebsite, type WebAuditResult } from "./webaudit";
import { estimateDealBand, matchIcp, scoreProspect, type GapScore, type IcpCriteria } from "./scoring";

export type SignalType =
  | "no_website"
  | "decaying_site"
  | "rising"
  | "expansion"
  | "ad_spend"
  | "partnership";

export type DiscoveredProspect = {
  dedupeKey: string;
  name: string;
  category?: string;
  country: string;
  region: MarketRegion;
  address?: string;
  phone?: string;
  website?: string;
  listingUrl?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  reviewCount?: number;
  reviewVelocity?: number;
  signalType: SignalType;
  signalSummary: string;
  score: GapScore;
  icp?: ReturnType<typeof matchIcp>;
  deal: ReturnType<typeof estimateDealBand>;
  audit?: WebAuditResult;
  source: string;
  sourceUrl?: string;
  observedAt: string;
};

export type FinderResult = {
  prospects: DiscoveredProspect[];
  sources: ProviderStatus[];
  precisionNote: string;
  scannedCount: number;
};

export function buildDedupeKey(name: string, locality: string) {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(the|ltd|limited|llc|inc|gmbh|bv|sarl|co|company|and)\b/g, " ")
      .trim()
      .replace(/\s+/g, "-");
  return `${normalize(name)}__${normalize(locality)}`.slice(0, 180);
}

export function assertEligibleMarket(country: string, region: string) {
  if (isExcludedMarket(country) || isExcludedMarket(region)) {
    throw badRequest("Finder's coverage is limited to Europe, the Americas, and Asia.");
  }
}

/** Snapshot history supplied by the caller, keyed by dedupeKey. */
export type VelocityLookup = (dedupeKey: string) => { reviewCount: number; observedAt: Date }[] | undefined;

export function computeVelocity(
  history: { reviewCount: number; observedAt: Date }[] | undefined,
  current: { reviewCount?: number; observedAt: Date },
): number | undefined {
  if (!history || history.length === 0 || current.reviewCount == null) return undefined;
  const oldest = history.reduce((a, b) => (a.observedAt < b.observedAt ? a : b));
  const months = (current.observedAt.getTime() - oldest.observedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
  // Below ~10 days of separation the figure is noise, so report nothing rather than a guess.
  if (months < 0.33) return undefined;
  const delta = current.reviewCount - oldest.reviewCount;
  if (delta < 0) return undefined;
  return Number((delta / months).toFixed(2));
}

type BaseParams = {
  category: string;
  location: string;
  country: string;
  region: MarketRegion;
  icp?: IcpCriteria | null;
  velocity?: VelocityLookup;
  limit?: number;
};

function finalize(
  base: Omit<DiscoveredProspect, "score" | "deal" | "icp">,
  scoreInput: Parameters<typeof scoreProspect>[0],
  icp: IcpCriteria | null | undefined,
): DiscoveredProspect {
  const score = scoreProspect(scoreInput);
  const deal = estimateDealBand({
    category: base.category,
    country: base.country,
    gapScore: score.score,
    hasWebsite: scoreInput.hasWebsite,
  });
  const withScore: DiscoveredProspect = { ...base, score, deal };
  if (icp) {
    withScore.icp = matchIcp(
      {
        category: base.category,
        region: base.region,
        country: base.country,
        gapScore: score.score,
        rating: base.rating,
        reviewCount: base.reviewCount,
      },
      icp,
    );
  }
  return withScore;
}

/* ------------------------------------------- 1. Rising, Under-Built finder */

/**
 * Businesses with proven demand and a weak digital front door. The defining test is that
 * demand is high while the web presence is not — a strong business with a strong site is
 * deliberately excluded.
 */
export async function findRisingUnderBuilt(params: BaseParams & { minRating?: number; minReviews?: number }): Promise<FinderResult> {
  assertEligibleMarket(params.country, params.region);
  const query = `${params.category} in ${params.location}, ${params.country}`;
  const listings = await searchPlaces(query, params.limit ?? 20);

  if (!listings.connected) {
    return {
      prospects: [],
      sources: [listings],
      precisionNote:
        "Connect a business-listing source to run this finder. Finder will not display placeholder businesses.",
      scannedCount: 0,
    };
  }

  const minRating = params.minRating ?? 4.2;
  const minReviews = params.minReviews ?? 15;
  const now = new Date();

  const prospects = listings.items
    .filter(item => (item.rating ?? 0) >= minRating && (item.reviewCount ?? 0) >= minReviews)
    .filter(item => !item.website || item.website.includes("facebook.com") || item.website.includes("instagram.com"))
    .map(item => {
      const dedupeKey = buildDedupeKey(item.name, `${params.location} ${params.country}`);
      const velocity = computeVelocity(params.velocity?.(dedupeKey), {
        reviewCount: item.reviewCount,
        observedAt: now,
      });
      const socialOnly = Boolean(item.website);

      return finalize(
        {
          dedupeKey,
          name: item.name,
          category: item.category || params.category,
          country: params.country,
          region: params.region,
          address: item.address,
          phone: item.phone,
          website: item.website,
          listingUrl: item.listingUrl,
          latitude: item.latitude,
          longitude: item.longitude,
          rating: item.rating,
          reviewCount: item.reviewCount,
          reviewVelocity: velocity,
          signalType: "rising",
          signalSummary: socialOnly
            ? `Rated ${item.rating?.toFixed(1)} across ${item.reviewCount} reviews with only a social profile as its web presence.`
            : `Rated ${item.rating?.toFixed(1)} across ${item.reviewCount} reviews with no website listed.`,
          source: listings.provider,
          sourceUrl: item.listingUrl,
          observedAt: now.toISOString(),
        },
        {
          hasWebsite: socialOnly,
          listingComplete: Boolean(item.address && item.phone),
          hasPublicContact: Boolean(item.phone),
          rating: item.rating ?? null,
          reviewCount: item.reviewCount ?? null,
          reviewVelocity: velocity ?? null,
        },
        params.icp,
      );
    })
    .sort((a, b) => b.score.score - a.score.score);

  const hasVelocity = prospects.some(p => p.reviewVelocity !== undefined);
  return {
    prospects,
    sources: [listings],
    precisionNote: hasVelocity
      ? `Filtered to businesses rated ${minRating}+ with ${minReviews}+ reviews and no standalone website. Momentum is measured from Finder's own repeat observations.`
      : `Filtered to businesses rated ${minRating}+ with ${minReviews}+ reviews and no standalone website. Momentum needs a second observation of the same market before it can be reported, so it is excluded from today's confidence figure.`,
    scannedCount: listings.items.length,
  };
}

/* --------------------------------------- 2. Decaying web presence finder */

/**
 * Businesses that already paid for a website and now have a broken or dated one. They have
 * proven willingness to buy, which makes them better qualified than a no-website business.
 */
export async function findDecayingSites(params: BaseParams & { minDecayScore?: number }): Promise<FinderResult> {
  assertEligibleMarket(params.country, params.region);
  const query = `${params.category} in ${params.location}, ${params.country}`;
  const listings = await searchPlaces(query, params.limit ?? 20);

  if (!listings.connected) {
    return {
      prospects: [],
      sources: [listings],
      precisionNote: "Connect a business-listing source to sweep a market. Single URLs can still be audited directly.",
      scannedCount: 0,
    };
  }

  const withSites = listings.items.filter(item => Boolean(item.website));
  const minDecay = params.minDecayScore ?? 32;
  const now = new Date();

  const audited = await Promise.all(
    withSites.slice(0, params.limit ?? 12).map(async item => {
      try {
        const audit = await auditWebsite(item.website as string);
        return { item, audit };
      } catch {
        return { item, audit: null };
      }
    }),
  );

  const prospects = audited
    .filter(entry => entry.audit && entry.audit.decayScore >= minDecay)
    .map(({ item, audit }) => {
      const result = audit as WebAuditResult;
      const dedupeKey = buildDedupeKey(item.name, `${params.location} ${params.country}`);
      return finalize(
        {
          dedupeKey,
          name: item.name,
          category: item.category || params.category,
          country: params.country,
          region: params.region,
          address: item.address,
          phone: item.phone,
          website: item.website,
          listingUrl: item.listingUrl,
          latitude: item.latitude,
          longitude: item.longitude,
          rating: item.rating,
          reviewCount: item.reviewCount,
          signalType: "decaying_site",
          signalSummary: result.headline,
          audit: result,
          source: `${listings.provider} + Finder site audit`,
          sourceUrl: item.listingUrl,
          observedAt: now.toISOString(),
        },
        {
          hasWebsite: true,
          websiteReachable: result.reachable,
          decayScore: result.decayScore,
          mobileFriendly: result.mobileFriendly,
          secure: result.secure,
          listingComplete: Boolean(item.address && item.phone),
          hasPublicContact: Boolean(item.phone),
          rating: item.rating ?? null,
          reviewCount: item.reviewCount ?? null,
        },
        params.icp,
      );
    })
    .sort((a, b) => b.score.score - a.score.score);

  return {
    prospects,
    sources: [listings],
    precisionNote: `Audited ${audited.length} listed websites and kept those scoring ${minDecay}+ for decay. Every check is a live reading of the public page.`,
    scannedCount: listings.items.length,
  };
}

/* --------------------------------------- 4. Expansion and opening signals */

export async function findExpansionSignals(params: BaseParams & { sinceDays?: number }): Promise<FinderResult> {
  assertEligibleMarket(params.country, params.region);
  const registrations = await searchRegistrations(`${params.location}, ${params.country}`, params.sinceDays ?? 60);

  if (!registrations.connected) {
    return {
      prospects: [],
      sources: [registrations],
      precisionNote:
        "Connect a business-registry source to surface newly registered and newly opened businesses in this market.",
      scannedCount: 0,
    };
  }

  const now = new Date();
  const prospects = registrations.items.map(record => {
    const dedupeKey = buildDedupeKey(record.name, `${params.location} ${params.country}`);
    return finalize(
      {
        dedupeKey,
        name: record.name,
        category: record.category || params.category,
        country: params.country,
        region: params.region,
        address: record.address,
        listingUrl: record.sourceUrl,
        signalType: "expansion",
        signalSummary: record.registeredAt
          ? `Registered or opened on ${new Date(record.registeredAt).toLocaleDateString()} — no established web presence yet.`
          : "Newly registered business with no established web presence yet.",
        source: registrations.provider,
        sourceUrl: record.sourceUrl,
        observedAt: now.toISOString(),
      },
      {
        hasWebsite: false,
        listingComplete: Boolean(record.address),
        hasPublicContact: false,
        recentlyOpened: true,
        expanding: true,
      },
      params.icp,
    );
  });

  return {
    prospects: prospects.sort((a, b) => b.score.score - a.score.score),
    sources: [registrations],
    precisionNote: `New registrations from the last ${params.sinceDays ?? 60} days. A new business has the highest urgency for a first website.`,
    scannedCount: registrations.items.length,
  };
}

/* ---------------------------------------------- 5. Advertising-spend signal */

/**
 * A business paying for ads has a proven, active marketing budget. Pair that with a weak
 * landing experience and it is the hottest lead the product can produce.
 */
export async function findAdSpendGaps(params: BaseParams & { countryCode?: string }): Promise<FinderResult> {
  assertEligibleMarket(params.country, params.region);
  const listings = await searchPlaces(`${params.category} in ${params.location}, ${params.country}`, params.limit ?? 12);

  if (!listings.connected) {
    return {
      prospects: [],
      sources: [listings, { ...allProviderStatuses()[1] }],
      precisionNote: "This finder needs both a business-listing source and the public ad library.",
      scannedCount: 0,
    };
  }

  const now = new Date();
  const results: DiscoveredProspect[] = [];
  let adStatus: ProviderStatus = allProviderStatuses()[1];

  for (const item of listings.items.slice(0, params.limit ?? 12)) {
    const ads = await searchActiveAds(item.name, params.countryCode ?? "US").catch(() => null);
    if (!ads) continue;
    adStatus = ads;
    if (!ads.connected) break;
    const advertising = ads.items.find(ad => ad.pageName.toLowerCase().includes(item.name.toLowerCase().slice(0, 12)));
    if (!advertising) continue;

    let audit: WebAuditResult | undefined;
    if (item.website) audit = await auditWebsite(item.website).catch(() => undefined);

    results.push(
      finalize(
        {
          dedupeKey: buildDedupeKey(item.name, `${params.location} ${params.country}`),
          name: item.name,
          category: item.category || params.category,
          country: params.country,
          region: params.region,
          address: item.address,
          phone: item.phone,
          website: item.website,
          listingUrl: item.listingUrl,
          rating: item.rating,
          reviewCount: item.reviewCount,
          signalType: "ad_spend",
          signalSummary: `Running ${advertising.adCount} active public ad(s)${
            audit ? ` while its landing site scores ${audit.decayScore}/100 for decay.` : " with no listed website to land them on."
          }`,
          audit,
          source: `${listings.provider} + ${ads.provider}`,
          sourceUrl: advertising.sampleAdUrl || item.listingUrl,
          observedAt: now.toISOString(),
        },
        {
          hasWebsite: Boolean(item.website),
          websiteReachable: audit?.reachable,
          decayScore: audit?.decayScore,
          mobileFriendly: audit?.mobileFriendly,
          secure: audit?.secure,
          listingComplete: Boolean(item.address && item.phone),
          hasPublicContact: Boolean(item.phone),
          rating: item.rating ?? null,
          reviewCount: item.reviewCount ?? null,
          runningAds: true,
        },
        params.icp,
      ),
    );
  }

  return {
    prospects: results.sort((a, b) => b.score.score - a.score.score),
    sources: [listings, adStatus],
    precisionNote: adStatus.connected
      ? "Every business here is paying to advertise right now, verified against the public ad library."
      : "Connect the public ad library to confirm active advertising spend.",
    scannedCount: listings.items.length,
  };
}

/* -------------------------------------------- 6. Local (non-remote) hiring */

export async function findLocalHiring(params: { role: string; location: string; country: string; region: MarketRegion; sinceDays?: number }) {
  assertEligibleMarket(params.country, params.region);
  const jobs = await searchLocalJobs(params.role, `${params.location}, ${params.country}`, params.sinceDays ?? 5);
  return {
    jobs: jobs.items,
    source: jobs,
    precisionNote: jobs.connected
      ? `Local and on-site roles posted in the last ${params.sinceDays ?? 5} days.`
      : "The built-in job feed covers remote roles only. Connect a local jobs source to reach on-site employers.",
  };
}

/* --------------------------------------------- 3. Partnership / referral finder */

const COMPLEMENTS: Record<string, string[]> = {
  restaurant: ["food photographer", "event venue", "local brewery", "catering equipment supplier"],
  cafe: ["bakery", "coffee roaster", "co-working space", "local bookshop"],
  bakery: ["cafe", "wedding planner", "event venue", "florist"],
  wedding: ["florist", "photographer", "event venue", "bridal boutique", "caterer"],
  florist: ["wedding planner", "event venue", "funeral home", "interior designer"],
  gym: ["physiotherapist", "sports nutrition shop", "sportswear retailer", "massage therapist"],
  fitness: ["physiotherapist", "nutritionist", "sportswear retailer"],
  salon: ["beauty spa", "bridal boutique", "skincare clinic", "photographer"],
  dentist: ["orthodontist", "general practitioner", "pharmacy"],
  clinic: ["pharmacy", "physiotherapist", "medical laboratory"],
  "real estate": ["mortgage broker", "interior designer", "moving company", "home inspector", "surveyor"],
  construction: ["architect", "interior designer", "landscaper", "building supplier"],
  architect: ["construction contractor", "interior designer", "surveyor"],
  "law firm": ["accountant", "notary", "real estate agency", "business consultant"],
  accountant: ["law firm", "business consultant", "bookkeeper", "insurance broker"],
  automotive: ["car wash", "tyre fitter", "insurance broker", "car dealership"],
  pet: ["veterinarian", "pet supply shop", "dog trainer", "pet photographer"],
  hotel: ["tour operator", "restaurant", "taxi service", "event venue"],
  photographer: ["wedding planner", "event venue", "florist", "bridal boutique"],
};

export function complementsFor(category: string): string[] {
  const key = category.toLowerCase().trim();
  const direct = Object.entries(COMPLEMENTS).find(([name]) => key.includes(name));
  return direct ? direct[1] : ["complementary local supplier", "adjacent professional service", "shared-audience retailer"];
}

export type PartnershipMatch = {
  partnerCategory: string;
  rationale: string;
  candidates: DiscoveredProspect[];
};

/**
 * For a business the agency already works with, find non-competing businesses that serve
 * the same customer in the same market. Used for co-marketing and referral introductions —
 * a retention tool for existing clients, not only a new-business tool.
 */
export async function findPartnerships(params: {
  anchorName: string;
  anchorCategory: string;
  location: string;
  country: string;
  region: MarketRegion;
  perCategory?: number;
}): Promise<{ matches: PartnershipMatch[]; sources: ProviderStatus[]; precisionNote: string }> {
  assertEligibleMarket(params.country, params.region);
  const complements = complementsFor(params.anchorCategory).slice(0, 4);
  const statuses: ProviderStatus[] = [];
  const matches: PartnershipMatch[] = [];
  const now = new Date();

  for (const partnerCategory of complements) {
    const listings = await searchPlaces(
      `${partnerCategory} in ${params.location}, ${params.country}`,
      params.perCategory ?? 5,
    );
    if (statuses.length === 0) statuses.push(listings);
    if (!listings.connected) break;

    const candidates = listings.items
      .filter(item => item.name.toLowerCase() !== params.anchorName.toLowerCase())
      .map(item =>
        finalize(
          {
            dedupeKey: buildDedupeKey(item.name, `${params.location} ${params.country}`),
            name: item.name,
            category: item.category || partnerCategory,
            country: params.country,
            region: params.region,
            address: item.address,
            phone: item.phone,
            website: item.website,
            listingUrl: item.listingUrl,
            rating: item.rating,
            reviewCount: item.reviewCount,
            signalType: "partnership",
            signalSummary: `Serves the same local customer as ${params.anchorName} without competing with it.`,
            source: listings.provider,
            sourceUrl: item.listingUrl,
            observedAt: now.toISOString(),
          },
          {
            hasWebsite: Boolean(item.website),
            listingComplete: Boolean(item.address && item.phone),
            hasPublicContact: Boolean(item.phone),
            rating: item.rating ?? null,
            reviewCount: item.reviewCount ?? null,
          },
          null,
        ),
      )
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

    matches.push({
      partnerCategory,
      rationale: `${partnerCategory} businesses reach the same customer as a ${params.anchorCategory} without bidding for the same job.`,
      candidates,
    });
  }

  return {
    matches,
    sources: statuses.length ? statuses : [allProviderStatuses()[0]],
    precisionNote: statuses[0]?.connected
      ? `Complementary categories for a ${params.anchorCategory}, ranked by public reputation in ${params.location}.`
      : "Connect a business-listing source to find partnership candidates in this market.",
  };
}

export function requireProvider(status: ProviderStatus) {
  if (!status.connected) {
    throw failedPrecondition(
      `${status.provider} is not connected. Set ${status.requiredEnv.join(" and ")} to enable this finder.`,
    );
  }
}
