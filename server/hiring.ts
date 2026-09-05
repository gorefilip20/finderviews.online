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
  sourceName: string;
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
  "United Kingdom": "uk",
  Canada: "canada",
  Australia: "australia",
  Germany: "germany",
  France: "france",
  Netherlands: "netherlands",
  Spain: "spain",
  Italy: "italy",
  Poland: "poland",
  Sweden: "sweden",
  Switzerland: "switzerland",
  Ireland: "ireland",
  Portugal: "portugal",
  Denmark: "denmark",
  Norway: "norway",
  Finland: "finland",
  Belgium: "belgium",
  Austria: "austria",
  Romania: "romania",
  "Czech Republic": "czech-republic",
  India: "india",
  Japan: "japan",
  China: "china",
  "Hong Kong": "hong-kong",
  Singapore: "singapore",
  "South Korea": "south-korea",
  Israel: "israel",
  "United Arab Emirates": "uae",
  Mexico: "mexico",
  Brazil: "brazil",
  Argentina: "argentina",
  Colombia: "colombia",
  Chile: "chile",
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

async function fetchJobicy(params: URLSearchParams): Promise<FreshJob[]> {
  const response = await fetch(`https://jobicy.com/api/v2/remote-jobs?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": "Finderviews/1.0" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as JobicyResponse;
  return mapFreshJobs(payload.jobs || []);
}

type ArbeitnowJob = { slug?: string; title?: string; company_name?: string; location?: string; description?: string; url?: string; created_at?: number | string; remote?: boolean; tags?: string[] };
type ArbeitnowResponse = { data?: ArbeitnowJob[] };
const ARBEITNOW_SOURCE_NAME = "Arbeitnow";
const ARBEITNOW_SOURCE_URL = "https://www.arbeitnow.com/api/job-board-api";
function mapArbeitnowJob(job: ArbeitnowJob, now = Date.now()): FreshJob | null {
  if (!job.title || !job.company_name || !job.created_at) return null;
  const createdMs = typeof job.created_at === "number" ? (job.created_at < 10_000_000_000 ? job.created_at * 1000 : job.created_at) : Date.parse(job.created_at);
  if (!Number.isFinite(createdMs)) return null;
  const ageMs = now - createdMs;
  if (ageMs > MAX_JOB_AGE_MS || ageMs < -12 * 60 * 60 * 1000) return null;
  const description = stripMarkup(job.description).slice(0, 7000);
  return { id: `arbeitnow-${job.slug || `${job.company_name}-${job.title}`}`, title: stripMarkup(job.title), company: stripMarkup(job.company_name), geography: stripMarkup(job.location) || (job.remote ? "Remote" : "Not specified"), industry: (job.tags || []).map(stripMarkup).filter(Boolean).slice(0, 8), jobType: [], level: "Not specified", excerpt: description.slice(0, 480), description, postedAt: new Date(createdMs).toISOString(), ageHours: Math.max(0, Math.floor(ageMs / (60 * 60 * 1000))), sourceUrl: asSafeSourceUrl(job.url), sourceName: ARBEITNOW_SOURCE_NAME, contactStatus: "Use the original public listing to apply or verify a company contact." };
}
async function fetchArbeitnow(): Promise<FreshJob[]> {
  const response = await fetch(ARBEITNOW_SOURCE_URL, { headers: { Accept: "application/json", "User-Agent": "Finderviews/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) return [];
  const payload = (await response.json()) as ArbeitnowResponse;
  return (payload.data || []).map((job) => mapArbeitnowJob(job)).filter((job): job is FreshJob => job !== null);
}
function dedupeJobs(jobs: FreshJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => { const key = `${job.company.toLowerCase()}|${job.title.toLowerCase()}|${job.sourceUrl}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

export async function searchFreshJobs(input: FreshJobSearchInput) {
  const geoScope = getJobicyGeoScope(input);
  const role = input.role.trim();
  const hasRole = role && role !== "All hiring roles";
  const count = String(Math.min(Math.max(input.limit || 50, 1), 60));

  let jobs: FreshJob[] = [];
  let fallbackJobs: FreshJob[] = [];
  try {
    if (hasRole) {
      const tagParams = new URLSearchParams({ count, geo: geoScope.geo, tag: role });
      jobs = (await fetchJobicy(tagParams)).filter((job) => matchesRequestedRole(job, role));
    }
    if (jobs.length === 0) {
      const broadParams = new URLSearchParams({ count, geo: geoScope.geo });
      const allJobs = await fetchJobicy(broadParams);
      jobs = hasRole ? allJobs.filter((job) => matchesRequestedRole(job, role)) : allJobs;
    }
    if (jobs.length === 0 && geoScope.scope === "country") {
      const regionParams = new URLSearchParams({ count, geo: regionToJobicyGeo[input.region] });
      const regionJobs = await fetchJobicy(regionParams);
      jobs = hasRole ? regionJobs.filter((job) => matchesRequestedRole(job, role)) : regionJobs;
    }
  } catch {
    // Continue to the independent public fallback below.
  }
  try {
    const publicJobs = await fetchArbeitnow();
    fallbackJobs = hasRole ? publicJobs.filter((job) => matchesRequestedRole(job, role)) : publicJobs;
    const countryNeedle = input.country.toLowerCase();
    const regionNeedles = input.region === "Europe" ? ["germany", "uk", "united kingdom", "france", "netherlands", "europe"] : input.region === "Asia" ? ["asia", "india", "japan", "singapore", "remote"] : ["usa", "united states", "canada", "brazil", "latam", "remote"];
    const scopedFallback = fallbackJobs.filter((job) => { const text = job.geography.toLowerCase(); return text.includes(countryNeedle) || regionNeedles.some((needle) => text.includes(needle)); });
    fallbackJobs = scopedFallback.length > 0 ? scopedFallback : fallbackJobs;
  } catch {
    // Both feeds may be temporarily unavailable; return the best result collected.
  }
  jobs = dedupeJobs([...jobs, ...fallbackJobs]).slice(0, Math.min(Math.max(input.limit || 50, 1), 100));
  return {
    jobs,
    sourceName: jobs.length > 0 ? [...new Set(jobs.map((job) => job.sourceName))].join(" + ") : `${JOBICY_SOURCE_NAME} + ${ARBEITNOW_SOURCE_NAME}`,
    sourceUrl: JOBICY_SOURCE_URL,
    freshnessDays: MAX_JOB_AGE_DAYS,
    countryFilterApplied: geoScope.scope === "country",
    regionFilterApplied: geoScope.scope === "region",
    countryContext: input.country,
    regionContext: input.region,
  };
}
