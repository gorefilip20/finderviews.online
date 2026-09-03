/**
 * Job source adapters.
 *
 * Every source here is free and needs no API key, which is deliberate: the product must return
 * real jobs on a bare deployment. Keyed providers stay optional extras rather than the thing the
 * feature depends on.
 *
 * Each adapter is defensive about the payload it receives. A provider changing a field name
 * should cost us that provider's rows, not the whole search.
 */
import { fetchJson, safeHttpsUrl, stripHtml, toIsoDate } from "./http";
import type { NormalisedJob, SourceOutcome, SourceQuery } from "./types";

export type AdapterResult = { jobs: NormalisedJob[]; outcome: SourceOutcome };

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

const tagList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 12) : [];

/* ------------------------------------------------------------------ Jobicy */

/** Jobicy documents regional scopes for Europe, APAC and LATAM only. */
const JOBICY_COUNTRY_GEO: Record<string, string> = {
  "United States": "usa",
  Canada: "canada",
  Australia: "australia",
  China: "china",
  "Hong Kong": "hong-kong",
  "United Kingdom": "united-kingdom",
  Germany: "germany",
  India: "india",
  Singapore: "singapore",
};

const JOBICY_REGION_GEO: Record<string, string> = {
  Europe: "europe",
  Americas: "latam",
  Asia: "apac",
};

export function jobicyScope(query: SourceQuery): { geo: string | null; scope: string } {
  const direct = JOBICY_COUNTRY_GEO[query.country];
  if (direct) return { geo: direct, scope: `country:${query.country}` };
  const region = JOBICY_REGION_GEO[query.region];
  if (region) return { geo: region, scope: `region:${query.region}` };
  return { geo: null, scope: "worldwide" };
}

/**
 * Jobicy's `tag` is a keyword filter, and an unrecognised value returns an empty set rather than
 * an error. Sending the raw role text was silently emptying the feed, so the tag is normalised to
 * a single lowercase keyword and role relevance is enforced by Finder afterwards instead.
 */
export function jobicyTag(role: string): string | null {
  const cleaned = role.trim().toLowerCase();
  if (!cleaned || cleaned === "all hiring roles") return null;
  const keyword = cleaned.split(/\s+/).filter(word => word.length > 2).pop();
  return keyword ?? null;
}

export async function fetchJobicy(query: SourceQuery): Promise<AdapterResult> {
  const params = new URLSearchParams({ count: String(Math.min(Math.max(query.limit, 20), 50)) });
  const { geo, scope } = jobicyScope(query);
  if (geo) params.set("geo", geo);
  const tag = jobicyTag(query.role);
  if (tag) params.set("tag", tag);

  const result = await fetchJson<{ jobs?: unknown }>(`https://jobicy.com/api/v2/remote-jobs?${params.toString()}`);
  if (!result.ok) {
    return { jobs: [], outcome: { source: "Jobicy", ok: false, fetched: 0, usable: 0, ms: result.ms, error: result.error, scope } };
  }

  const rows = asArray(result.data.jobs);
  const jobs = rows
    .map((raw): NormalisedJob | null => {
      const row = raw as Record<string, unknown>;
      const postedAt = toIsoDate(row.pubDate);
      const title = stripHtml(row.jobTitle, 200);
      const company = stripHtml(row.companyName, 160);
      if (!postedAt || !title || !company) return null;

      return {
        externalId: String(row.id ?? `${company}-${title}`),
        title,
        company,
        companyLogo: asString(row.companyLogo) || undefined,
        location: stripHtml(row.jobGeo, 120) || "Remote",
        remote: true,
        excerpt: stripHtml(row.jobExcerpt, 480),
        description: stripHtml(row.jobDescription),
        postedAt,
        url: safeHttpsUrl(row.url, "https://jobicy.com/"),
        tags: tagList(row.jobIndustry),
        jobType: tagList(row.jobType),
        sourceName: "Jobicy",
        sourceUrl: "https://jobicy.com/",
      };
    })
    .filter((job): job is NormalisedJob => job !== null);

  return { jobs, outcome: { source: "Jobicy", ok: true, fetched: rows.length, usable: jobs.length, ms: result.ms, scope } };
}

/* --------------------------------------------------------------- Arbeitnow */

/**
 * Arbeitnow is the most valuable addition: it is free, needs no key, and unlike the others it
 * carries on-site roles as well as remote ones, which is what the local-hiring signal needs.
 */
export async function fetchArbeitnow(query: SourceQuery): Promise<AdapterResult> {
  const result = await fetchJson<{ data?: unknown }>("https://www.arbeitnow.com/api/job-board-api");
  if (!result.ok) {
    return { jobs: [], outcome: { source: "Arbeitnow", ok: false, fetched: 0, usable: 0, ms: result.ms, error: result.error, scope: "worldwide" } };
  }

  const rows = asArray(result.data.data);
  const jobs = rows
    .map((raw): NormalisedJob | null => {
      const row = raw as Record<string, unknown>;
      const postedAt = toIsoDate(row.created_at);
      const title = stripHtml(row.title, 200);
      const company = stripHtml(row.company_name, 160);
      if (!postedAt || !title || !company) return null;

      return {
        externalId: asString(row.slug) || `${company}-${title}`,
        title,
        company,
        location: stripHtml(row.location, 120) || "Not stated",
        remote: row.remote === true,
        excerpt: stripHtml(row.description, 480),
        description: stripHtml(row.description),
        postedAt,
        url: safeHttpsUrl(row.url, "https://www.arbeitnow.com/"),
        tags: tagList(row.tags),
        jobType: tagList(row.job_types),
        sourceName: "Arbeitnow",
        sourceUrl: "https://www.arbeitnow.com/",
      };
    })
    .filter((job): job is NormalisedJob => job !== null);

  return { jobs, outcome: { source: "Arbeitnow", ok: true, fetched: rows.length, usable: jobs.length, ms: result.ms, scope: "worldwide" } };
}

/* ---------------------------------------------------------------- RemoteOK */

/**
 * RemoteOK's terms require attribution and a link back, which is carried on every record and
 * surfaced in the interface.
 */
export async function fetchRemoteOk(query: SourceQuery): Promise<AdapterResult> {
  const result = await fetchJson<unknown>("https://remoteok.com/api");
  if (!result.ok) {
    return { jobs: [], outcome: { source: "RemoteOK", ok: false, fetched: 0, usable: 0, ms: result.ms, error: result.error, scope: "worldwide" } };
  }

  // The first element of the array is RemoteOK's legal notice, not a job.
  const rows = asArray(result.data).filter(row => {
    const record = row as Record<string, unknown>;
    return typeof record.position === "string" || typeof record.company === "string";
  });

  const jobs = rows
    .map((raw): NormalisedJob | null => {
      const row = raw as Record<string, unknown>;
      const postedAt = toIsoDate(row.date ?? row.epoch);
      const title = stripHtml(row.position, 200);
      const company = stripHtml(row.company, 160);
      if (!postedAt || !title || !company) return null;

      return {
        externalId: String(row.id ?? row.slug ?? `${company}-${title}`),
        title,
        company,
        companyLogo: asString(row.company_logo) || undefined,
        location: stripHtml(row.location, 120) || "Remote",
        remote: true,
        excerpt: stripHtml(row.description, 480),
        description: stripHtml(row.description),
        postedAt,
        url: safeHttpsUrl(row.url, "https://remoteok.com/"),
        tags: tagList(row.tags),
        jobType: [],
        salary:
          typeof row.salary_min === "number" && row.salary_min > 0
            ? `USD ${Number(row.salary_min).toLocaleString("en-US")}+`
            : undefined,
        sourceName: "RemoteOK",
        sourceUrl: "https://remoteok.com/",
        attribution: "Jobs by RemoteOK",
      };
    })
    .filter((job): job is NormalisedJob => job !== null);

  return { jobs, outcome: { source: "RemoteOK", ok: true, fetched: rows.length, usable: jobs.length, ms: result.ms, scope: "worldwide" } };
}

/* --------------------------------------------------------------- Himalayas */

export async function fetchHimalayas(query: SourceQuery): Promise<AdapterResult> {
  const limit = Math.min(Math.max(query.limit * 2, 20), 50);
  const result = await fetchJson<{ jobs?: unknown }>(`https://himalayas.app/jobs/api?limit=${limit}`);
  if (!result.ok) {
    return { jobs: [], outcome: { source: "Himalayas", ok: false, fetched: 0, usable: 0, ms: result.ms, error: result.error, scope: "worldwide" } };
  }

  const rows = asArray(result.data.jobs);
  const jobs = rows
    .map((raw): NormalisedJob | null => {
      const row = raw as Record<string, unknown>;
      const postedAt = toIsoDate(row.pubDate);
      const title = stripHtml(row.title, 200);
      const company = stripHtml(row.companyName, 160);
      if (!postedAt || !title || !company) return null;

      const restrictions = tagList(row.locationRestrictions);
      return {
        externalId: String(row.guid ?? `${company}-${title}`),
        title,
        company,
        companyLogo: asString(row.companyLogo) || undefined,
        location: restrictions.length > 0 ? restrictions.join(", ") : "Remote",
        remote: true,
        excerpt: stripHtml(row.excerpt ?? row.description, 480),
        description: stripHtml(row.description),
        postedAt,
        url: safeHttpsUrl(row.applicationLink ?? row.url, "https://himalayas.app/jobs"),
        tags: tagList(row.categories),
        jobType: [],
        sourceName: "Himalayas",
        sourceUrl: "https://himalayas.app/",
      };
    })
    .filter((job): job is NormalisedJob => job !== null);

  return { jobs, outcome: { source: "Himalayas", ok: true, fetched: rows.length, usable: jobs.length, ms: result.ms, scope: "worldwide" } };
}

/* ------------------------------------------------------- company ATS boards */

export type AtsProvider = "greenhouse" | "lever" | "ashby";

/**
 * A company's own applicant-tracking board. These are public, need no key, and are the freshest
 * and most authoritative source that exists for one named company — the posting appears here
 * before it reaches any aggregator.
 */
export async function fetchCompanyBoard(provider: AtsProvider, slug: string): Promise<AdapterResult> {
  const source = `${provider}:${slug}`;
  const clean = slug.trim().replace(/[^A-Za-z0-9._-]/g, "");
  if (!clean) {
    return { jobs: [], outcome: { source, ok: false, fetched: 0, usable: 0, ms: 0, error: "Invalid company identifier" } };
  }

  if (provider === "greenhouse") {
    const result = await fetchJson<{ jobs?: unknown }>(
      `https://boards-api.greenhouse.io/v1/boards/${clean}/jobs?content=true`,
    );
    if (!result.ok) return { jobs: [], outcome: { source, ok: false, fetched: 0, usable: 0, ms: result.ms, error: result.error } };

    const rows = asArray(result.data.jobs);
    const jobs = rows
      .map((raw): NormalisedJob | null => {
        const row = raw as Record<string, unknown>;
        const postedAt = toIsoDate(row.updated_at ?? row.first_published);
        const title = stripHtml(row.title, 200);
        if (!postedAt || !title) return null;
        const location = (row.location as Record<string, unknown> | undefined)?.name;
        return {
          externalId: String(row.id ?? title),
          title,
          company: clean,
          location: stripHtml(location, 120) || "Not stated",
          remote: /remote/i.test(asString(location)),
          excerpt: stripHtml(row.content, 480),
          description: stripHtml(row.content),
          postedAt,
          url: safeHttpsUrl(row.absolute_url, `https://boards.greenhouse.io/${clean}`),
          tags: [],
          jobType: [],
          sourceName: "Greenhouse",
          sourceUrl: `https://boards.greenhouse.io/${clean}`,
        };
      })
      .filter((job): job is NormalisedJob => job !== null);

    return { jobs, outcome: { source, ok: true, fetched: rows.length, usable: jobs.length, ms: result.ms, scope: `company:${clean}` } };
  }

  if (provider === "lever") {
    const result = await fetchJson<unknown>(`https://api.lever.co/v0/postings/${clean}?mode=json`);
    if (!result.ok) return { jobs: [], outcome: { source, ok: false, fetched: 0, usable: 0, ms: result.ms, error: result.error } };

    const rows = asArray(result.data);
    const jobs = rows
      .map((raw): NormalisedJob | null => {
        const row = raw as Record<string, unknown>;
        const postedAt = toIsoDate(row.createdAt);
        const title = stripHtml(row.text, 200);
        if (!postedAt || !title) return null;
        const categories = (row.categories as Record<string, unknown> | undefined) ?? {};
        return {
          externalId: String(row.id ?? title),
          title,
          company: clean,
          location: stripHtml(categories.location, 120) || "Not stated",
          remote: /remote/i.test(asString(categories.location)),
          excerpt: stripHtml(row.descriptionPlain ?? row.description, 480),
          description: stripHtml(row.descriptionPlain ?? row.description),
          postedAt,
          url: safeHttpsUrl(row.hostedUrl ?? row.applyUrl, `https://jobs.lever.co/${clean}`),
          tags: [asString(categories.team)].filter(Boolean),
          jobType: [asString(categories.commitment)].filter(Boolean),
          sourceName: "Lever",
          sourceUrl: `https://jobs.lever.co/${clean}`,
        };
      })
      .filter((job): job is NormalisedJob => job !== null);

    return { jobs, outcome: { source, ok: true, fetched: rows.length, usable: jobs.length, ms: result.ms, scope: `company:${clean}` } };
  }

  const result = await fetchJson<{ jobs?: unknown }>(
    `https://api.ashbyhq.com/posting-api/job-board/${clean}?includeCompensation=true`,
  );
  if (!result.ok) return { jobs: [], outcome: { source, ok: false, fetched: 0, usable: 0, ms: result.ms, error: result.error } };

  const rows = asArray(result.data.jobs);
  const jobs = rows
    .map((raw): NormalisedJob | null => {
      const row = raw as Record<string, unknown>;
      const postedAt = toIsoDate(row.publishedAt ?? row.updatedAt);
      const title = stripHtml(row.title, 200);
      if (!postedAt || !title) return null;
      return {
        externalId: String(row.id ?? title),
        title,
        company: stripHtml(row.companyName, 160) || clean,
        location: stripHtml(row.location, 120) || "Not stated",
        remote: row.isRemote === true,
        excerpt: stripHtml(row.descriptionPlain ?? row.descriptionHtml, 480),
        description: stripHtml(row.descriptionPlain ?? row.descriptionHtml),
        postedAt,
        url: safeHttpsUrl(row.jobUrl ?? row.applyUrl, `https://jobs.ashbyhq.com/${clean}`),
        tags: [stripHtml(row.department, 60)].filter(Boolean),
        jobType: [stripHtml(row.employmentType, 60)].filter(Boolean),
        sourceName: "Ashby",
        sourceUrl: `https://jobs.ashbyhq.com/${clean}`,
      };
    })
    .filter((job): job is NormalisedJob => job !== null);

  return { jobs, outcome: { source, ok: true, fetched: rows.length, usable: jobs.length, ms: result.ms, scope: `company:${clean}` } };
}

export const FREE_SOURCES = [
  { key: "jobicy", label: "Jobicy", fetch: fetchJobicy },
  { key: "arbeitnow", label: "Arbeitnow", fetch: fetchArbeitnow },
  { key: "remoteok", label: "RemoteOK", fetch: fetchRemoteOk },
  { key: "himalayas", label: "Himalayas", fetch: fetchHimalayas },
] as const;

export type FreeSourceKey = (typeof FREE_SOURCES)[number]["key"];
