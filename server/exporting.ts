/**
 * Export and CRM sync.
 *
 * CSV is generated in-process and needs no configuration. CRM pushes use a workspace
 * integration record holding the customer's own API token, so Finder never brokers data
 * between accounts.
 */
import { eq, and } from "drizzle-orm";
import { integrations, type Prospect } from "../drizzle/schema";
import { badRequest, failedPrecondition } from "./_core/errors";
import { requireDb } from "./workspace";

export const EXPORT_COLUMNS = [
  "name",
  "category",
  "country",
  "city",
  "address",
  "phone",
  "website",
  "listingUrl",
  "rating",
  "reviewCount",
  "signalType",
  "signalSummary",
  "gapScore",
  "dealBand",
  "dealLow",
  "dealHigh",
  "source",
  "sourceUrl",
  "observedAt",
] as const;

/**
 * Prefixing a leading =, +, - or @ neutralises spreadsheet formula injection when the
 * exported file is opened in Excel or Sheets.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: Prospect[]): string {
  const header = EXPORT_COLUMNS.join(",");
  const body = rows
    .map(row => EXPORT_COLUMNS.map(column => csvCell((row as unknown as Record<string, unknown>)[column])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

export const INTEGRATION_KINDS = ["hubspot", "airtable", "sheets_csv"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export async function listIntegrations(workspaceId: number) {
  const db = await requireDb();
  const rows = await db.select().from(integrations).where(eq(integrations.workspaceId, workspaceId));
  // Never return the stored token to the browser.
  return rows.map(row => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    active: row.active,
    lastSyncedAt: row.lastSyncedAt,
    configured: Boolean(row.config && Object.keys(row.config).length > 0),
  }));
}

export async function saveIntegration(params: {
  workspaceId: number;
  kind: IntegrationKind;
  label?: string;
  config: Record<string, unknown>;
}) {
  const db = await requireDb();
  await db
    .insert(integrations)
    .values({
      workspaceId: params.workspaceId,
      kind: params.kind,
      label: params.label ?? null,
      config: params.config,
      active: true,
    })
    .onDuplicateKeyUpdate({ set: { label: params.label ?? null, config: params.config, active: true } });
  return { success: true } as const;
}

export async function removeIntegration(workspaceId: number, kind: IntegrationKind) {
  const db = await requireDb();
  await db.delete(integrations).where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, kind)));
  return { success: true } as const;
}

async function loadConfig(workspaceId: number, kind: IntegrationKind) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, kind)))
    .limit(1);
  const config = rows[0]?.config;
  if (!config) {
    throw failedPrecondition(`Connect ${kind} in Settings before syncing to it.`);
  }
  return config as Record<string, string>;
}

async function pushToHubspot(workspaceId: number, rows: Prospect[]) {
  const config = await loadConfig(workspaceId, "hubspot");
  const token = config.accessToken;
  if (!token) throw badRequest("The HubSpot connection is missing its private app token.");

  let created = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const response = await fetch("https://api.hubapi.com/crm/v3/objects/companies", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: {
          name: row.name,
          domain: row.website ? row.website.replace(/^https?:\/\//i, "").split("/")[0] : undefined,
          phone: row.phone ?? undefined,
          city: row.city ?? undefined,
          country: row.country ?? undefined,
          industry: row.category ?? undefined,
          description: row.signalSummary ?? undefined,
        },
      }),
    });
    if (response.ok) created += 1;
    else failures.push(`${row.name}: HTTP ${response.status}`);
  }

  await markSynced(workspaceId, "hubspot");
  return { created, failures };
}

async function pushToAirtable(workspaceId: number, rows: Prospect[]) {
  const config = await loadConfig(workspaceId, "airtable");
  const { apiKey, baseId, tableName } = config;
  if (!apiKey || !baseId || !tableName) {
    throw badRequest("The Airtable connection needs an API key, base id and table name.");
  }

  let created = 0;
  const failures: string[] = [];

  // Airtable accepts at most 10 records per request.
  for (let index = 0; index < rows.length; index += 10) {
    const batch = rows.slice(index, index + 10);
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        records: batch.map(row => ({
          fields: {
            Name: row.name,
            Category: row.category ?? "",
            Country: row.country ?? "",
            Phone: row.phone ?? "",
            Website: row.website ?? "",
            Listing: row.listingUrl ?? "",
            Signal: row.signalSummary ?? "",
            Score: row.gapScore ?? 0,
            Source: row.source,
          },
        })),
        typecast: true,
      }),
    });
    if (response.ok) created += batch.length;
    else failures.push(`Batch ${index / 10 + 1}: HTTP ${response.status}`);
  }

  await markSynced(workspaceId, "airtable");
  return { created, failures };
}

async function markSynced(workspaceId: number, kind: IntegrationKind) {
  const db = await requireDb();
  await db
    .update(integrations)
    .set({ lastSyncedAt: new Date() })
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.kind, kind)));
}

export async function syncProspects(workspaceId: number, kind: IntegrationKind, rows: Prospect[]) {
  if (rows.length === 0) return { created: 0, failures: [] as string[] };
  if (kind === "hubspot") return pushToHubspot(workspaceId, rows);
  if (kind === "airtable") return pushToAirtable(workspaceId, rows);
  throw badRequest("Google Sheets is served through the CSV export.");
}
