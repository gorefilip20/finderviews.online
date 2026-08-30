/**
 * Client health over time.
 *
 * Once a site is won and rebuilt, Finder keeps auditing it and plots the score falling. That
 * chart is the retainer argument: it turns "we built you a website" into "here is what we keep
 * doing for you", which is the difference between project revenue and recurring revenue.
 *
 * Scores here are decay scores — lower is better — so an improving client is a descending line.
 * The reporting layer converts that into plain language so nobody has to remember the direction.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { siteHealthPoints, trackedSites, type SiteHealthPoint, type TrackedSite } from "../drizzle/schema";
import { notFound } from "./_core/errors";
import { auditWebsite } from "./webaudit";
import { requireDb } from "./workspace";

export const HEALTH_CADENCES = ["weekly", "monthly", "quarterly"] as const;
export type HealthCadence = (typeof HEALTH_CADENCES)[number];

const CADENCE_MS: Record<HealthCadence, number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
  quarterly: 91 * 24 * 60 * 60 * 1000,
};

export async function listTrackedSites(workspaceId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(trackedSites)
    .where(eq(trackedSites.workspaceId, workspaceId))
    .orderBy(desc(trackedSites.createdAt));
}

export async function trackSite(params: {
  workspaceId: number;
  label: string;
  url: string;
  prospectId?: number;
  cadence?: HealthCadence;
}) {
  const db = await requireDb();

  // The first audit becomes the baseline everything later is measured against.
  const audit = await auditWebsite(params.url);

  await db
    .insert(trackedSites)
    .values({
      workspaceId: params.workspaceId,
      prospectId: params.prospectId ?? null,
      label: params.label,
      url: params.url,
      cadence: params.cadence ?? "monthly",
      baselineScore: audit.decayScore,
      lastScore: audit.decayScore,
      lastCheckedAt: new Date(),
    })
    .onDuplicateKeyUpdate({ set: { label: params.label, active: true, cadence: params.cadence ?? "monthly" } });

  const rows = await db
    .select()
    .from(trackedSites)
    .where(and(eq(trackedSites.workspaceId, params.workspaceId), eq(trackedSites.url, params.url)))
    .limit(1);
  if (rows.length === 0) throw notFound("The tracked site could not be created.");

  await db.insert(siteHealthPoints).values({
    trackedSiteId: rows[0].id,
    decayScore: audit.decayScore,
    verdict: audit.verdict,
    failingChecks: audit.checks.filter(check => check.status === "fail").length,
    checks: audit.checks,
  });

  return rows[0];
}

export async function untrackSite(workspaceId: number, id: number) {
  const db = await requireDb();
  await db
    .update(trackedSites)
    .set({ active: false })
    .where(and(eq(trackedSites.id, id), eq(trackedSites.workspaceId, workspaceId)));
  return { success: true } as const;
}

/** Re-audits one tracked site and appends a health point. */
export async function checkSite(site: TrackedSite) {
  const db = await requireDb();
  const audit = await auditWebsite(site.url);

  await db.insert(siteHealthPoints).values({
    trackedSiteId: site.id,
    decayScore: audit.decayScore,
    verdict: audit.verdict,
    failingChecks: audit.checks.filter(check => check.status === "fail").length,
    checks: audit.checks,
  });

  await db
    .update(trackedSites)
    .set({
      lastScore: audit.decayScore,
      lastCheckedAt: new Date(),
      baselineScore: site.baselineScore ?? audit.decayScore,
    })
    .where(eq(trackedSites.id, site.id));

  return audit;
}

export function isDueForCheck(site: TrackedSite, now = new Date()) {
  if (!site.active) return false;
  if (!site.lastCheckedAt) return true;
  const interval = CADENCE_MS[(site.cadence as HealthCadence) ?? "monthly"] ?? CADENCE_MS.monthly;
  return now.getTime() - site.lastCheckedAt.getTime() >= interval;
}

/** Entry point for the scheduled hook; re-audits every tracked site that is due. */
export async function runDueHealthChecks() {
  const db = await requireDb();
  const sites = await db.select().from(trackedSites).where(eq(trackedSites.active, true));
  const due = sites.filter(site => isDueForCheck(site));

  const results: { id: number; label: string; score?: number; error?: string }[] = [];
  for (const site of due) {
    try {
      const audit = await checkSite(site);
      results.push({ id: site.id, label: site.label, score: audit.decayScore });
    } catch (error) {
      results.push({ id: site.id, label: site.label, error: error instanceof Error ? error.message : "Check failed." });
    }
  }
  return { checked: results.length, results };
}

/* ---------------------------------------------------------------- reporting */

export type HealthReport = {
  site: TrackedSite;
  points: SiteHealthPoint[];
  baseline: number | null;
  current: number | null;
  /** Positive means the site got better, because decay scores fall as health improves. */
  improvement: number | null;
  improvementPercent: number | null;
  headline: string;
  direction: "improved" | "unchanged" | "worsened" | "insufficient";
  sparkline: string;
};

/**
 * A dependency-free sparkline. Inline SVG keeps the report portable into an email or a PDF,
 * where a charting library would not survive.
 */
export function sparklineSvg(values: number[], width = 220, height = 44): string {
  if (values.length === 0) return "";
  if (values.length === 1) {
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="One reading so far"><circle cx="${width / 2}" cy="${height / 2}" r="3" fill="#1D241F" /></svg>`;
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const stepX = width / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * stepX;
    // Decay score: high is bad, so invert for a chart where "up" reads as better.
    const y = height - ((value - min) / span) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const improving = values[values.length - 1] <= values[0];
  const stroke = improving ? "#2F6B36" : "#9B2C2C";

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Health trend">
    <polyline fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${points.join(" ")}" />
    <circle cx="${points[points.length - 1].split(",")[0]}" cy="${points[points.length - 1].split(",")[1]}" r="3" fill="${stroke}" />
  </svg>`;
}

export function describeImprovement(baseline: number | null, current: number | null, pointCount: number) {
  if (baseline === null || current === null || pointCount < 2) {
    return {
      direction: "insufficient" as const,
      headline: "Not enough readings yet. A second check will show the trend.",
      improvement: null,
      improvementPercent: null,
    };
  }

  const improvement = baseline - current;
  const improvementPercent = baseline === 0 ? 0 : Math.round((improvement / baseline) * 100);

  if (improvement > 2) {
    return {
      direction: "improved" as const,
      headline: `Down ${improvement} points since the baseline — a ${improvementPercent}% improvement in site health.`,
      improvement,
      improvementPercent,
    };
  }
  if (improvement < -2) {
    return {
      direction: "worsened" as const,
      headline: `Up ${Math.abs(improvement)} points since the baseline. Something has regressed — worth a look.`,
      improvement,
      improvementPercent,
    };
  }
  return {
    direction: "unchanged" as const,
    headline: "Holding steady since the baseline.",
    improvement,
    improvementPercent,
  };
}

export async function healthReport(workspaceId: number, siteId: number): Promise<HealthReport> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(trackedSites)
    .where(and(eq(trackedSites.id, siteId), eq(trackedSites.workspaceId, workspaceId)))
    .limit(1);
  if (rows.length === 0) throw notFound("That site is not tracked in this workspace.");
  const site = rows[0];

  const points = await db
    .select()
    .from(siteHealthPoints)
    .where(eq(siteHealthPoints.trackedSiteId, siteId))
    .orderBy(asc(siteHealthPoints.recordedAt));

  const values = points.map(point => point.decayScore);
  const baseline = site.baselineScore ?? values[0] ?? null;
  const current = values[values.length - 1] ?? site.lastScore ?? null;
  const described = describeImprovement(baseline, current, points.length);

  return {
    site,
    points,
    baseline,
    current,
    sparkline: sparklineSvg(values),
    ...described,
  };
}
