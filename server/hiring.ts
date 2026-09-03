/**
 * Finder visual reminder: Atlas Field Notes — results must preserve source, freshness,
 * and uncertainty. No private contact or identity information is fabricated.
 */

export const JOBICY_SOURCE_NAME = "Jobicy";
export const JOBICY_SOURCE_URL = "https://jobicy.com/jobs-rss-feed";
export const MAX_JOB_AGE_DAYS = 30;
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
  region: "Europe" | "Americas" | "Asia";
  limit?: number;
};

const countryToJobicyGeo: Record<string, string> = {
  "United States": "usa",
  Canada: "canada",
  Australia: "australia",
  China: "china",
  "Hong Kong": "hong-kong",
};

const regionToJobicyGeo: Record<FreshJobSearchInput["region"], string> = {
  Europe: "europe",
  Americas: "latam",
  Asia: "apac",
};

export function getJobicyGeoScope(input: FreshJobSearchInput) {
  const directGeo = countryToJobicyGeo[input.country];
  if (directGeo) return { geo: directGeo, scope: "country" as const };
  return { geo: regionToJobicyGeo[input.region], scope: "region" as const };
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

export async function searchFreshJobs(input: FreshJobSearchInput) {
  const params = new URLSearchParams({ count: String(Math.min(Math.max(input.limit || 50, 1), 60)) });
  const role = input.role.trim();
  if (role && role !== "All hiring roles") params.set("tag", role);

  const geoScope = getJobicyGeoScope(input);
  params.set("geo", geoScope.geo);

  let jobs: FreshJob[] = [];
  try {
    const response = await fetch(`https://jobicy.com/api/v2/remote-jobs?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": "Finderviews/1.0" },
    });
    if (response.ok) {
      const payload = (await response.json()) as JobicyResponse;
      jobs = mapFreshJobs(payload.jobs || []).filter((job) => matchesRequestedRole(job, input.role));
    }
    if (!response.ok && jobs.length === 0) {
      const broadParams = new URLSearchParams({ count: "50", geo: geoScope.geo });
      try {
        const broadResponse = await fetch(`https://jobicy.com/api/v2/remote-jobs?${broadParams.toString()}`, {
          headers: { Accept: "application/json", "User-Agent": "Finderviews/1.0" },
        });
        if (broadResponse.ok) {
          const broadPayload = (await broadResponse.json()) as JobicyResponse;
          jobs = mapFreshJobs(broadPayload.jobs || []).filter((job) => matchesRequestedRole(job, input.role));
        }
      } catch {
        // broad fallback failed silently
      }
    }
  } catch {
    // network failure — return empty results gracefully
  }
  return {
    jobs,
    sourceName: JOBICY_SOURCE_NAME,
    sourceUrl: JOBICY_SOURCE_URL,
    freshnessDays: MAX_JOB_AGE_DAYS,
    countryFilterApplied: geoScope.scope === "country",
    regionFilterApplied: geoScope.scope === "region",
    countryContext: input.country,
    regionContext: input.region,
  };
}
