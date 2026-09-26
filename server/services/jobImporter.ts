import { createJob } from "../jobs.ts";

export type ImportedJob = {
  title: string;
  companyName: string;
  location: string;
  jobType: "Remote" | "Full-time" | "Part-time" | "Contract" | "Hybrid";
  category: string;
  salaryRange?: string;
  description: string;
  requirements: string;
  applicationContact: string;
};

function clean(value: unknown, max = 12000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeImportedJob(input: Partial<ImportedJob>): ImportedJob | null {
  const job = {
    title: clean(input.title, 240), companyName: clean(input.companyName, 240), location: clean(input.location, 240),
    jobType: input.jobType, category: clean(input.category, 120), salaryRange: clean(input.salaryRange, 120),
    description: clean(input.description), requirements: clean(input.requirements, 8000), applicationContact: clean(input.applicationContact, 320),
  } as ImportedJob;
  if (!job.title || !job.companyName || !job.location || !job.jobType || !job.category || job.description.length < 20 || job.requirements.length < 10 || !job.applicationContact) return null;
  return job;
}

export async function importJobsFromJson(records: unknown[]) {
  const imported = [];
  for (const record of records) {
    const normalized = normalizeImportedJob(record as Partial<ImportedJob>);
    if (normalized) imported.push((await createJob({ ...normalized, salaryRange: normalized.salaryRange || null }))!);
  }
  return imported;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

export function parseRssJobs(xml: string): ImportedJob[] {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => {
    const item = match[0];
    const read = (tag: string) => stripTags(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
    const link = read("link");
    return normalizeImportedJob({ title: read("title"), companyName: read("author") || read("dc:creator") || "Imported employer", location: read("location") || "Remote", jobType: "Remote", category: "Engineering", description: read("description"), requirements: read("description"), applicationContact: link })!;
  }).filter((job): job is ImportedJob => Boolean(job));
}

export async function importJobsFromRss(xml: string) {
  return importJobsFromJson(parseRssJobs(xml));
}
