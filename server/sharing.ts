/**
 * Proposal sharing, read-tracking and acceptance.
 *
 * A sent proposal used to disappear. This gives it a public unguessable link, records how it was
 * actually read, and puts an accept button and a booking link at the end of it — so the agency
 * knows when to call, and the client has one thing to click instead of a decision to make.
 *
 * Privacy: no raw IP address is ever stored. A viewer is identified by a salted hash of coarse
 * request attributes, which is enough to tell a repeat read from a first read and nothing more.
 * The recipient is told the document reports when it was opened.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { proposalShares, proposalViews, type ProposalShare } from "../drizzle/schema";
import { badRequest, notFound } from "./_core/errors";
import { ENV } from "./_core/env";
import { requireDb } from "./workspace";

/** Sections the tracker reports on. Order matters: it is the reading order of the document. */
export const TRACKED_SECTIONS = ["summary", "score", "findings", "scope", "investment", "next"] as const;
export type TrackedSection = (typeof TRACKED_SECTIONS)[number];

export function generateToken(): string {
  // 32 hex chars from 16 random bytes: unguessable, and short enough to paste in an email.
  return randomBytes(16).toString("hex");
}

/**
 * Stable per-viewer key with no personal data retained. The salt means the hash cannot be
 * reversed against a candidate IP list even if the database leaks.
 */
export function viewerKeyFor(ip: string | undefined, userAgent: string | undefined): string {
  const salt = ENV.jwtSecret || "finder-view-salt";
  return createHash("sha256").update(`${salt}|${ip ?? "unknown"}|${userAgent ?? "unknown"}`).digest("hex").slice(0, 32);
}

/* ------------------------------------------------------------------ writes */

export async function createShare(params: {
  workspaceId: number;
  proposalId: number;
  bookingUrl?: string;
  tiers?: unknown;
}): Promise<ProposalShare> {
  const db = await requireDb();
  const token = generateToken();

  await db.insert(proposalShares).values({
    workspaceId: params.workspaceId,
    proposalId: params.proposalId,
    token,
    bookingUrl: params.bookingUrl ?? null,
    tiers: params.tiers ?? null,
  });

  const rows = await db.select().from(proposalShares).where(eq(proposalShares.token, token)).limit(1);
  if (rows.length === 0) throw badRequest("The share link could not be created.");
  return rows[0];
}

export async function getShareByToken(token: string): Promise<ProposalShare> {
  const db = await requireDb();
  const rows = await db.select().from(proposalShares).where(eq(proposalShares.token, token)).limit(1);
  if (rows.length === 0) throw notFound("That link is not valid.");
  if (rows[0].revokedAt) throw notFound("That link has been withdrawn.");
  return rows[0];
}

/**
 * Records or extends one reading session. Called repeatedly by the page beacon, so it upserts
 * against the viewer key rather than creating a row per ping.
 */
export async function recordView(params: {
  token: string;
  viewerKey: string;
  totalMs: number;
  sectionMs: Record<string, number>;
  referrer?: string;
}) {
  const db = await requireDb();
  const share = await getShareByToken(params.token);

  const existing = await db
    .select()
    .from(proposalViews)
    .where(and(eq(proposalViews.shareId, share.id), eq(proposalViews.viewerKey, params.viewerKey)))
    .orderBy(desc(proposalViews.startedAt))
    .limit(1);

  const reachedPricing = (params.sectionMs.investment ?? 0) > 0;
  const cleanSections = Object.fromEntries(
    Object.entries(params.sectionMs)
      .filter(([key]) => (TRACKED_SECTIONS as readonly string[]).includes(key))
      .map(([key, value]) => [key, Math.max(0, Math.min(Number(value) || 0, 3_600_000))]),
  );
  const totalMs = Math.max(0, Math.min(params.totalMs, 3_600_000));

  // A gap of more than 30 minutes is a new reading session, not a continuation of the old one.
  const isContinuation =
    existing.length > 0 && Date.now() - existing[0].lastSeenAt.getTime() < 30 * 60 * 1000;

  if (isContinuation) {
    await db
      .update(proposalViews)
      .set({
        totalMs: Math.max(existing[0].totalMs, totalMs),
        sectionMs: cleanSections,
        reachedPricing: existing[0].reachedPricing || reachedPricing,
      })
      .where(eq(proposalViews.id, existing[0].id));
  } else {
    await db.insert(proposalViews).values({
      shareId: share.id,
      viewerKey: params.viewerKey,
      totalMs,
      sectionMs: cleanSections,
      reachedPricing,
      referrer: params.referrer?.slice(0, 400) ?? null,
    });
  }

  if (share.status === "sent") {
    await db.update(proposalShares).set({ status: "opened" }).where(eq(proposalShares.id, share.id));
  }

  return { recorded: true } as const;
}

export async function acceptShare(params: {
  token: string;
  tier?: string;
  name?: string;
  email?: string;
}) {
  const db = await requireDb();
  const share = await getShareByToken(params.token);
  if (share.status === "accepted") return { alreadyAccepted: true, share };

  await db
    .update(proposalShares)
    .set({
      status: "accepted",
      acceptedTier: params.tier ?? null,
      acceptedName: params.name?.slice(0, 190) ?? null,
      acceptedEmail: params.email?.slice(0, 190) ?? null,
      acceptedAt: new Date(),
    })
    .where(eq(proposalShares.id, share.id));

  return { alreadyAccepted: false, share };
}

export async function declineShare(token: string, reason?: string) {
  const db = await requireDb();
  const share = await getShareByToken(token);
  await db
    .update(proposalShares)
    .set({ status: "declined", declinedReason: reason?.slice(0, 400) ?? null })
    .where(eq(proposalShares.id, share.id));
  return { success: true } as const;
}

export async function revokeShare(workspaceId: number, shareId: number) {
  const db = await requireDb();
  await db
    .update(proposalShares)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(proposalShares.id, shareId), eq(proposalShares.workspaceId, workspaceId)));
  return { success: true } as const;
}

/* ------------------------------------------------------------------- reads */

export type ShareActivity = {
  share: ProposalShare;
  shareUrl: string;
  opens: number;
  uniqueViewers: number;
  totalMs: number;
  reachedPricing: boolean;
  lastSeenAt: Date | null;
  sectionMs: Record<string, number>;
  /** The one-line read of what the activity means for the next action. */
  signal: string;
  signalStrength: "hot" | "warm" | "cold" | "none";
};

export function interpretActivity(params: {
  opens: number;
  totalMs: number;
  reachedPricing: boolean;
  status: string;
}): { signal: string; signalStrength: ShareActivity["signalStrength"] } {
  if (params.status === "accepted") {
    return { signal: "Accepted. Send the start date and the invoice.", signalStrength: "hot" };
  }
  if (params.status === "declined") {
    return { signal: "Declined. Ask what was missing — it is the cheapest research you will get.", signalStrength: "cold" };
  }
  if (params.opens === 0) {
    return { signal: "Not opened yet. Give it two days, then follow up on the same thread.", signalStrength: "none" };
  }

  const minutes = params.totalMs / 60_000;
  if (params.opens >= 3 && params.reachedPricing) {
    return {
      signal: "Opened repeatedly and read the pricing. Call today — this is the strongest buying signal the document can produce.",
      signalStrength: "hot",
    };
  }
  if (params.reachedPricing && minutes >= 2) {
    return { signal: "Spent real time on the investment section. Call within 24 hours.", signalStrength: "hot" };
  }
  if (params.opens >= 2) {
    return { signal: "Opened more than once but has not reached pricing. Worth a short nudge.", signalStrength: "warm" };
  }
  if (minutes < 0.5) {
    return { signal: "Opened briefly and left. Likely skimmed on a phone — try a call rather than another email.", signalStrength: "cold" };
  }
  return { signal: "Opened and read. Follow up in a couple of days.", signalStrength: "warm" };
}

export function shareUrlFor(token: string) {
  return `${ENV.publicBaseUrl.replace(/\/+$/, "")}/p/${token}`;
}

export async function shareActivity(workspaceId: number, proposalId: number): Promise<ShareActivity[]> {
  const db = await requireDb();
  const shares = await db
    .select()
    .from(proposalShares)
    .where(and(eq(proposalShares.workspaceId, workspaceId), eq(proposalShares.proposalId, proposalId)))
    .orderBy(desc(proposalShares.createdAt));

  const activity: ShareActivity[] = [];
  for (const share of shares) {
    const views = await db.select().from(proposalViews).where(eq(proposalViews.shareId, share.id));

    const totalMs = views.reduce((sum, view) => sum + view.totalMs, 0);
    const reachedPricing = views.some(view => view.reachedPricing);
    const uniqueViewers = new Set(views.map(view => view.viewerKey)).size;
    const lastSeenAt = views.reduce<Date | null>(
      (latest, view) => (!latest || view.lastSeenAt > latest ? view.lastSeenAt : latest),
      null,
    );

    const sectionMs: Record<string, number> = {};
    for (const view of views) {
      for (const [section, ms] of Object.entries(view.sectionMs ?? {})) {
        sectionMs[section] = (sectionMs[section] ?? 0) + ms;
      }
    }

    activity.push({
      share,
      shareUrl: shareUrlFor(share.token),
      opens: views.length,
      uniqueViewers,
      totalMs,
      reachedPricing,
      lastSeenAt,
      sectionMs,
      ...interpretActivity({ opens: views.length, totalMs, reachedPricing, status: share.status }),
    });
  }

  return activity;
}

/** Shares across the workspace that warrant a call today, most urgent first. */
export async function hotShares(workspaceId: number) {
  const db = await requireDb();
  const rows = await db
    .select({
      share: proposalShares,
      opens: sql<number>`count(${proposalViews.id})`,
      totalMs: sql<number>`coalesce(sum(${proposalViews.totalMs}), 0)`,
      reachedPricing: sql<number>`coalesce(max(${proposalViews.reachedPricing}), 0)`,
      lastSeenAt: sql<Date | null>`max(${proposalViews.lastSeenAt})`,
    })
    .from(proposalShares)
    .leftJoin(proposalViews, eq(proposalViews.shareId, proposalShares.id))
    .where(and(eq(proposalShares.workspaceId, workspaceId), sql`${proposalShares.revokedAt} is null`))
    .groupBy(proposalShares.id)
    .orderBy(desc(sql`max(${proposalViews.lastSeenAt})`))
    .limit(50);

  return rows
    .map(row => ({
      share: row.share,
      shareUrl: shareUrlFor(row.share.token),
      opens: Number(row.opens),
      totalMs: Number(row.totalMs),
      reachedPricing: Number(row.reachedPricing) > 0,
      lastSeenAt: row.lastSeenAt,
      ...interpretActivity({
        opens: Number(row.opens),
        totalMs: Number(row.totalMs),
        reachedPricing: Number(row.reachedPricing) > 0,
        status: row.share.status,
      }),
    }))
    .sort((a, b) => {
      const rank = { hot: 3, warm: 2, cold: 1, none: 0 } as const;
      return rank[b.signalStrength] - rank[a.signalStrength];
    });
}
