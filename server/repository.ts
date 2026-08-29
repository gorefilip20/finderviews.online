/**
 * Persistence for discovered prospects, the pipeline, territory and suppression.
 *
 * Saving a prospect is what turns a search result into workspace state: it becomes
 * de-duplicated, assignable, exportable and monitorable from that point on.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  pipelineEntries,
  pipelineEvents,
  prospectSnapshots,
  prospects,
  suppressions,
  territoryClaims,
  users,
  webAudits,
  type InsertProspect,
} from "../drizzle/schema";
import { notFound } from "./_core/errors";
import type { DiscoveredProspect } from "./discovery";
import { requireDb } from "./workspace";

export const PIPELINE_STAGES = [
  "new",
  "researching",
  "contacted",
  "replied",
  "proposal",
  "won",
  "lost",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

function toInsert(workspaceId: number, prospect: DiscoveredProspect): InsertProspect {
  return {
    workspaceId,
    dedupeKey: prospect.dedupeKey,
    name: prospect.name,
    category: prospect.category ?? null,
    region: prospect.region,
    country: prospect.country,
    address: prospect.address ?? null,
    phone: prospect.phone ?? null,
    website: prospect.website ?? null,
    listingUrl: prospect.listingUrl ?? null,
    latitude: prospect.latitude != null ? String(prospect.latitude) : null,
    longitude: prospect.longitude != null ? String(prospect.longitude) : null,
    rating: prospect.rating != null ? String(prospect.rating) : null,
    reviewCount: prospect.reviewCount ?? null,
    reviewVelocity: prospect.reviewVelocity != null ? String(prospect.reviewVelocity) : null,
    signalType: prospect.signalType,
    signalSummary: prospect.signalSummary.slice(0, 500),
    gapScore: prospect.score.score,
    gapFactors: prospect.score,
    icpScore: prospect.icp?.score ?? null,
    dealBand: prospect.deal.band,
    dealLow: prospect.deal.low,
    dealHigh: prospect.deal.high,
    dealCurrency: prospect.deal.currency,
    source: prospect.source,
    sourceUrl: prospect.sourceUrl ?? null,
    observedAt: new Date(prospect.observedAt),
  };
}

export async function saveProspects(workspaceId: number, incoming: DiscoveredProspect[]) {
  const db = await requireDb();
  if (incoming.length === 0) return { saved: 0, ids: [] as number[] };

  for (const prospect of incoming) {
    const values = toInsert(workspaceId, prospect);
    await db
      .insert(prospects)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          name: values.name,
          category: values.category,
          address: values.address,
          phone: values.phone,
          website: values.website,
          listingUrl: values.listingUrl,
          rating: values.rating,
          reviewCount: values.reviewCount,
          reviewVelocity: values.reviewVelocity,
          signalType: values.signalType,
          signalSummary: values.signalSummary,
          gapScore: values.gapScore,
          gapFactors: values.gapFactors,
          icpScore: values.icpScore,
          dealBand: values.dealBand,
          dealLow: values.dealLow,
          dealHigh: values.dealHigh,
          source: values.source,
          sourceUrl: values.sourceUrl,
          observedAt: values.observedAt,
        },
      });

    if (prospect.audit) {
      await db.insert(webAudits).values({
        workspaceId,
        url: prospect.audit.url,
        reachable: prospect.audit.reachable,
        httpStatus: prospect.audit.httpStatus,
        responseMs: prospect.audit.responseMs,
        checks: prospect.audit.checks,
        decayScore: prospect.audit.decayScore,
        verdict: prospect.audit.verdict,
      });
    }
  }

  const keys = incoming.map(p => p.dedupeKey);
  const rows = await db
    .select({ id: prospects.id, dedupeKey: prospects.dedupeKey })
    .from(prospects)
    .where(and(eq(prospects.workspaceId, workspaceId), inArray(prospects.dedupeKey, keys)));

  return { saved: rows.length, ids: rows.map(row => row.id) };
}

/** Records what the public metrics looked like today so momentum can be derived later. */
export async function recordSnapshots(workspaceId: number, observed: DiscoveredProspect[]) {
  const db = await requireDb();
  if (observed.length === 0) return;
  await db.insert(prospectSnapshots).values(
    observed.map(prospect => ({
      workspaceId,
      dedupeKey: prospect.dedupeKey,
      reviewCount: prospect.reviewCount ?? null,
      rating: prospect.rating != null ? String(prospect.rating) : null,
      hasWebsite: Boolean(prospect.website),
      decayScore: prospect.audit?.decayScore ?? null,
    })),
  );
}

export async function loadSnapshotHistory(workspaceId: number, keys: string[]) {
  const db = await requireDb();
  if (keys.length === 0) return new Map<string, { reviewCount: number; observedAt: Date }[]>();

  const rows = await db
    .select({
      dedupeKey: prospectSnapshots.dedupeKey,
      reviewCount: prospectSnapshots.reviewCount,
      observedAt: prospectSnapshots.observedAt,
    })
    .from(prospectSnapshots)
    .where(and(eq(prospectSnapshots.workspaceId, workspaceId), inArray(prospectSnapshots.dedupeKey, keys)));

  const history = new Map<string, { reviewCount: number; observedAt: Date }[]>();
  for (const row of rows) {
    if (row.reviewCount == null) continue;
    const list = history.get(row.dedupeKey) ?? [];
    list.push({ reviewCount: row.reviewCount, observedAt: row.observedAt });
    history.set(row.dedupeKey, list);
  }
  return history;
}

/* ----------------------------------------------------- suppression + territory */

export async function listSuppressions(workspaceId: number) {
  const db = await requireDb();
  return db.select().from(suppressions).where(eq(suppressions.workspaceId, workspaceId));
}

export async function addSuppression(params: {
  workspaceId: number;
  matchKey: string;
  kind: string;
  reason?: string;
}) {
  const db = await requireDb();
  await db
    .insert(suppressions)
    .values({
      workspaceId: params.workspaceId,
      matchKey: params.matchKey,
      kind: params.kind,
      reason: params.reason ?? null,
    })
    .onDuplicateKeyUpdate({ set: { kind: params.kind, reason: params.reason ?? null } });
  return { success: true } as const;
}

export async function removeSuppression(workspaceId: number, matchKey: string) {
  const db = await requireDb();
  await db
    .delete(suppressions)
    .where(and(eq(suppressions.workspaceId, workspaceId), eq(suppressions.matchKey, matchKey)));
  return { success: true } as const;
}

export async function listTerritories(workspaceId: number) {
  const db = await requireDb();
  return db
    .select({
      id: territoryClaims.id,
      scopeKey: territoryClaims.scopeKey,
      label: territoryClaims.label,
      userId: territoryClaims.userId,
      claimedBy: users.name,
      claimedEmail: users.email,
      createdAt: territoryClaims.createdAt,
    })
    .from(territoryClaims)
    .leftJoin(users, eq(users.id, territoryClaims.userId))
    .where(eq(territoryClaims.workspaceId, workspaceId));
}

export async function claimTerritory(params: {
  workspaceId: number;
  userId: number;
  scopeKey: string;
  label: string;
}) {
  const db = await requireDb();
  const existing = await db
    .select()
    .from(territoryClaims)
    .where(and(eq(territoryClaims.workspaceId, params.workspaceId), eq(territoryClaims.scopeKey, params.scopeKey)))
    .limit(1);

  if (existing.length > 0) {
    return {
      claimed: existing[0].userId === params.userId,
      alreadyClaimedByUserId: existing[0].userId,
      note:
        existing[0].userId === params.userId
          ? "You already hold this territory."
          : "Another member of this workspace already holds this territory.",
    };
  }

  await db.insert(territoryClaims).values(params);
  return { claimed: true, alreadyClaimedByUserId: params.userId, note: "Territory claimed." };
}

export async function releaseTerritory(workspaceId: number, scopeKey: string) {
  const db = await requireDb();
  await db
    .delete(territoryClaims)
    .where(and(eq(territoryClaims.workspaceId, workspaceId), eq(territoryClaims.scopeKey, scopeKey)));
  return { success: true } as const;
}

/* ------------------------------------------------------------------ pipeline */

export async function listPipeline(workspaceId: number, filters?: { stage?: PipelineStage; assignedUserId?: number }) {
  const db = await requireDb();
  const conditions = [eq(pipelineEntries.workspaceId, workspaceId)];
  if (filters?.stage) conditions.push(eq(pipelineEntries.stage, filters.stage));
  if (filters?.assignedUserId) conditions.push(eq(pipelineEntries.assignedUserId, filters.assignedUserId));

  return db
    .select({
      entry: pipelineEntries,
      prospect: prospects,
      assigneeName: users.name,
      assigneeEmail: users.email,
    })
    .from(pipelineEntries)
    .innerJoin(prospects, eq(prospects.id, pipelineEntries.prospectId))
    .leftJoin(users, eq(users.id, pipelineEntries.assignedUserId))
    .where(and(...conditions))
    .orderBy(desc(prospects.gapScore));
}

export async function addToPipeline(params: {
  workspaceId: number;
  prospectId: number;
  userId: number;
  stage?: PipelineStage;
}) {
  const db = await requireDb();
  await db
    .insert(pipelineEntries)
    .values({
      workspaceId: params.workspaceId,
      prospectId: params.prospectId,
      stage: params.stage ?? "new",
      assignedUserId: params.userId,
    })
    .onDuplicateKeyUpdate({ set: { stage: params.stage ?? "new" } });

  const entry = await db
    .select()
    .from(pipelineEntries)
    .where(and(eq(pipelineEntries.workspaceId, params.workspaceId), eq(pipelineEntries.prospectId, params.prospectId)))
    .limit(1);

  if (entry.length === 0) throw notFound("The pipeline entry could not be created.");

  await db.insert(pipelineEvents).values({
    workspaceId: params.workspaceId,
    entryId: entry[0].id,
    userId: params.userId,
    kind: "added",
    detail: `Added to the pipeline at stage "${params.stage ?? "new"}".`,
  });

  return entry[0];
}

export async function updatePipelineEntry(params: {
  workspaceId: number;
  entryId: number;
  userId: number;
  stage?: PipelineStage;
  assignedUserId?: number | null;
  notes?: string;
  value?: number | null;
  nextFollowUpAt?: Date | null;
  lostReason?: string | null;
}) {
  const db = await requireDb();
  const existing = await db
    .select()
    .from(pipelineEntries)
    .where(and(eq(pipelineEntries.id, params.entryId), eq(pipelineEntries.workspaceId, params.workspaceId)))
    .limit(1);
  if (existing.length === 0) throw notFound("That pipeline entry does not exist in this workspace.");

  const changes: Record<string, unknown> = {};
  if (params.stage !== undefined) changes.stage = params.stage;
  if (params.assignedUserId !== undefined) changes.assignedUserId = params.assignedUserId;
  if (params.notes !== undefined) changes.notes = params.notes;
  if (params.value !== undefined) changes.value = params.value;
  if (params.nextFollowUpAt !== undefined) changes.nextFollowUpAt = params.nextFollowUpAt;
  if (params.lostReason !== undefined) changes.lostReason = params.lostReason;

  if (Object.keys(changes).length > 0) {
    await db.update(pipelineEntries).set(changes).where(eq(pipelineEntries.id, params.entryId));
  }

  if (params.stage && params.stage !== existing[0].stage) {
    await db.insert(pipelineEvents).values({
      workspaceId: params.workspaceId,
      entryId: params.entryId,
      userId: params.userId,
      kind: "stage_changed",
      detail: `${existing[0].stage} → ${params.stage}`,
    });
    // Reaching "contacted" suppresses the business from future discovery results so no
    // one in the workspace approaches it twice.
    if (params.stage === "contacted") {
      const prospect = await db.select().from(prospects).where(eq(prospects.id, existing[0].prospectId)).limit(1);
      if (prospect[0]) {
        await addSuppression({
          workspaceId: params.workspaceId,
          matchKey: prospect[0].dedupeKey,
          kind: "contacted",
          reason: "Marked as contacted in the pipeline.",
        });
      }
    }
  }

  if (params.assignedUserId !== undefined && params.assignedUserId !== existing[0].assignedUserId) {
    await db.insert(pipelineEvents).values({
      workspaceId: params.workspaceId,
      entryId: params.entryId,
      userId: params.userId,
      kind: "assigned",
      detail: params.assignedUserId ? `Assigned to user ${params.assignedUserId}.` : "Assignment cleared.",
    });
  }

  return { success: true } as const;
}

export async function pipelineTimeline(workspaceId: number, entryId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(pipelineEvents)
    .where(and(eq(pipelineEvents.workspaceId, workspaceId), eq(pipelineEvents.entryId, entryId)))
    .orderBy(desc(pipelineEvents.createdAt));
}

export async function pipelineSummary(workspaceId: number) {
  const db = await requireDb();
  const rows = await db
    .select({
      stage: pipelineEntries.stage,
      count: sql<number>`count(*)`,
      value: sql<number>`coalesce(sum(${pipelineEntries.value}), 0)`,
    })
    .from(pipelineEntries)
    .where(eq(pipelineEntries.workspaceId, workspaceId))
    .groupBy(pipelineEntries.stage);

  const byStage = Object.fromEntries(PIPELINE_STAGES.map(stage => [stage, { count: 0, value: 0 }])) as Record<
    PipelineStage,
    { count: number; value: number }
  >;
  for (const row of rows) {
    if (row.stage in byStage) byStage[row.stage as PipelineStage] = { count: Number(row.count), value: Number(row.value) };
  }

  const dueRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(pipelineEntries)
    .where(
      and(
        eq(pipelineEntries.workspaceId, workspaceId),
        sql`${pipelineEntries.nextFollowUpAt} is not null and ${pipelineEntries.nextFollowUpAt} <= now()`,
      ),
    );

  return { byStage, followUpsDue: Number(dueRows[0]?.count ?? 0) };
}

export async function listProspects(workspaceId: number, options?: { signalType?: string; minScore?: number; limit?: number }) {
  const db = await requireDb();
  const conditions = [eq(prospects.workspaceId, workspaceId)];
  if (options?.signalType) conditions.push(eq(prospects.signalType, options.signalType));
  if (options?.minScore != null) conditions.push(gte(prospects.gapScore, options.minScore));

  return db
    .select()
    .from(prospects)
    .where(and(...conditions))
    .orderBy(desc(prospects.gapScore))
    .limit(options?.limit ?? 200);
}

export async function getProspect(workspaceId: number, prospectId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.workspaceId, workspaceId), eq(prospects.id, prospectId)))
    .limit(1);
  if (rows.length === 0) throw notFound("That prospect is not in this workspace.");
  return rows[0];
}
