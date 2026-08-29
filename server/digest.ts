/**
 * Weekly market digest.
 *
 * Composes what changed across a workspace's saved searches into one email. Sending is
 * optional: without RESEND_API_KEY the digest still renders and is returned to the caller,
 * so the in-app "preview digest" works on a bare deployment.
 */
import { eq, inArray } from "drizzle-orm";
import { savedSearches, users, workspaceMembers, workspaces } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { runSavedSearch, type SavedSearchRun } from "./savedSearches";
import { requireDb } from "./workspace";

export type DigestSection = { title: string; note: string; lines: string[] };
export type Digest = { workspaceId: number; subject: string; sections: DigestSection[]; html: string; totalNew: number };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

export function renderDigestHtml(workspaceName: string, sections: DigestSection[], totalNew: number) {
  const body = sections
    .map(
      section => `
      <tr><td style="padding:26px 32px 0 32px;">
        <div style="font:600 11px/1.4 'DM Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#6d7469;">${escapeHtml(section.title)}</div>
        <div style="font:400 13px/1.6 Manrope,Helvetica,Arial,sans-serif;color:#4a5148;margin:6px 0 12px;">${escapeHtml(section.note)}</div>
        ${
          section.lines.length
            ? `<ul style="margin:0;padding:0;list-style:none;">${section.lines
                .map(
                  line =>
                    `<li style="border-top:1px solid #E7E5DE;padding:10px 0;font:400 14px/1.5 Manrope,Helvetica,Arial,sans-serif;color:#1D241F;">${escapeHtml(line)}</li>`,
                )
                .join("")}</ul>`
            : `<div style="font:400 13px/1.6 Manrope,Helvetica,Arial,sans-serif;color:#6d7469;">Nothing new this cycle.</div>`
        }
      </td></tr>`,
    )
    .join("");

  return `<!doctype html><html><body style="margin:0;background:#F7F6F1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F1;padding:28px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E7E5DE;">
        <tr><td style="padding:32px 32px 0 32px;">
          <div style="font:700 22px/1.2 'Space Grotesk',Helvetica,Arial,sans-serif;color:#1D241F;letter-spacing:-.02em;">Finder field report</div>
          <div style="font:400 13px/1.6 Manrope,Helvetica,Arial,sans-serif;color:#6d7469;margin-top:6px;">${escapeHtml(workspaceName)} · ${totalNew} new opportunit${totalNew === 1 ? "y" : "ies"}</div>
        </td></tr>
        ${body}
        <tr><td style="padding:28px 32px 32px 32px;">
          <a href="${ENV.publicBaseUrl}/app" style="display:inline-block;background:#C8FF3D;color:#1D241F;text-decoration:none;padding:12px 20px;font:600 13px/1 Manrope,Helvetica,Arial,sans-serif;">Open the research desk</a>
          <div style="font:400 11px/1.6 Manrope,Helvetica,Arial,sans-serif;color:#8a9086;margin-top:18px;">Every record links to the public source it came from. Finder does not supply private contact data.</div>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function toSection(run: SavedSearchRun): DigestSection {
  return {
    title: `${run.name} · ${run.label}`,
    note: run.sourcesConnected ? run.precisionNote : "This search needs a data source connected before it can run.",
    lines: run.newProspects
      .slice(0, 8)
      .map(prospect => `${prospect.name} — score ${prospect.score.score}/100 · ${prospect.signalSummary}`),
  };
}

export async function buildDigestForWorkspace(workspaceId: number, options?: { persist?: boolean }): Promise<Digest> {
  const db = await requireDb();
  const workspace = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const searches = await db.select().from(savedSearches).where(eq(savedSearches.workspaceId, workspaceId));

  const runs: SavedSearchRun[] = [];
  for (const search of searches) {
    try {
      runs.push(await runSavedSearch(search, { persist: options?.persist ?? false }));
    } catch (error) {
      runs.push({
        searchId: search.id,
        name: search.name,
        kind: search.kind as SavedSearchRun["kind"],
        label: search.kind,
        total: 0,
        newProspects: [],
        precisionNote: error instanceof Error ? error.message : "This search could not be run.",
        sourcesConnected: false,
      });
    }
  }

  const sections = runs.map(toSection);
  const totalNew = runs.reduce((sum, run) => sum + run.newProspects.length, 0);
  const workspaceName = workspace[0]?.name || "Your workspace";

  return {
    workspaceId,
    subject: totalNew > 0 ? `Finder: ${totalNew} new opportunit${totalNew === 1 ? "y" : "ies"}` : "Finder: no new matches this cycle",
    sections,
    totalNew,
    html: renderDigestHtml(workspaceName, sections, totalNew),
  };
}

async function recipientsFor(workspaceId: number): Promise<string[]> {
  const db = await requireDb();
  const members = await db
    .select({ userId: workspaceMembers.userId, invitedEmail: workspaceMembers.invitedEmail })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  const userIds = members.map(m => m.userId).filter((id): id is number => typeof id === "number");
  const accounts = userIds.length
    ? await db.select({ email: users.email }).from(users).where(inArray(users.id, userIds))
    : [];

  return [...new Set([...accounts.map(a => a.email), ...members.map(m => m.invitedEmail)].filter(Boolean) as string[])];
}

export async function sendDigest(digest: Digest): Promise<{ sent: boolean; recipients: string[]; reason?: string }> {
  const recipients = await recipientsFor(digest.workspaceId);
  if (recipients.length === 0) return { sent: false, recipients, reason: "No workspace members have an email address." };
  if (!ENV.resendApiKey) {
    return { sent: false, recipients, reason: "Email delivery is not configured. Set RESEND_API_KEY to send digests." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: ENV.digestFromEmail,
      to: recipients,
      subject: digest.subject,
      html: digest.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    return { sent: false, recipients, reason: `Email provider returned ${response.status}: ${detail.slice(0, 160)}` };
  }
  return { sent: true, recipients };
}

/** Entry point for the scheduled /api/cron/digest hook. */
export async function runDueDigests() {
  const db = await requireDb();
  const rows = await db.select({ workspaceId: savedSearches.workspaceId }).from(savedSearches);
  const workspaceIds = [...new Set(rows.map(row => row.workspaceId))];

  const results: { workspaceId: number; totalNew: number; sent: boolean; reason?: string }[] = [];
  for (const workspaceId of workspaceIds) {
    try {
      const digest = await buildDigestForWorkspace(workspaceId, { persist: true });
      const delivery = await sendDigest(digest);
      results.push({ workspaceId, totalNew: digest.totalNew, sent: delivery.sent, reason: delivery.reason });
    } catch (error) {
      results.push({
        workspaceId,
        totalNew: 0,
        sent: false,
        reason: error instanceof Error ? error.message : "Digest failed.",
      });
    }
  }
  return { workspaces: results.length, results };
}
