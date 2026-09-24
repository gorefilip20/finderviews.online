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
  "ai engineer": ["ai ", " ai", "artificial intelligence", "machine learning", "ml engineer", "deep learning", "llm", "generative ai", "prompt engineer", "ai/ml"],
  "ai": ["ai ", " ai", "artificial intelligence", "machine learning", "ml engineer", "deep learning", "llm", "generative ai", "prompt engineer", "ai/ml", "data scientist", "computer vision", "nlp", "natural language"],
  "data scientist": ["data scientist", "data science", "data analyst", "data engineer", "analytics engineer", "machine learning"],
  "software engineer": ["software engineer", "software developer", "backend", "back-end", "full stack", "full-stack", "devops", "sre", "developer", "programmer", "engineer"],
  designer: ["designer", "ux designer", "ui designer", "graphic designer", "visual designer", "ux/ui", "product designer"],
  marketing: ["marketing", "digital marketing", "growth", "seo", "ppc", "brand", "content marketing"],
  sales: ["sales", "business development", "account executive", "account manager", "revenue"],
  "customer support": ["customer support", "customer success", "customer service", "support engineer", "technical support"],
  "project manager": ["project manager", "program manager", "scrum master", "agile", "delivery manager"],
  finance: ["finance", "accountant", "accounting", "financial analyst", "bookkeeper", "controller"],
  "human resources": ["human resources", "hr ", " hr", "recruiter", "talent acquisition", "people operations"],
  developer: ["developer", "programmer", "engineer", "coder", "software"],
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
  companyWebsite?: string;
  applyEmail?: string;
  contactSearchUrl: string;
  hasActionableContact: boolean;
};

export type JobProviderStatus = {
  name: string;
  status: "ok" | "empty" | "error" | "disabled";
  resultCount: number;
  error?: string;
};

export type FreshJobSearchInput = {
  role: string;
  country: string;
  region: "Europe" | "Americas" | "Asia" | "Africa" | "Oceania";
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
  Nigeria: "nigeria",
  "South Africa": "south-africa",
  Kenya: "kenya",
  Egypt: "egypt",
  Morocco: "morocco",
  Ghana: "ghana",
  "New Zealand": "new-zealand",
};

const regionToJobicyGeo: Record<FreshJobSearchInput["region"], string> = {
  Europe: "europe",
  Americas: "latam",
  Asia: "apac",
  Africa: "africa",
  Oceania: "apac",
};

export function getJobicyGeoScope(input: FreshJobSearchInput) {
  if (input.country === "Worldwide") return { geo: "", scope: "global" as const };
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

const JOB_BOARD_DOMAINS = ["jobicy.com", "linkedin.com", "indeed.com", "glassdoor.com", "lever.co", "greenhouse.io", "workable.com", "recruitee.com", "breezy.hr", "smartrecruiters.com", "ashbyhq.com", "workday.com", "icims.com", "taleo.net", "myworkdayjobs.com", "bamboohr.com", "ultipro.com", "arbeitnow.com"];

function extractCompanyWebsite(text: string): string | undefined {
  const urlRegex = /https?:\/\/(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\/[^\s<>"')}\]]*)?/gi;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const domain = match[1].toLowerCase();
    if (!JOB_BOARD_DOMAINS.some((jb) => domain.includes(jb))) {
      return match[0].replace(/[.,;:!?)}\]]+$/, "");
    }
  }
  return undefined;
}

function extractApplyEmail(text: string): string | undefined {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const found = text.match(emailRegex);
  if (!found) return undefined;
  const dominated = ["noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon", "notifications", "unsubscribe"];
  for (const email of found) {
    const local = email.split("@")[0].toLowerCase();
    if (!dominated.some((d) => local.includes(d))) return email;
  }
  return undefined;
}

export function mapFreshJob(job: JobicyJob, now = Date.now()): FreshJob | null {
  if (!job.pubDate || !job.jobTitle || !job.companyName) return null;

  const publishedAt = new Date(job.pubDate);
  const publishedAtMs = publishedAt.getTime();
  if (Number.isNaN(publishedAtMs)) return null;

  const rawAgeMs = now - publishedAtMs;
  if (rawAgeMs > MAX_JOB_AGE_MS || rawAgeMs < -12 * 60 * 60 * 1000) return null;

  const rawDescription = job.jobDescription || "";
  const cleanDescription = stripMarkup(rawDescription).slice(0, 7000);
  const company = stripMarkup(job.companyName);
  const companyWebsite = extractCompanyWebsite(rawDescription);
  const applyEmail = extractApplyEmail(rawDescription);

  return {
    id: String(job.id || `${job.companyName}-${job.jobTitle}-${job.pubDate}`),
    title: stripMarkup(job.jobTitle),
    company,
    companyLogo: job.companyLogo,
    geography: stripMarkup(job.jobGeo) || "Remote / not specified",
    industry: Array.isArray(job.jobIndustry) ? job.jobIndustry.map(stripMarkup).filter(Boolean) : [],
    jobType: Array.isArray(job.jobType) ? job.jobType.map(stripMarkup).filter(Boolean) : [],
    level: stripMarkup(job.jobLevel) || "Not specified",
    excerpt: stripMarkup(job.jobExcerpt).slice(0, 480),
    description: cleanDescription,
    postedAt: publishedAt.toISOString(),
    ageHours: Math.max(0, Math.floor(rawAgeMs / (60 * 60 * 1000))),
    sourceUrl: asSafeSourceUrl(job.url),
    sourceName: JOBICY_SOURCE_NAME,
    salary: formatSalary(job),
    contactStatus: "Use the public source listing or verify a company contact before outreach.",
    companyWebsite,
    applyEmail,
    contactSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${company} official website contact careers`)}`,
    hasActionableContact: Boolean(companyWebsite || applyEmail || job.url),
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
  const searchable = `${job.title} ${job.excerpt} ${job.description}`.toLowerCase();
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
type HimalayasJob = { guid?: string; title?: string; companyName?: string; companyLogo?: string; excerpt?: string; description?: string; locationRestrictions?: string[]; categories?: string[]; parentCategories?: string[]; employmentType?: string; seniority?: string; pubDate?: string | number; applicationLink?: string; minSalary?: number | null; maxSalary?: number | null; currency?: string; salaryPeriod?: string };
type HimalayasResponse = { jobs?: HimalayasJob[] };
const HIMALAYAS_SOURCE_NAME = "Himalayas";
const HIMALAYAS_SOURCE_URL = "https://himalayas.app/docs/remote-jobs-api";
const WWR_SOURCE_NAME = "We Work Remotely";
const WWR_SOURCE_URL = "https://weworkremotely.com/remote-job-rss-feed";
const ADZUNA_SOURCE_NAME = "Adzuna";
const ADZUNA_SOURCE_URL = "https://developer.adzuna.com/";
const ADZUNA_EUROPE_COUNTRIES: Record<string, string> = { Germany: "de", Finland: "fi", "United Kingdom": "gb", France: "fr", Netherlands: "nl", Sweden: "se", Norway: "no", Denmark: "dk", Spain: "es", Italy: "it", Poland: "pl", Ireland: "ie", Austria: "at", Belgium: "be", Portugal: "pt", Switzerland: "ch" };
const THEIRSTACK_SOURCE_NAME = "TheirStack";
const THEIRSTACK_SOURCE_URL = "https://theirstack.com/en/job-posting-api";
const THEIRSTACK_EUROPE_COUNTRIES: Record<string, string> = { Germany: "DE", Finland: "FI", "United Kingdom": "GB", France: "FR", Netherlands: "NL", Sweden: "SE", Norway: "NO", Denmark: "DK", Spain: "ES", Italy: "IT", Poland: "PL", Ireland: "IE", Austria: "AT", Belgium: "BE", Portugal: "PT", Switzerland: "CH", Estonia: "EE", Latvia: "LV", Lithuania: "LT", Czechia: "CZ", Slovakia: "SK", Slovenia: "SI", Croatia: "HR", Greece: "GR", Hungary: "HU", Romania: "RO", Bulgaria: "BG", Luxembourg: "LU", Malta: "MT", Cyprus: "CY" };
function mapArbeitnowJob(job: ArbeitnowJob, now = Date.now()): FreshJob | null {
  if (!job.title || !job.company_name || !job.created_at) return null;
  const createdMs = typeof job.created_at === "number" ? (job.created_at < 10_000_000_000 ? job.created_at * 1000 : job.created_at) : Date.parse(job.created_at);
  if (!Number.isFinite(createdMs)) return null;
  const ageMs = now - createdMs;
  if (ageMs > MAX_JOB_AGE_MS || ageMs < -12 * 60 * 60 * 1000) return null;
  const description = stripMarkup(job.description).slice(0, 7000);
  const rawDesc = job.description || "";
  const company = stripMarkup(job.company_name);
  const companyWebsite = extractCompanyWebsite(rawDesc);
  const applyEmail = extractApplyEmail(rawDesc);
  return { id: `arbeitnow-${job.slug || `${job.company_name}-${job.title}`}`, title: stripMarkup(job.title), company, geography: stripMarkup(job.location) || (job.remote ? "Remote" : "Not specified"), industry: (job.tags || []).map(stripMarkup).filter(Boolean).slice(0, 8), jobType: [], level: "Not specified", excerpt: description.slice(0, 480), description, postedAt: new Date(createdMs).toISOString(), ageHours: Math.max(0, Math.floor(ageMs / (60 * 60 * 1000))), sourceUrl: asSafeSourceUrl(job.url), sourceName: ARBEITNOW_SOURCE_NAME, contactStatus: "Use the original public listing to apply or verify a company contact.", companyWebsite, applyEmail, contactSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${company} official website contact careers`)}`, hasActionableContact: Boolean(companyWebsite || applyEmail || job.url) };
}
async function fetchArbeitnow(): Promise<FreshJob[]> {
  const response = await fetch(ARBEITNOW_SOURCE_URL, { headers: { Accept: "application/json", "User-Agent": "Finderviews/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) return [];
  const payload = (await response.json()) as ArbeitnowResponse;
  return (payload.data || []).map((job) => mapArbeitnowJob(job)).filter((job): job is FreshJob => job !== null);
}

function mapHimalayasJob(job: HimalayasJob, now = Date.now()): FreshJob | null {
  if (!job.title || !job.companyName || !job.pubDate) return null;
  const publishedMs = typeof job.pubDate === "number" ? (job.pubDate < 10_000_000_000 ? job.pubDate * 1000 : job.pubDate) : Date.parse(job.pubDate);
  if (!Number.isFinite(publishedMs)) return null;
  const ageMs = now - publishedMs;
  if (ageMs > MAX_JOB_AGE_MS || ageMs < -12 * 60 * 60 * 1000) return null;
  const rawDescription = job.description || job.excerpt || "";
  const description = stripMarkup(rawDescription).slice(0, 7000);
  const company = stripMarkup(job.companyName);
  const companyWebsite = extractCompanyWebsite(rawDescription);
  const applyEmail = extractApplyEmail(rawDescription);
  const salary = job.minSalary || job.maxSalary ? `${job.currency || ""} ${job.minSalary || "?"}–${job.maxSalary || "?"}${job.salaryPeriod ? ` / ${job.salaryPeriod}` : ""}`.trim() : undefined;
  return { id: `himalayas-${job.guid || `${company}-${job.title}`}`, title: stripMarkup(job.title), company, companyLogo: job.companyLogo, geography: job.locationRestrictions?.join(", ") || "Worldwide / remote", industry: [...(job.categories || []), ...(job.parentCategories || [])].map(stripMarkup).filter(Boolean).slice(0, 8), jobType: job.employmentType ? [stripMarkup(job.employmentType)] : [], level: stripMarkup(job.seniority) || "Not specified", excerpt: stripMarkup(job.excerpt).slice(0, 480), description, postedAt: new Date(publishedMs).toISOString(), ageHours: Math.max(0, Math.floor(ageMs / (60 * 60 * 1000))), sourceUrl: asSafeSourceUrl(job.applicationLink), sourceName: HIMALAYAS_SOURCE_NAME, salary, contactStatus: "Use the original public listing or verify a company contact.", companyWebsite, applyEmail, contactSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${company} official website contact careers`)}`, hasActionableContact: Boolean(companyWebsite || applyEmail || job.applicationLink) };
}

async function fetchHimalayas(role: string, worldwide: boolean): Promise<FreshJob[]> {
  const params = new URLSearchParams({ limit: "20" });
  if (role) params.set("q", role);
  if (worldwide) params.set("worldwide", "true");
  const response = await fetch(`https://himalayas.app/jobs/api/search?${params.toString()}`, { headers: { Accept: "application/json", "User-Agent": "Finderviews/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) return [];
  const payload = (await response.json()) as HimalayasResponse;
  return (payload.jobs || []).map((job) => mapHimalayasJob(job)).filter((job): job is FreshJob => job !== null);
}

function decodeXml(value: string) { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
function rssTag(item: string, tag: string) { const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i")); return match ? decodeXml(match[1].trim()) : ""; }
function mapWwrItem(item: string, now = Date.now()): FreshJob | null {
  const headline = rssTag(item, "title"); const pubDate = rssTag(item, "pubDate"); const sourceUrl = rssTag(item, "link") || rssTag(item, "guid"); if (!headline || !pubDate || !sourceUrl) return null;
  const publishedMs = Date.parse(pubDate); if (!Number.isFinite(publishedMs)) return null; const ageMs = now - publishedMs; if (ageMs > MAX_JOB_AGE_MS || ageMs < -12 * 60 * 60 * 1000) return null;
  const split = headline.indexOf(":"); const company = split > 0 ? headline.slice(0, split).trim() : "Remote employer"; const title = split > 0 ? headline.slice(split + 1).trim() : headline; const rawDescription = rssTag(item, "description"); const description = stripMarkup(rawDescription).slice(0, 7000); const companyWebsite = extractCompanyWebsite(rawDescription); const applyEmail = extractApplyEmail(rawDescription);
  return { id: `wwr-${sourceUrl}`, title, company, geography: rssTag(item, "region") || "Worldwide / remote", industry: [rssTag(item, "category")].filter(Boolean), jobType: [rssTag(item, "type")].filter(Boolean), level: "Not specified", excerpt: description.slice(0, 480), description, postedAt: new Date(publishedMs).toISOString(), ageHours: Math.max(0, Math.floor(ageMs / (60 * 60 * 1000))), sourceUrl: asSafeSourceUrl(sourceUrl), sourceName: WWR_SOURCE_NAME, contactStatus: "Use the original public listing or verify a company contact.", companyWebsite, applyEmail, contactSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${company} official website contact careers`)}`, hasActionableContact: Boolean(companyWebsite || applyEmail || sourceUrl) };
}
async function fetchWwrRss(): Promise<FreshJob[]> {
  const response = await fetch("https://weworkremotely.com/remote-jobs.rss", { headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "Finderviews/1.0" }, signal: AbortSignal.timeout(12000) }); if (!response.ok) return [];
  const xml = await response.text(); return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => mapWwrItem(match[0])).filter((job): job is FreshJob => job !== null);
}

type AdzunaJob = { id?: string | number; title?: string; company?: { display_name?: string }; location?: { display_name?: string }; description?: string; created?: string; redirect_url?: string; category?: { label?: string }; contract_type?: string; contract_time?: string; salary_min?: number; salary_max?: number; salary_is_predicted?: string; }; type AdzunaResponse = { results?: AdzunaJob[] };
function mapAdzunaJob(job: AdzunaJob, now = Date.now()): FreshJob | null {
  if (!job.title || !job.company?.display_name || !job.created || !job.redirect_url) return null;
  const publishedMs = Date.parse(job.created); if (!Number.isFinite(publishedMs)) return null; const ageMs = now - publishedMs; if (ageMs > MAX_JOB_AGE_MS || ageMs < -12 * 60 * 60 * 1000) return null;
  const company = stripMarkup(job.company.display_name); const rawDescription = job.description || ""; const description = stripMarkup(rawDescription).slice(0, 7000); const companyWebsite = extractCompanyWebsite(rawDescription); const applyEmail = extractApplyEmail(rawDescription); const salary = job.salary_min || job.salary_max ? `${job.salary_min || "?"}–${job.salary_max || "?"}${job.salary_is_predicted === "1" ? " (estimated)" : ""}` : undefined;
  return { id: `adzuna-${job.id || `${company}-${job.title}-${job.created}`}`, title: stripMarkup(job.title), company, geography: stripMarkup(job.location?.display_name) || "Europe", industry: [stripMarkup(job.category?.label)].filter(Boolean), jobType: [job.contract_type, job.contract_time].filter(Boolean).map((value) => stripMarkup(value)), level: "Not specified", excerpt: description.slice(0, 480), description, postedAt: new Date(publishedMs).toISOString(), ageHours: Math.max(0, Math.floor(ageMs / (60 * 60 * 1000))), sourceUrl: asSafeSourceUrl(job.redirect_url), sourceName: ADZUNA_SOURCE_NAME, salary, contactStatus: "Use the original public listing or verify a company contact.", companyWebsite, applyEmail, contactSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${company} official website contact careers`)}`, hasActionableContact: Boolean(companyWebsite || applyEmail || job.redirect_url) };
}
export async function fetchAdzuna(input: FreshJobSearchInput, role: string): Promise<FreshJob[]> {
  const appId = process.env.ADZUNA_APP_ID; const appKey = process.env.ADZUNA_APP_KEY; if (!appId || !appKey) return [];
  const countries = input.country !== "Worldwide" && ADZUNA_EUROPE_COUNTRIES[input.country] ? [ADZUNA_EUROPE_COUNTRIES[input.country]] : input.region === "Europe" ? Object.values(ADZUNA_EUROPE_COUNTRIES) : [];
  const pages = await Promise.all(countries.map(async (country) => { const params = new URLSearchParams({ app_id: appId, app_key: appKey, results_per_page: "50", what: role && role !== "All hiring roles" ? role : "", content_type: "application/json" }); const response = await fetch(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`, { headers: { Accept: "application/json", "User-Agent": "Finderviews/1.0" }, signal: AbortSignal.timeout(12000) }); if (!response.ok) return []; const payload = (await response.json()) as AdzunaResponse; return (payload.results || []).map((job) => mapAdzunaJob(job)).filter((job): job is FreshJob => job !== null); }));
  return pages.flat();
}

type TheirStackJob = { id?: string | number; job_id?: string | number; job_title?: string; title?: string; company_name?: string; company?: { name?: string; domain?: string; home_page_url?: string }; job_location?: string; location?: string | { city?: string; country?: string; display_name?: string }; description?: string; job_description?: string; final_url?: string; url?: string; source_url?: string; date_posted?: string; posted_at?: string; created_at?: string; job_country_code?: string; salary_min?: number; salary_max?: number; salary_currency?: string; seniority?: string; employment_type?: string; category?: string; }; type TheirStackResponse = { jobs?: TheirStackJob[]; data?: TheirStackJob[]; results?: TheirStackJob[] };
function mapTheirStackJob(job: TheirStackJob, now = Date.now()): FreshJob | null {
  const title = job.job_title || job.title; const company = job.company_name || job.company?.name; const posted = job.date_posted || job.posted_at || job.created_at; const sourceUrl = job.final_url || job.url || job.source_url;
  if (!title || !company || !posted || !sourceUrl) return null;
  const publishedMs = Date.parse(posted); if (!Number.isFinite(publishedMs)) return null; const ageMs = now - publishedMs; if (ageMs > MAX_JOB_AGE_MS || ageMs < -12 * 60 * 60 * 1000) return null;
  const rawDescription = job.description || job.job_description || ""; const description = stripMarkup(rawDescription).slice(0, 7000); const cleanCompany = stripMarkup(company); const location = typeof job.location === "string" ? job.location : job.location?.display_name || [job.location?.city, job.location?.country].filter(Boolean).join(", "); const companyWebsite = job.company?.home_page_url || extractCompanyWebsite(rawDescription); const applyEmail = extractApplyEmail(rawDescription); const salary = job.salary_min || job.salary_max ? `${job.salary_currency || ""} ${job.salary_min || "?"}–${job.salary_max || "?"}`.trim() : undefined;
  return { id: `theirstack-${job.id || job.job_id || `${cleanCompany}-${title}-${posted}`}`, title: stripMarkup(title), company: cleanCompany, geography: stripMarkup(location) || job.job_country_code || "Europe", industry: [stripMarkup(job.category)].filter(Boolean), jobType: [stripMarkup(job.employment_type)].filter(Boolean), level: stripMarkup(job.seniority) || "Not specified", excerpt: description.slice(0, 480), description, postedAt: new Date(publishedMs).toISOString(), ageHours: Math.max(0, Math.floor(ageMs / (60 * 60 * 1000))), sourceUrl: asSafeSourceUrl(sourceUrl), sourceName: THEIRSTACK_SOURCE_NAME, salary, contactStatus: "Use the original public listing or verify a company contact.", companyWebsite, applyEmail, contactSearchUrl: `https://www.google.com/search?q=${encodeURIComponent(`${cleanCompany} official website contact careers`)}`, hasActionableContact: Boolean(companyWebsite || applyEmail || sourceUrl) };
}
export async function fetchTheirStack(input: FreshJobSearchInput, role: string): Promise<FreshJob[]> {
  const apiKey = process.env.THEIRSTACK_API_KEY; if (!apiKey) return [];
  const countries = input.country !== "Worldwide" && THEIRSTACK_EUROPE_COUNTRIES[input.country] ? [THEIRSTACK_EUROPE_COUNTRIES[input.country]] : input.region === "Europe" ? Object.values(THEIRSTACK_EUROPE_COUNTRIES) : [];
  if (countries.length === 0) return [];
  const response = await fetch("https://api.theirstack.com/v1/jobs/search", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": "Finderviews/1.0" }, body: JSON.stringify({ job_title_or: role && role !== "All hiring roles" ? [role] : undefined, job_country_code_or: countries, posted_at_max_age_days: MAX_JOB_AGE_DAYS, limit: Math.min(input.limit || 100, 500) }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) return [];
  const payload = (await response.json()) as TheirStackResponse;
  return (payload.jobs || payload.data || payload.results || []).map((job) => mapTheirStackJob(job)).filter((job): job is FreshJob => job !== null);
}
function dedupeJobs(jobs: FreshJob[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => { const key = `${job.company.toLowerCase()}|${job.title.toLowerCase()}|${job.sourceUrl}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

export async function searchFreshJobs(input: FreshJobSearchInput) {
  const geoScope = getJobicyGeoScope(input);
  const role = input.role.trim();
  const hasRole = role && role !== "All hiring roles";
  const count = String(Math.min(Math.max(input.limit || 100, 1), 60));

  let jobs: FreshJob[] = [];
  let fallbackJobs: FreshJob[] = [];
  let globalJobs: FreshJob[] = [];
  let rssJobs: FreshJob[] = [];
  let adzunaJobs: FreshJob[] = [];
  let theirStackJobs: FreshJob[] = [];
  const providers: JobProviderStatus[] = [];
  try {
    if (hasRole) {
      const tagParams = new URLSearchParams({ count, tag: role });
      if (geoScope.geo) tagParams.set("geo", geoScope.geo);
      jobs = (await fetchJobicy(tagParams)).filter((job) => matchesRequestedRole(job, role));
    }
    if (jobs.length === 0) {
      const broadParams = new URLSearchParams({ count });
      if (geoScope.geo) broadParams.set("geo", geoScope.geo);
      const allJobs = await fetchJobicy(broadParams);
      jobs = hasRole ? allJobs.filter((job) => matchesRequestedRole(job, role)) : allJobs;
    }
    if (jobs.length === 0 && geoScope.scope === "country") {
      const regionParams = new URLSearchParams({ count, geo: regionToJobicyGeo[input.region] });
      const regionJobs = await fetchJobicy(regionParams);
      jobs = hasRole ? regionJobs.filter((job) => matchesRequestedRole(job, role)) : regionJobs;
    }
    if (jobs.length === 0) {
      const globalParams = new URLSearchParams({ count });
      const globalJobs = await fetchJobicy(globalParams);
      jobs = hasRole ? globalJobs.filter((job) => matchesRequestedRole(job, role)) : globalJobs;
    }
    providers.push({ name: JOBICY_SOURCE_NAME, status: jobs.length > 0 ? "ok" : "empty", resultCount: jobs.length });
  } catch (error) {
    providers.push({ name: JOBICY_SOURCE_NAME, status: "error", resultCount: 0, error: error instanceof Error ? error.message : "Provider request failed" });
  }
  try {
    const publicJobs = await fetchArbeitnow();
    fallbackJobs = hasRole ? publicJobs.filter((job) => matchesRequestedRole(job, role)) : publicJobs;
    const countryNeedle = input.country.toLowerCase();
    const regionNeedlesMap: Record<string, string[]> = { Europe: ["germany", "uk", "united kingdom", "france", "netherlands", "europe"], Asia: ["asia", "india", "japan", "singapore", "remote"], Americas: ["usa", "united states", "canada", "brazil", "latam", "remote"], Africa: ["africa", "nigeria", "kenya", "south africa", "egypt", "morocco", "ghana", "remote"], Oceania: ["australia", "new zealand", "apac", "remote"] };
    const regionNeedles = regionNeedlesMap[input.region] || ["remote"];
    const scopedFallback = input.country === "Worldwide" ? fallbackJobs : fallbackJobs.filter((job) => { const text = job.geography.toLowerCase(); return text.includes(countryNeedle) || regionNeedles.some((needle) => text.includes(needle)); });
    fallbackJobs = scopedFallback.length > 0 ? scopedFallback : fallbackJobs;
    providers.push({ name: ARBEITNOW_SOURCE_NAME, status: fallbackJobs.length > 0 ? "ok" : "empty", resultCount: fallbackJobs.length });
  } catch (error) {
    providers.push({ name: ARBEITNOW_SOURCE_NAME, status: "error", resultCount: 0, error: error instanceof Error ? error.message : "Provider request failed" });
  }
  try {
    globalJobs = (await fetchHimalayas(hasRole ? role : "", input.country === "Worldwide")).filter((job) => !hasRole || matchesRequestedRole(job, role));
    providers.push({ name: HIMALAYAS_SOURCE_NAME, status: globalJobs.length > 0 ? "ok" : "empty", resultCount: globalJobs.length });
  } catch (error) {
    providers.push({ name: HIMALAYAS_SOURCE_NAME, status: "error", resultCount: 0, error: error instanceof Error ? error.message : "Provider request failed" });
  }
  try {
    rssJobs = (await fetchWwrRss()).filter((job) => !hasRole || matchesRequestedRole(job, role));
    providers.push({ name: WWR_SOURCE_NAME, status: rssJobs.length > 0 ? "ok" : "empty", resultCount: rssJobs.length });
  } catch (error) {
    providers.push({ name: WWR_SOURCE_NAME, status: "error", resultCount: 0, error: error instanceof Error ? error.message : "Provider request failed" });
  }
  try {
    adzunaJobs = (await fetchAdzuna(input, role)).filter((job) => !hasRole || matchesRequestedRole(job, role));
    providers.push({ name: ADZUNA_SOURCE_NAME, status: adzunaJobs.length > 0 ? "ok" : process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY ? "empty" : "disabled", resultCount: adzunaJobs.length });
  } catch (error) {
    providers.push({ name: ADZUNA_SOURCE_NAME, status: "error", resultCount: 0, error: error instanceof Error ? error.message : "Provider request failed" });
  }
  try {
    theirStackJobs = (await fetchTheirStack(input, role)).filter((job) => !hasRole || matchesRequestedRole(job, role));
    providers.push({ name: THEIRSTACK_SOURCE_NAME, status: theirStackJobs.length > 0 ? "ok" : process.env.THEIRSTACK_API_KEY ? "empty" : "disabled", resultCount: theirStackJobs.length });
  } catch (error) {
    providers.push({ name: THEIRSTACK_SOURCE_NAME, status: "error", resultCount: 0, error: error instanceof Error ? error.message : "Provider request failed" });
  }
  jobs = dedupeJobs([...jobs, ...fallbackJobs, ...globalJobs, ...rssJobs, ...adzunaJobs, ...theirStackJobs]).slice(0, Math.min(Math.max(input.limit || 100, 1), 500));
  return {
    jobs,
    sourceName: jobs.length > 0 ? [...new Set(jobs.map((job) => job.sourceName))].join(" + ") : `${JOBICY_SOURCE_NAME} + ${ARBEITNOW_SOURCE_NAME}`,
    sourceUrl: JOBICY_SOURCE_URL,
    freshnessDays: MAX_JOB_AGE_DAYS,
    countryFilterApplied: geoScope.scope === "country",
    regionFilterApplied: geoScope.scope === "region",
    globalFilterApplied: geoScope.scope === "global",
    countryContext: input.country,
    regionContext: input.region,
    providers,
    refreshedAt: new Date().toISOString(),
    contactCoverage: jobs.length ? Math.round((jobs.filter((job) => job.hasActionableContact).length / jobs.length) * 100) : 0,
  };
}
