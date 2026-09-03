/**
 * Job aggregation.
 *
 * Three problems this fixes, all of which made the live site look like it "fetched no jobs":
 *
 *  1. **A single point of failure.** One free source, remote-only. If it was slow, blocked or
 *     empty, the product had nothing. Sources are now queried in parallel and a failure in one
 *     costs only that source's rows.
 *  2. **Silent over-filtering.** A strict freshness window and a strict role filter were applied
 *     one after the other with no reporting, so a search that fetched eighty jobs and discarded
 *     all of them looked identical to a search that fetched none. The funnel is now measured at
 *     every stage and returned.
 *  3. **Role matching that was too literal.** An exact alias substring meant "product manager"
 *     missed "Senior Product Manager, Growth" in some phrasings and matched nothing at all for
 *     any role not in the alias table. Matching is now token-based with the title weighted above
 *     the body.
 */
import { FREE_SOURCES, fetchCompanyBoard, type AtsProvider, type FreeSourceKey } from "./adapters";
import type { NormalisedJob, SourceOutcome, SourceQuery } from "./types";

export const DEFAULT_FRESHNESS_DAYS = 5;
export const MAX_FRESHNESS_DAYS = 30;

/** Words that carry no signal when matching a role. */
const STOP_WORDS = new Set([
  "a", "an", "and", "the", "of", "for", "to", "in", "at", "on", "with", "or", "job", "jobs",
  "role", "roles", "position", "all", "hiring", "senior", "junior", "lead", "staff", "principal",
]);

/** Related terms so a search for one wording still finds the others. */
const SYNONYMS: Record<string, string[]> = {
  developer: ["developer", "engineer", "programmer"],
  engineer: ["engineer", "developer"],
  designer: ["designer", "design"],
  marketing: ["marketing", "marketer", "growth"],
  growth: ["growth", "marketing"],
  writer: ["writer", "copywriter", "content", "editor"],
  copywriter: ["copywriter", "writer", "content"],
  manager: ["manager", "management", "lead"],
  product: ["product"],
  sales: ["sales", "account executive", "business development"],
  support: ["support", "success", "care"],
  founder: ["founder", "co-founder", "cofounder"],
  frontend: ["frontend", "front-end", "front end", "ui"],
  backend: ["backend", "back-end", "back end"],
  fullstack: ["fullstack", "full-stack", "full stack"],
  web: ["web", "website", "frontend", "wordpress"],
  data: ["data", "analytics", "analyst"],
  operations: ["operations", "ops"],
};

export function roleTokens(role: string): string[] {
  const cleaned = role.trim().toLowerCase();
  if (!cleaned || cleaned === "all hiring roles") return [];

  const words = cleaned
    .split(/[^a-z0-9+#]+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));

  const expanded = new Set<string>();
  for (const word of words) {
    expanded.add(word);
    for (const synonym of SYNONYMS[word] ?? []) expanded.add(synonym);
  }
  return [...expanded];
}

/**
 * Scores how well a job answers the requested role. A hit in the title is worth far more than one
 * in the body, because a body mention is often an unrelated "work with our product team".
 */
export function roleScore(job: Pick<NormalisedJob, "title" | "excerpt" | "tags">, role: string): number {
  const tokens = roleTokens(role);
  if (tokens.length === 0) return 1;

  const title = job.title.toLowerCase();
  const body = `${job.excerpt} ${job.tags.join(" ")}`.toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 3;
    else if (body.includes(token)) score += 1;
  }
  return score / (tokens.length * 3);
}

/** Kept deliberately permissive: one strong title hit is enough to be worth showing. */
export function matchesRole(job: Pick<NormalisedJob, "title" | "excerpt" | "tags">, role: string): boolean {
  const tokens = roleTokens(role);
  if (tokens.length === 0) return true;
  const title = job.title.toLowerCase();
  if (tokens.some(token => title.includes(token))) return true;
  return roleScore(job, role) >= 0.34;
}

export function ageInDays(job: Pick<NormalisedJob, "postedAt">, now = Date.now()): number {
  return (now - Date.parse(job.postedAt)) / (24 * 60 * 60 * 1000);
}

export function isFresh(job: Pick<NormalisedJob, "postedAt">, days: number, now = Date.now()): boolean {
  const age = ageInDays(job, now);
  // A small negative age is a provider clock difference, not a job from the future.
  return age <= days && age >= -0.5;
}

export function dedupe(jobs: NormalisedJob[]): NormalisedJob[] {
  const seen = new Map<string, NormalisedJob>();
  for (const job of jobs) {
    const key = `${job.company.toLowerCase().replace(/[^a-z0-9]/g, "")}|${job.title.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const existing = seen.get(key);
    // Keep the freshest copy when two sources carry the same posting.
    if (!existing || Date.parse(job.postedAt) > Date.parse(existing.postedAt)) seen.set(key, job);
  }
  return [...seen.values()];
}

/** Does the job's stated location plausibly answer the requested market? */
export function matchesLocation(job: NormalisedJob, query: { country: string; location?: string; remoteOnly: boolean }): boolean {
  if (query.remoteOnly) return true;
  const haystack = job.location.toLowerCase();
  if (!haystack || haystack === "not stated") return job.remote;
  if (job.remote) return true;

  const country = query.country.toLowerCase();
  const place = query.location?.toLowerCase().split(",")[0]?.trim();
  return haystack.includes(country) || (Boolean(place) && haystack.includes(place as string));
}

export type JobFunnel = {
  fetched: number;
  usable: number;
  afterFreshness: number;
  afterRole: number;
  afterLocation: number;
  afterDedupe: number;
};

export type AggregateResult = {
  jobs: NormalisedJob[];
  funnel: JobFunnel;
  sources: SourceOutcome[];
  freshnessDays: number;
  attributions: string[];
  /** Plain-language explanation, written to be useful when the list is empty. */
  note: string;
};

export type AggregateOptions = {
  freshnessDays?: number;
  sources?: FreeSourceKey[];
  companyBoards?: { provider: AtsProvider; slug: string }[];
};

/**
 * Explains the result in the terms the user cares about. Written empty-first, because an empty
 * list with no explanation is the failure this whole module exists to remove.
 */
export function describeFunnel(funnel: JobFunnel, sources: SourceOutcome[], days: number, role: string): string {
  const working = sources.filter(source => source.ok);
  const failed = sources.filter(source => !source.ok);

  if (working.length === 0) {
    return `No job source could be reached. ${failed.map(source => `${source.source}: ${source.error}`).join("; ")}`;
  }
  if (funnel.fetched === 0) {
    return `The sources answered but returned no listings at all. Tried ${sources.map(s => s.source).join(", ")}.`;
  }
  if (funnel.afterFreshness === 0) {
    return `Fetched ${funnel.fetched} listings, but none were posted in the last ${days} days. Widen the freshness window to see more.`;
  }
  if (funnel.afterRole === 0) {
    return `Fetched ${funnel.fetched} listings and ${funnel.afterFreshness} were fresh, but none matched "${role}". Try a broader role, or "All hiring roles".`;
  }
  if (funnel.afterLocation === 0) {
    return `${funnel.afterRole} fresh listings matched "${role}", but none stated a location matching your market. Switch on remote-only to include them.`;
  }

  const failedNote = failed.length > 0 ? ` ${failed.length} source(s) were unavailable: ${failed.map(s => `${s.source} (${s.error})`).join(", ")}.` : "";
  return `${funnel.afterDedupe} matching roles from ${working.length} live source(s), posted in the last ${days} days.${failedNote}`;
}

export async function aggregateJobs(query: SourceQuery, options: AggregateOptions = {}): Promise<AggregateResult> {
  const freshnessDays = Math.min(Math.max(options.freshnessDays ?? DEFAULT_FRESHNESS_DAYS, 1), MAX_FRESHNESS_DAYS);
  const wanted = options.sources ?? FREE_SOURCES.map(source => source.key);
  const chosen = FREE_SOURCES.filter(source => wanted.includes(source.key));

  const tasks = [
    ...chosen.map(source => source.fetch(query)),
    ...(options.companyBoards ?? []).map(board => fetchCompanyBoard(board.provider, board.slug)),
  ];

  // allSettled, not all: one provider throwing must not empty the whole search.
  const settled = await Promise.allSettled(tasks);
  const sources: SourceOutcome[] = [];
  let pool: NormalisedJob[] = [];

  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") {
      sources.push(outcome.value.outcome);
      pool = pool.concat(outcome.value.jobs);
    } else {
      sources.push({
        source: chosen[index]?.label ?? "Source",
        ok: false,
        fetched: 0,
        usable: 0,
        ms: 0,
        error: outcome.reason instanceof Error ? outcome.reason.message : "Adapter failed",
      });
    }
  }

  const funnel: JobFunnel = {
    fetched: sources.reduce((sum, source) => sum + source.fetched, 0),
    usable: pool.length,
    afterFreshness: 0,
    afterRole: 0,
    afterLocation: 0,
    afterDedupe: 0,
  };

  const fresh = pool.filter(job => isFresh(job, freshnessDays));
  funnel.afterFreshness = fresh.length;

  const roleMatched = fresh.filter(job => matchesRole(job, query.role));
  funnel.afterRole = roleMatched.length;

  const located = roleMatched.filter(job => matchesLocation(job, query));
  funnel.afterLocation = located.length;

  const deduped = dedupe(located).sort((a, b) => {
    const byRole = roleScore(b, query.role) - roleScore(a, query.role);
    if (Math.abs(byRole) > 0.15) return byRole;
    return Date.parse(b.postedAt) - Date.parse(a.postedAt);
  });
  funnel.afterDedupe = deduped.length;

  return {
    jobs: deduped.slice(0, Math.max(query.limit, 1)),
    funnel,
    sources,
    freshnessDays,
    attributions: [...new Set(deduped.map(job => job.attribution).filter((item): item is string => Boolean(item)))],
    note: describeFunnel(funnel, sources, freshnessDays, query.role),
  };
}
