import { createJobIfNew, JOB_TYPES, type JobType } from "../jobs.ts";
import { normalizeImportedJob, type ImportedJob } from "./jobImporter.ts";

export const SYNC_FEEDS = [
  { name: "We Work Remotely", url: "https://weworkremotely.com/remote-jobs.rss", format: "rss" as const },
  { name: "Jobicy", url: "https://jobicy.com/api/v2/remote-jobs?count=20", format: "json" as const },
];

type SyncSummary = { source: string; fetched: number; inserted: number; duplicates: number; skipped: number; error?: string };
type FeedJob = Omit<Partial<ImportedJob>, "location" | "jobType"> & { company?: string; company_name?: string; companyName?: string; job_title?: string; jobTitle?: string; jobType?: string | string[]; employment_type?: string; url?: string; link?: string; job_url?: string; job_description?: string; jobDescription?: string; pubDate?: string; posted_at?: string; date_posted?: string; salary?: string; jobGeo?: string; jobIndustry?: string | string[]; location?: string | { name?: string; display_name?: string } };

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

export async function syncFeed(feed: typeof SYNC_FEEDS[number]): Promise<SyncSummary> {
  try {
    const response = await fetch(feed.url, { headers: { Accept: feed.format === "rss" ? "application/rss+xml, application/xml, text/xml" : "application/json", "User-Agent": "FinderViews-AutoSync/1.0" }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    const jobs = feed.format === "rss" ? parseRss(await response.text()) : parseJson(await response.json());
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
  syncInFlight = Promise.all(SYNC_FEEDS.map(syncFeed)).then((sources) => ({ imported: sources.reduce((sum, source) => sum + source.inserted, 0), sources })).finally(() => { syncInFlight = null; });
  return syncInFlight;
}
