/**
 * Finder visual reminder: Atlas Field Notes — results must preserve source, freshness,
 * and uncertainty. No private contact or identity information is fabricated.
 */

import type { MarketRegion } from "@shared/marketCoverage";
import { aggregateJobs } from "./jobs";

export const JOBICY_SOURCE_NAME = "Jobicy";
export const JOBICY_SOURCE_URL = "https://jobicy.com/jobs-rss-feed";
export const MAX_JOB_AGE_DAYS = 5;
const MAX_JOB_AGE_MS = MAX_JOB_AGE_DAYS * 24 * 60 * 60 * 1000;
const ROLE_ALIASES: Record<string, string[]> = {
  "product manager": ["product manager", "product management"],
  "social media growth": ["social media", "growth marketing", "community manager"],
  "web developer": ["web developer", "web engineer", "frontend", "full stack", "full-stack"],
  "content writer": ["content writer", "content editor", "content strategist", "copywriter"],
  copywriter: ["copywriter", "copy writing", "content writer"],
  "co-founder": ["co-founder", "cofounder", "founder"],
  "online presence": ["digital marketing", "seo", "social media", "brand manager"],
  biochemist: ["biochemist", "biochemistry", "bioinformatics", "drug development"],
  "drug development scientist": ["drug development", "scientist", "biomedical"],
  "cosmetics operations manager": ["cosmetics", "cosmetic", "skincare", "beauty", "operations manager"],
  "skincare brand manager": ["skincare", "beauty", "cosmetics", "brand manager"],
  "funeral services manager": ["funeral", "burial", "mortuary", "cemetery"],
};

type JobicyJob = {
  id?: number | string;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
};

type JobicyResponse = {
  jobs?: JobicyJob[];
};

export type FreshJob = {
  id: string;
  title: string;
  company: string;
  companyLogo?: string;
  geography: string;
  industry: string[];
  jobType: string[];
  level: string;
  excerpt: string;
  description: string;
  postedAt: string;
  ageHours: number;
  sourceUrl: string;
  sourceName: typeof JOBICY_SOURCE_NAME;
  salary?: string;
  contactStatus: string;
};

export type FreshJobSearchInput = {
  role: string;
  country: string;
  region: MarketRegion;
  limit?: number;
};

const countryToJobicyGeo: Record<string, string> = {
  "United States": "usa",
  Canada: "canada",
  Australia: "australia",
  China: "china",
  "Hong Kong": "hong-kong",
};

/**
 * Jobicy documents regional scopes for Europe, APAC and LATAM only. Africa has no documented
 * scope, and Oceania is covered only through the direct `australia` country filter. Rather than
 * send an undocumented value — which the provider answers with HTTP 400 — Finder omits the geo
 * filter entirely for those markets and labels the result as an unscoped worldwide feed, so the
 * interface never implies a geographic precision the source did not deliver.
 */
const regionToJobicyGeo: Partial<Record<MarketRegion, string>> = {
  Europe: "europe",
  Americas: "latam",
  Asia: "apac",
};

export type JobicyGeoScope = {
  geo: string | null;
  scope: "country" | "region" | "global";
};

export function getJobicyGeoScope(input: FreshJobSearchInput): JobicyGeoScope {
  const directGeo = countryToJobicyGeo[input.country];
  if (directGeo) return { geo: directGeo, scope: "country" };

  const regionGeo = regionToJobicyGeo[input.region];
  if (regionGeo) return { geo: regionGeo, scope: "region" };

  return { geo: null, scope: "global" };
}

export function describeGeoPrecision(scope: JobicyGeoScope, country: string, region: MarketRegion) {
  if (scope.scope === "country") return `Filtered directly to ${country} by the source.`;
  if (scope.scope === "region") return `The source has no ${country} filter, so its ${region} regional scope was applied. Results show each listing's own stated geography.`;
  return `The source publishes no geographic scope covering ${region}, so this is its unscoped worldwide feed filtered by role. Check each listing's own stated geography before assuming it covers ${country}.`;
}

function stripMarkup(value: string | undefined) {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&hellip;/g, "…")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSalary(job: JobicyJob) {
  if (!job.salaryMin && !job.salaryMax) return undefined;
  const currency = job.salaryCurrency ? `${job.salaryCurrency} ` : "";
  const low = job.salaryMin ? `${currency}${job.salaryMin.toLocaleString()}` : undefined;
  const high = job.salaryMax ? `${currency}${job.salaryMax.toLocaleString()}` : undefined;
  const range = low && high ? `${low}–${high.replace(currency, "")}` : low || high;
  return job.salaryPeriod ? `${range} / ${job.salaryPeriod}` : range;
}

function asSafeSourceUrl(value: string | undefined) {
  return value && /^https:\/\//i.test(value) ? value : JOBICY_SOURCE_URL;
}

export function mapFreshJob(job: JobicyJob, now = Date.now()): FreshJob | null {
  if (!job.pubDate || !job.jobTitle || !job.companyName) return null;

  const publishedAt = new Date(job.pubDate);
  const publishedAtMs = publishedAt.getTime();
  if (Number.isNaN(publishedAtMs)) return null;

  const rawAgeMs = now - publishedAtMs;
  if (rawAgeMs > MAX_JOB_AGE_MS || rawAgeMs < -12 * 60 * 60 * 1000) return null;

  return {
    id: String(job.id || `${job.companyName}-${job.jobTitle}-${job.pubDate}`),
    title: stripMarkup(job.jobTitle),
    company: stripMarkup(job.companyName),
    companyLogo: job.companyLogo,
    geography: stripMarkup(job.jobGeo) || "Remote / not specified",
    industry: Array.isArray(job.jobIndustry) ? job.jobIndustry.map(stripMarkup).filter(Boolean) : [],
    jobType: Array.isArray(job.jobType) ? job.jobType.map(stripMarkup).filter(Boolean) : [],
    level: stripMarkup(job.jobLevel) || "Not specified",
    excerpt: stripMarkup(job.jobExcerpt).slice(0, 480),
    description: stripMarkup(job.jobDescription).slice(0, 7000),
    postedAt: publishedAt.toISOString(),
    ageHours: Math.max(0, Math.floor(rawAgeMs / (60 * 60 * 1000))),
    sourceUrl: asSafeSourceUrl(job.url),
    sourceName: JOBICY_SOURCE_NAME,
    salary: formatSalary(job),
    contactStatus: "Use the public source listing or verify a company contact before outreach.",
  };
}

export function mapFreshJobs(jobs: JobicyJob[], now = Date.now()) {
  return jobs
    .map((job) => mapFreshJob(job, now))
    .filter((job): job is FreshJob => job !== null)
    .sort((left, right) => Date.parse(right.postedAt) - Date.parse(left.postedAt));
}

export function matchesRequestedRole(job: FreshJob, requestedRole: string) {
  const normalizedRole = requestedRole.trim().toLowerCase();
  if (!normalizedRole || normalizedRole === "all hiring roles") return true;
  const searchable = `${job.title} ${job.excerpt}`.toLowerCase();
  const aliases = ROLE_ALIASES[normalizedRole] || [normalizedRole];
  return aliases.some((alias) => searchable.includes(alias));
}

/**
 * Live multi-source job search.
 *
 * Delegates to the aggregator so the result no longer depends on one provider being reachable,
 * fresh and correctly tagged all at once. The mapping back to `FreshJob` keeps the existing
 * interface contract intact.
 */
export async function searchFreshJobs(input: FreshJobSearchInput & {
  freshnessDays?: number;
  remoteOnly?: boolean;
  location?: string;
}) {
  const limit = Math.min(Math.max(input.limit || 24, 1), 60);

  const result = await aggregateJobs(
    {
      role: input.role,
      country: input.country,
      region: input.region,
      location: input.location,
      limit,
      remoteOnly: input.remoteOnly ?? true,
    },
    { freshnessDays: input.freshnessDays ?? MAX_JOB_AGE_DAYS },
  );

  const jobs: FreshJob[] = result.jobs.map(job => ({
    id: `${job.sourceName}:${job.externalId}`,
    title: job.title,
    company: job.company,
    companyLogo: job.companyLogo,
    geography: job.location,
    industry: job.tags,
    jobType: job.jobType,
    level: "Not specified",
    excerpt: job.excerpt,
    description: job.description,
    postedAt: job.postedAt,
    ageHours: Math.max(0, Math.floor((Date.now() - Date.parse(job.postedAt)) / (60 * 60 * 1000))),
    sourceUrl: job.url,
    sourceName: job.sourceName as FreshJob["sourceName"],
    salary: job.salary,
    contactStatus: "Use the public source listing or verify a company contact before outreach.",
  }));

  const geoScope = getJobicyGeoScope(input);

  return {
    jobs,
    sourceName: result.sources.filter(source => source.ok).map(source => source.source).join(", ") || JOBICY_SOURCE_NAME,
    sourceUrl: JOBICY_SOURCE_URL,
    freshnessDays: result.freshnessDays,
    countryFilterApplied: geoScope.scope === "country",
    regionFilterApplied: geoScope.scope === "region",
    globalFeedOnly: geoScope.scope === "global",
    precisionNote: result.note,
    /** Per-stage counts, so an empty list can always explain itself. */
    funnel: result.funnel,
    sources: result.sources,
    attributions: result.attributions,
    countryContext: input.country,
    regionContext: input.region,
  };
}
