/**
 * One dispatcher for every finder, shared by the API, saved-search monitoring and the
 * scheduled digest. Having a single entry point means an alert always re-runs exactly the
 * search the user saved.
 */
import { z } from "zod";
import { SUPPORTED_REGIONS, type MarketRegion } from "@shared/marketCoverage";
import {
  findAdSpendGaps,
  findDecayingSites,
  findExpansionSignals,
  findRisingUnderBuilt,
  type FinderResult,
  type VelocityLookup,
} from "./discovery";
import type { IcpCriteria } from "./scoring";

export const FINDER_KINDS = ["rising", "decaying_site", "expansion", "ad_spend"] as const;
export type FinderKind = (typeof FINDER_KINDS)[number];

export const finderParamsSchema = z
  .object({
    category: z.string().trim().min(1).max(120),
    location: z.string().trim().min(1).max(160),
    country: z.string().trim().min(1).max(80),
    region: z.enum(SUPPORTED_REGIONS as unknown as [MarketRegion, ...MarketRegion[]]),
    limit: z.number().int().min(1).max(20).optional(),
    minRating: z.number().min(0).max(5).optional(),
    minReviews: z.number().int().min(0).max(5000).optional(),
    minDecayScore: z.number().int().min(0).max(100).optional(),
    sinceDays: z.number().int().min(1).max(365).optional(),
    countryCode: z.string().trim().length(2).optional(),
  })
  .strict();

export type FinderParams = z.infer<typeof finderParamsSchema>;

export const FINDER_LABELS: Record<FinderKind, string> = {
  rising: "Rising, Under-Built",
  decaying_site: "Decaying web presence",
  expansion: "New and expanding",
  ad_spend: "Paying for ads",
};

export async function runFinder(
  kind: FinderKind,
  params: FinderParams,
  extras?: { icp?: IcpCriteria | null; velocity?: VelocityLookup },
): Promise<FinderResult> {
  const shared = { ...params, icp: extras?.icp ?? null, velocity: extras?.velocity };
  switch (kind) {
    case "rising":
      return findRisingUnderBuilt(shared);
    case "decaying_site":
      return findDecayingSites(shared);
    case "expansion":
      return findExpansionSignals(shared);
    case "ad_spend":
      return findAdSpendGaps(shared);
  }
}
