import { createJobIfNew, type JobType } from "../jobs.ts";
import { normalizeImportedJob, type ImportedJob } from "./jobImporter.ts";

export type SyncFeed =
  | { name: string; url: string; format: "rss" | "json"; kind?: "generic" }
  | { name: string; url: string; format: "json"; kind: "greenhouse" | "lever" };

export const BASE_SYNC_FEEDS: SyncFeed[] = [
  { name: "We Work Remotely", url: "https://weworkremotely.com/remote-jobs.rss", format: "rss", kind: "generic" },
  { name: "Jobicy", url: "https://jobicy.com/api/v2/remote-jobs?count=20", format: "json", kind: "generic" },
];

type SyncSummary = { source: string; fetched: number; inserted: number; duplicates: number; skipped: number; error?: string };
type FeedJob = Omit<Partial<ImportedJob>, "location" | "jobType"> & { company?: string; company_name?: string; companyName?: string; job_title?: string; jobTitle?: string; jobType?: string | string[]; employment_type?: string; url?: string; link?: string; job_url?: string; job_description?: string; jobDescription?: string; pubDate?: string; posted_at?: string; date_posted?: string; salary?: string; jobGeo?: string; jobIndustry?: string | string[]; location?: string | { name?: string; display_name?: string } };

type GreenhouseJob = { id?: number; title?: string; content?: string; location?: { name?: string }; absolute_url?: string; updated_at?: string; offices?: Array<{ name?: string }> };
type LeverJob = { id?: string; text?: string; descriptionPlain?: string; hostedUrl?: string; applyUrl?: string; createdAt?: number; categories?: { location?: string; team?: string; commitment?: string }; }; 

function stripTags(value: unknown) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
function text(value: unknown, max = 12000) { return stripTags(value).slice(0, max); }
function mapType(value: unknown): JobType { const raw = text(value, 40).toLowerCase(); if (raw.includes("contract")) return "Contract"; if (raw.includes("part")) return "Part-time"; if (raw.includes("full") || raw.includes("permanent")) return "Full-time"; if (raw.includes("hybrid")) return "Hybrid"; return "Remote"; }
function mapCategory(value: unknown, title: string) { const raw = text(value, 80).toLowerCase(); if (raw.includes("design")) return "Design"; if (raw.includes("market")) return "Marketing"; if (raw.includes("product")) return "Product"; if (raw.includes("sales")) return "Sales"; if (raw.includes("data") || raw.includes("engineer") || raw.includes("developer") || /react|node|typescript|python|devops|software/i.test(title)) return "Engineering"; return "Operations"; }
function mapFeedJob(input: FeedJob): ImportedJob | null {
  const title = text(input.title || input.job_title || input.jobTitle, 240);
  const companyName = text(input.companyName || input.company_name || input.company || "Imported employer", 240);
  const locationValue = typeof input.location === "object" ? input.location.name || input.location.display_name : input.location || input.jobGeo;
  const description = text(input.description || input.job_description || input.jobDescription, 12000);
  const requirements = text(input.requirements || description, 8000);
  const applicationContact = text(input.applicationContact || input.url || input.link || input.job_url, 320);
  return normalizeImportedJob({ title, companyName, location: text(locationValue || "Remote", 240), jobType: mapType(input.jobType || input.employment_type), category: mapCategory(input.category || input.jobIndustry, title), salaryRange: text(input.salaryRange || input.salary, 120), description, requirements, applicationContact });
}
function mapGreenhouseJob(job: GreenhouseJob, company: string): ImportedJob | null {
  return mapFeedJob({ title: job.title, company, location: job.location?.name || job.offices?.map((office) => office.name).filter(Boolean).join(", "), description: job.content, requirements: job.content, applicationContact: job.absolute_url, jobType: "Full-time", category: job.title });
}
function mapLeverJob(job: LeverJob, company: string): ImportedJob | null {
  return mapFeedJob({ title: job.text, company, location: job.categories?.location, description: job.descriptionPlain, requirements: job.descriptionPlain, applicationContact: job.hostedUrl || job.applyUrl, jobType: job.categories?.commitment, category: job.categories?.team });
}
function parseRss(xml: string) {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => {
    const item = match[0];
    const read = (tag: string) => item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "";
    return mapFeedJob({ title: read("title"), company: read("author") || read("dc:creator"), description: read("description") || read("content:encoded"), location: read("location"), link: read("link"), jobType: "Remote" });
  }).filter((job): job is ImportedJob => Boolean(job));
}
function parseJson(payload: unknown) {
  const records = Array.isArray(payload) ? payload : ((payload as { jobs?: unknown[]; data?: unknown[]; results?: unknown[] })?.jobs || (payload as { data?: unknown[] })?.data || (payload as { results?: unknown[] })?.results || []);
  return records.map((record) => mapFeedJob(record as FeedJob)).filter((job): job is ImportedJob => Boolean(job));
}
function parseGreenhouse(payload: unknown, company: string) {
  return ((payload as { jobs?: GreenhouseJob[] })?.jobs || []).map((job) => mapGreenhouseJob(job, company)).filter((job): job is ImportedJob => Boolean(job));
}
function parseLever(payload: unknown, company: string) {
  return (Array.isArray(payload) ? payload as LeverJob[] : []).map((job) => mapLeverJob(job, company)).filter((job): job is ImportedJob => Boolean(job));
}

function configuredFeeds(): SyncFeed[] {
  const feeds = [...BASE_SYNC_FEEDS];
  const greenhouseBoards = (process.env.GREENHOUSE_BOARDS || "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const board of greenhouseBoards) feeds.push({ name: `Greenhouse / ${board}`, url: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`, format: "json", kind: "greenhouse" });
  const leverSites = (process.env.LEVER_SITES || "").split(",").map((value) => value.trim()).filter(Boolean);
  for (const site of leverSites) feeds.push({ name: `Lever / ${site}`, url: `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`, format: "json", kind: "lever" });
  return feeds;
}

export async function syncFeed(feed: SyncFeed): Promise<SyncSummary> {
  try {
    const response = await fetch(feed.url, { headers: { Accept: feed.format === "rss" ? "application/rss+xml, application/xml, text/xml" : "application/json", "User-Agent": "FinderViews-AutoSync/1.0" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    const company = feed.name.split(" / ").slice(1).join(" / ") || feed.name;
    const payload = feed.format === "rss" ? await response.text() : await response.json();
    const jobs = feed.format === "rss" ? parseRss(payload as string) : feed.kind === "greenhouse" ? parseGreenhouse(payload, company) : feed.kind === "lever" ? parseLever(payload, company) : parseJson(payload);
    let inserted = 0, duplicates = 0, skipped = 0;
    for (const job of jobs) {
      try {
        const result = await createJobIfNew({ ...job, salaryRange: job.salaryRange || null });
        if (result.duplicate) duplicates++; else if (result.job) inserted++;
      } catch { skipped++; }
    }
    return { source: feed.name, fetched: jobs.length, inserted, duplicates, skipped };
  } catch (error) {
    return { source: feed.name, fetched: 0, inserted: 0, duplicates: 0, skipped: 0, error: error instanceof Error ? error.message : "Unknown feed error" };
  }
}

let syncInFlight: Promise<{ imported: number; sources: SyncSummary[] }> | null = null;
export async function syncAllFeeds() {
  if (syncInFlight) return syncInFlight;
  syncInFlight = Promise.all(configuredFeeds().map(syncFeed)).then((sources) => ({ imported: sources.reduce((sum, source) => sum + source.inserted, 0), sources })).finally(() => { syncInFlight = null; });
  return syncInFlight;
}
