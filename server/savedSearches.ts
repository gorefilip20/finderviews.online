/**
 * Saved searches and monitoring.
 *
 * A saved search re-runs the exact finder the user configured and reports only what is
 * genuinely new since the last run — that difference is what makes Finder worth opening
 * every week instead of once.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { savedSearches, searchAlerts, type SavedSearch } from "../drizzle/schema";
import { badRequest, notFound } from "./_core/errors";
import type { DiscoveredProspect } from "./discovery";
import { FINDER_LABELS, finderParamsSchema, runFinder, type FinderKind } from "./runner";
import { loadSnapshotHistory, recordSnapshots, saveProspects } from "./repository";
import { requireDb } from "./workspace";

export const CADENCES = ["daily", "weekly", "monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

const CADENCE_MS: Record<Cadence, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export async function listSavedSearches(workspaceId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.workspaceId, workspaceId))
    .orderBy(desc(savedSearches.updatedAt));
}

export async function createSavedSearch(params: {
  workspaceId: number;
  userId: number;
  name: string;
  kind: FinderKind;
  params: unknown;
  cadence: Cadence;
  alertsEnabled: boolean;
}) {
  const db = await requireDb();
  const parsed = finderParamsSchema.safeParse(params.params);
  if (!parsed.success) throw badRequest("Those search settings are not valid.");

  await db.insert(savedSearches).values({
    workspaceId: params.workspaceId,
    userId: params.userId,
    name: params.name,
    kind: params.kind,
    params: parsed.data,
    cadence: params.cadence,
    alertsEnabled: params.alertsEnabled,
  });

  const rows = await listSavedSearches(params.workspaceId);
  return rows[0];
}

export async function updateSavedSearch(params: {
  workspaceId: number;
  id: number;
  name?: string;
  cadence?: Cadence;
  alertsEnabled?: boolean;
}) {
  const db = await requireDb();
  const changes: Record<string, unknown> = {};
  if (params.name !== undefined) changes.name = params.name;
  if (params.cadence !== undefined) changes.cadence = params.cadence;
  if (params.alertsEnabled !== undefined) changes.alertsEnabled = params.alertsEnabled;
  if (Object.keys(changes).length === 0) return { success: true } as const;

  await db
    .update(savedSearches)
    .set(changes)
    .where(and(eq(savedSearches.id, params.id), eq(savedSearches.workspaceId, params.workspaceId)));
  return { success: true } as const;
}

export async function deleteSavedSearch(workspaceId: number, id: number) {
  const db = await requireDb();
  await db.delete(searchAlerts).where(eq(searchAlerts.savedSearchId, id));
  await db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.workspaceId, workspaceId)));
  return { success: true } as const;
}

export type SavedSearchRun = {
  searchId: number;
  name: string;
  kind: FinderKind;
  label: string;
  total: number;
  newProspects: DiscoveredProspect[];
  precisionNote: string;
  sourcesConnected: boolean;
};

/**
 * Runs one saved search and records anything that was not present on the previous run.
 * `persist: false` lets the UI preview a run without writing alerts.
 */
export async function runSavedSearch(search: SavedSearch, options?: { persist?: boolean }): Promise<SavedSearchRun> {
  const db = await requireDb();
  const parsed = finderParamsSchema.safeParse(search.params);
  if (!parsed.success) throw badRequest(`Saved search "${search.name}" has settings Finder can no longer run.`);

  const kind = search.kind as FinderKind;
  const previewKeys = Array.isArray(search.lastSeenKeys) ? search.lastSeenKeys : [];

  const history = await loadSnapshotHistory(search.workspaceId, previewKeys);
  const result = await runFinder(kind, parsed.data, { velocity: key => history.get(key) });

  const seen = new Set(previewKeys);
  const newProspects = result.prospects.filter(prospect => !seen.has(prospect.dedupeKey));
  const persist = options?.persist ?? true;

  if (persist && result.prospects.length > 0) {
    await saveProspects(search.workspaceId, result.prospects);
    await recordSnapshots(search.workspaceId, result.prospects);

    if (search.alertsEnabled && newProspects.length > 0) {
      await db.insert(searchAlerts).values(
        newProspects.map(prospect => ({
          workspaceId: search.workspaceId,
          savedSearchId: search.id,
          dedupeKey: prospect.dedupeKey,
          headline: `${prospect.name} — ${prospect.signalSummary}`.slice(0, 500),
          changeType: "new_match",
          payload: {
            score: prospect.score.score,
            band: prospect.score.band,
            country: prospect.country,
            listingUrl: prospect.listingUrl,
          },
        })),
      );
    }

    await db
      .update(savedSearches)
      .set({
        lastRunAt: new Date(),
        lastSeenKeys: [...new Set([...previewKeys, ...result.prospects.map(p => p.dedupeKey)])].slice(-500),
      })
      .where(eq(savedSearches.id, search.id));
  }

  return {
    searchId: search.id,
    name: search.name,
    kind,
    label: FINDER_LABELS[kind],
    total: result.prospects.length,
    newProspects,
    precisionNote: result.precisionNote,
    sourcesConnected: result.sources.every(source => source.connected),
  };
}

export async function runSavedSearchById(workspaceId: number, id: number, options?: { persist?: boolean }) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(savedSearches)
    .where(and(eq(savedSearches.id, id), eq(savedSearches.workspaceId, workspaceId)))
    .limit(1);
  if (rows.length === 0) throw notFound("That saved search does not exist.");
  return runSavedSearch(rows[0], options);
}

export function isDue(search: SavedSearch, now = new Date()) {
  if (!search.alertsEnabled) return false;
  if (!search.lastRunAt) return true;
  const interval = CADENCE_MS[(search.cadence as Cadence) ?? "weekly"] ?? CADENCE_MS.weekly;
  return now.getTime() - search.lastRunAt.getTime() >= interval;
}

export async function listDueSearches(now = new Date()) {
  const db = await requireDb();
  const rows = await db.select().from(savedSearches).where(eq(savedSearches.alertsEnabled, true));
  return rows.filter(search => isDue(search, now));
}

export async function listAlerts(workspaceId: number, options?: { unreadOnly?: boolean; limit?: number }) {
  const db = await requireDb();
  const conditions = [eq(searchAlerts.workspaceId, workspaceId)];
  if (options?.unreadOnly) conditions.push(isNull(searchAlerts.readAt));
  return db
    .select()
    .from(searchAlerts)
    .where(and(...conditions))
    .orderBy(desc(searchAlerts.createdAt))
    .limit(options?.limit ?? 100);
}

export async function markAlertsRead(workspaceId: number, ids: number[]) {
  const db = await requireDb();
  if (ids.length === 0) return { success: true } as const;
  const now = new Date();
  for (const id of ids) {
    await db
      .update(searchAlerts)
      .set({ readAt: now })
      .where(and(eq(searchAlerts.id, id), eq(searchAlerts.workspaceId, workspaceId)));
  }
  return { success: true } as const;
}
