/**
 * Workspaces, seats and assignment.
 *
 * Every signed-in user belongs to exactly one workspace by default — created on first use —
 * so single-operator agencies never see team plumbing, while a growing team can invite
 * colleagues without a migration.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { failedPrecondition, forbidden, notFound } from "./_core/errors";
import { users, workspaceMembers, workspaces, type Workspace } from "../drizzle/schema";
import type { User } from "../drizzle/schema";

export const DB_REQUIRED_MESSAGE =
  "This feature stores your work, so it needs a database. Set DATABASE_URL and run `pnpm db:push`.";

export async function requireDb() {
  const db = await getDb();
  if (!db) throw failedPrecondition(DB_REQUIRED_MESSAGE);
  return db;
}

export async function getOrCreateWorkspace(user: User): Promise<Workspace> {
  const db = await requireDb();

  const membership = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.status, "active")))
    .limit(1);

  if (membership.length > 0) {
    const found = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, membership[0].workspaceId))
      .limit(1);
    if (found.length > 0) return found[0];
  }

  const name = user.name ? `${user.name}'s workspace` : "My workspace";
  await db.insert(workspaces).values({ name, ownerUserId: user.id });
  const created = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.ownerUserId, user.id))
    .orderBy(workspaces.id)
    .limit(1);
  const workspace = created[created.length - 1];
  if (!workspace) throw failedPrecondition("The workspace could not be created.");

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: "owner",
    status: "active",
  });

  return workspace;
}

export async function requireMembership(user: User, workspaceId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
    .limit(1);
  if (rows.length === 0) throw forbidden();
  return rows[0];
}

export async function listMembers(workspaceId: number) {
  const db = await requireDb();
  const rows = await db
    .select({
      id: workspaceMembers.id,
      role: workspaceMembers.role,
      status: workspaceMembers.status,
      invitedEmail: workspaceMembers.invitedEmail,
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      createdAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  return rows;
}

export async function inviteMember(params: {
  actor: User;
  workspaceId: number;
  email: string;
  role: "admin" | "member";
}) {
  const db = await requireDb();
  const membership = await requireMembership(params.actor, params.workspaceId);
  if (membership.role !== "owner" && membership.role !== "admin") throw forbidden();

  const workspace = await db.select().from(workspaces).where(eq(workspaces.id, params.workspaceId)).limit(1);
  if (workspace.length === 0) throw notFound("Workspace not found.");

  const current = await listMembers(params.workspaceId);
  if (current.length >= workspace[0].seatLimit) {
    throw failedPrecondition(
      `This workspace is using all ${workspace[0].seatLimit} seats. Remove a member or raise the seat limit first.`,
    );
  }

  const normalizedEmail = params.email.trim().toLowerCase();
  if (current.some(member => (member.email || member.invitedEmail || "").toLowerCase() === normalizedEmail)) {
    throw failedPrecondition("That person is already on this workspace.");
  }

  const existingUser = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  await db.insert(workspaceMembers).values({
    workspaceId: params.workspaceId,
    userId: existingUser[0]?.id ?? null,
    invitedEmail: normalizedEmail,
    role: params.role,
    status: existingUser[0] ? "active" : "invited",
  });

  return {
    invited: normalizedEmail,
    status: existingUser[0] ? ("active" as const) : ("invited" as const),
    note: existingUser[0]
      ? "They already have a Finder account and now have access."
      : "They will join this workspace the first time they sign in with this email address.",
  };
}

export async function removeMember(params: { actor: User; workspaceId: number; memberId: number }) {
  const db = await requireDb();
  const membership = await requireMembership(params.actor, params.workspaceId);
  if (membership.role !== "owner" && membership.role !== "admin") throw forbidden();

  const target = await db.select().from(workspaceMembers).where(eq(workspaceMembers.id, params.memberId)).limit(1);
  if (target.length === 0) throw notFound("That member is not on this workspace.");
  if (target[0].role === "owner") throw failedPrecondition("The workspace owner cannot be removed.");

  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, params.memberId));
  return { success: true } as const;
}

export async function updateSeatLimit(params: { actor: User; workspaceId: number; seatLimit: number }) {
  const db = await requireDb();
  const membership = await requireMembership(params.actor, params.workspaceId);
  if (membership.role !== "owner") throw forbidden();
  await db.update(workspaces).set({ seatLimit: params.seatLimit }).where(eq(workspaces.id, params.workspaceId));
  return { seatLimit: params.seatLimit };
}

/** Links a pending email invitation to the account that just signed in with that address. */
export async function claimPendingInvites(user: User) {
  if (!user.email) return;
  const db = await getDb();
  if (!db) return;
  await db
    .update(workspaceMembers)
    .set({ userId: user.id, status: "active" })
    .where(and(eq(workspaceMembers.invitedEmail, user.email.toLowerCase()), eq(workspaceMembers.status, "invited")));
}
