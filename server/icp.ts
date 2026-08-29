/**
 * Ideal customer profiles. Defined once per workspace, then applied to every finder so the
 * ranking reflects the agency's own business rather than a generic notion of a good lead.
 */
import { and, desc, eq } from "drizzle-orm";
import { icpProfiles, type IcpProfile } from "../drizzle/schema";
import { notFound } from "./_core/errors";
import type { IcpCriteria } from "./scoring";
import { requireDb } from "./workspace";

export async function listIcpProfiles(workspaceId: number) {
  const db = await requireDb();
  return db
    .select()
    .from(icpProfiles)
    .where(eq(icpProfiles.workspaceId, workspaceId))
    .orderBy(desc(icpProfiles.isDefault), desc(icpProfiles.updatedAt));
}

export async function getDefaultIcp(workspaceId: number): Promise<IcpCriteria | null> {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(icpProfiles)
    .where(and(eq(icpProfiles.workspaceId, workspaceId), eq(icpProfiles.isDefault, true)))
    .limit(1);
  return rows[0] ? toCriteria(rows[0]) : null;
}

export function toCriteria(profile: IcpProfile): IcpCriteria {
  return {
    industries: profile.industries ?? null,
    regions: profile.regions ?? null,
    countries: profile.countries ?? null,
    minGapScore: profile.minGapScore ?? null,
    minRating: profile.minRating != null ? Number(profile.minRating) : null,
    minReviewCount: profile.minReviewCount ?? null,
  };
}

export type IcpInput = {
  name: string;
  industries?: string[];
  regions?: string[];
  countries?: string[];
  minGapScore?: number;
  minRating?: number;
  minReviewCount?: number;
  budgetBand?: string;
  isDefault?: boolean;
};

async function clearDefaults(workspaceId: number) {
  const db = await requireDb();
  await db.update(icpProfiles).set({ isDefault: false }).where(eq(icpProfiles.workspaceId, workspaceId));
}

export async function createIcpProfile(workspaceId: number, input: IcpInput) {
  const db = await requireDb();
  if (input.isDefault) await clearDefaults(workspaceId);
  await db.insert(icpProfiles).values({
    workspaceId,
    name: input.name,
    industries: input.industries ?? [],
    regions: input.regions ?? [],
    countries: input.countries ?? [],
    minGapScore: input.minGapScore ?? 0,
    minRating: input.minRating != null ? String(input.minRating) : null,
    minReviewCount: input.minReviewCount ?? null,
    budgetBand: input.budgetBand ?? null,
    isDefault: input.isDefault ?? false,
  });
  const rows = await listIcpProfiles(workspaceId);
  return rows[0];
}

export async function updateIcpProfile(workspaceId: number, id: number, input: Partial<IcpInput>) {
  const db = await requireDb();
  const existing = await db
    .select()
    .from(icpProfiles)
    .where(and(eq(icpProfiles.id, id), eq(icpProfiles.workspaceId, workspaceId)))
    .limit(1);
  if (existing.length === 0) throw notFound("That profile does not exist in this workspace.");

  if (input.isDefault) await clearDefaults(workspaceId);

  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.industries !== undefined) changes.industries = input.industries;
  if (input.regions !== undefined) changes.regions = input.regions;
  if (input.countries !== undefined) changes.countries = input.countries;
  if (input.minGapScore !== undefined) changes.minGapScore = input.minGapScore;
  if (input.minRating !== undefined) changes.minRating = input.minRating != null ? String(input.minRating) : null;
  if (input.minReviewCount !== undefined) changes.minReviewCount = input.minReviewCount;
  if (input.budgetBand !== undefined) changes.budgetBand = input.budgetBand;
  if (input.isDefault !== undefined) changes.isDefault = input.isDefault;

  if (Object.keys(changes).length > 0) {
    await db.update(icpProfiles).set(changes).where(eq(icpProfiles.id, id));
  }
  return { success: true } as const;
}

export async function deleteIcpProfile(workspaceId: number, id: number) {
  const db = await requireDb();
  await db.delete(icpProfiles).where(and(eq(icpProfiles.id, id), eq(icpProfiles.workspaceId, workspaceId)));
  return { success: true } as const;
}
