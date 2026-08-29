/**
 * Finder database schema.
 *
 * Design rules that the whole product depends on:
 *  - Every prospect row records where it came from (`source`, `sourceUrl`, `observedAt`)
 *    so a user can always audit a claim back to a public record.
 *  - Nothing that could be a private personal detail is stored here. Contact columns
 *    hold publicly listed business contact points only.
 *  - Scores are stored alongside the factors that produced them, never as a bare number.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  decimal,
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/* ---------------------------------------------------------------- identity */

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("open_id", { length: 191 }).notNull(),
    name: varchar("name", { length: 191 }),
    email: varchar("email", { length: 191 }),
    loginMethod: varchar("login_method", { length: 64 }),
    role: varchar("role", { length: 32 }).default("user").notNull(),
    lastSignedIn: timestamp("last_signed_in"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  table => ({
    openIdIdx: uniqueIndex("users_open_id_idx").on(table.openId),
  }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* -------------------------------------------- workspaces, seats, assignment */

export const workspaces = mysqlTable(
  "workspaces",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    ownerUserId: int("owner_user_id").notNull(),
    plan: varchar("plan", { length: 32 }).default("starter").notNull(),
    seatLimit: int("seat_limit").default(3).notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  table => ({ ownerIdx: index("workspaces_owner_idx").on(table.ownerUserId) }),
);

export const workspaceMembers = mysqlTable(
  "workspace_members",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    userId: int("user_id"),
    invitedEmail: varchar("invited_email", { length: 191 }),
    role: varchar("role", { length: 32 }).default("member").notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({
    workspaceIdx: index("workspace_members_workspace_idx").on(table.workspaceId),
    userIdx: index("workspace_members_user_idx").on(table.userId),
  }),
);

export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;

/* ------------------------------------------------------------ ICP profiles */

export const icpProfiles = mysqlTable(
  "icp_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    industries: json("industries").$type<string[]>(),
    regions: json("regions").$type<string[]>(),
    countries: json("countries").$type<string[]>(),
    minGapScore: int("min_gap_score").default(0).notNull(),
    minRating: decimal("min_rating", { precision: 3, scale: 2 }),
    minReviewCount: int("min_review_count"),
    budgetBand: varchar("budget_band", { length: 32 }),
    weights: json("weights").$type<Record<string, number>>(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  table => ({ workspaceIdx: index("icp_profiles_workspace_idx").on(table.workspaceId) }),
);

export type IcpProfile = typeof icpProfiles.$inferSelect;
export type InsertIcpProfile = typeof icpProfiles.$inferInsert;

/* ---------------------------------------------------------------- prospects */

export const prospects = mysqlTable(
  "prospects",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    /** Stable key derived from name + locality, used for cross-source dedupe. */
    dedupeKey: varchar("dedupe_key", { length: 191 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 128 }),
    region: varchar("region", { length: 64 }),
    country: varchar("country", { length: 128 }),
    city: varchar("city", { length: 128 }),
    address: varchar("address", { length: 512 }),
    /** Publicly listed business contact points only. */
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 191 }),
    website: varchar("website", { length: 512 }),
    listingUrl: varchar("listing_url", { length: 512 }),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    rating: decimal("rating", { precision: 3, scale: 2 }),
    reviewCount: int("review_count"),
    reviewVelocity: decimal("review_velocity", { precision: 8, scale: 2 }),
    employeeBand: varchar("employee_band", { length: 32 }),
    /** Which finder surfaced it: no_website | decaying_site | rising | hiring | expansion | ad_spend | partnership */
    signalType: varchar("signal_type", { length: 48 }).notNull(),
    signalSummary: varchar("signal_summary", { length: 512 }),
    gapScore: int("gap_score"),
    gapFactors: json("gap_factors").$type<unknown>(),
    icpScore: int("icp_score"),
    dealBand: varchar("deal_band", { length: 32 }),
    dealLow: int("deal_low"),
    dealHigh: int("deal_high"),
    dealCurrency: varchar("deal_currency", { length: 8 }).default("USD"),
    source: varchar("source", { length: 96 }).notNull(),
    sourceUrl: varchar("source_url", { length: 512 }),
    observedAt: timestamp("observed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    raw: json("raw").$type<unknown>(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  table => ({
    workspaceIdx: index("prospects_workspace_idx").on(table.workspaceId),
    dedupeIdx: uniqueIndex("prospects_dedupe_idx").on(table.workspaceId, table.dedupeKey),
    signalIdx: index("prospects_signal_idx").on(table.signalType),
    scoreIdx: index("prospects_score_idx").on(table.gapScore),
  }),
);

export type Prospect = typeof prospects.$inferSelect;
export type InsertProspect = typeof prospects.$inferInsert;

/* ----------------------------------------------------------- web gap audits */

export const webAudits = mysqlTable(
  "web_audits",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    prospectId: int("prospect_id"),
    url: varchar("url", { length: 512 }).notNull(),
    reachable: boolean("reachable").default(false).notNull(),
    httpStatus: int("http_status"),
    responseMs: int("response_ms"),
    checks: json("checks").$type<unknown>(),
    decayScore: int("decay_score"),
    verdict: varchar("verdict", { length: 48 }),
    fetchedAt: timestamp("fetched_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({
    workspaceIdx: index("web_audits_workspace_idx").on(table.workspaceId),
    urlIdx: index("web_audits_url_idx").on(table.url),
  }),
);

export type WebAudit = typeof webAudits.$inferSelect;

/* ------------------------------------------------------------- pipeline/CRM */

export const pipelineEntries = mysqlTable(
  "pipeline_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    prospectId: int("prospect_id").notNull(),
    stage: varchar("stage", { length: 32 }).default("new").notNull(),
    assignedUserId: int("assigned_user_id"),
    value: int("value"),
    currency: varchar("currency", { length: 8 }).default("USD"),
    nextFollowUpAt: timestamp("next_follow_up_at"),
    notes: text("notes"),
    lostReason: varchar("lost_reason", { length: 191 }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  table => ({
    workspaceIdx: index("pipeline_workspace_idx").on(table.workspaceId),
    prospectIdx: uniqueIndex("pipeline_prospect_idx").on(table.workspaceId, table.prospectId),
    stageIdx: index("pipeline_stage_idx").on(table.stage),
    assigneeIdx: index("pipeline_assignee_idx").on(table.assignedUserId),
  }),
);

export const pipelineEvents = mysqlTable(
  "pipeline_events",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    entryId: int("entry_id").notNull(),
    userId: int("user_id"),
    kind: varchar("kind", { length: 48 }).notNull(),
    detail: varchar("detail", { length: 512 }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({ entryIdx: index("pipeline_events_entry_idx").on(table.entryId) }),
);

export type PipelineEntry = typeof pipelineEntries.$inferSelect;
export type PipelineEvent = typeof pipelineEvents.$inferSelect;

/* ------------------------------------------- saved searches and monitoring */

export const savedSearches = mysqlTable(
  "saved_searches",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    userId: int("user_id").notNull(),
    name: varchar("name", { length: 191 }).notNull(),
    /** which finder this watches */
    kind: varchar("kind", { length: 48 }).notNull(),
    params: json("params").$type<Record<string, unknown>>().notNull(),
    alertsEnabled: boolean("alerts_enabled").default(true).notNull(),
    cadence: varchar("cadence", { length: 24 }).default("weekly").notNull(),
    lastRunAt: timestamp("last_run_at"),
    lastSeenKeys: json("last_seen_keys").$type<string[]>(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).onUpdateNow().notNull(),
  },
  table => ({
    workspaceIdx: index("saved_searches_workspace_idx").on(table.workspaceId),
    cadenceIdx: index("saved_searches_cadence_idx").on(table.cadence, table.alertsEnabled),
  }),
);

export const searchAlerts = mysqlTable(
  "search_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    savedSearchId: int("saved_search_id").notNull(),
    dedupeKey: varchar("dedupe_key", { length: 191 }).notNull(),
    headline: varchar("headline", { length: 512 }).notNull(),
    changeType: varchar("change_type", { length: 48 }).notNull(),
    payload: json("payload").$type<unknown>(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({
    searchIdx: index("search_alerts_search_idx").on(table.savedSearchId),
    workspaceIdx: index("search_alerts_workspace_idx").on(table.workspaceId, table.createdAt),
  }),
);

export type SavedSearch = typeof savedSearches.$inferSelect;
export type SearchAlert = typeof searchAlerts.$inferSelect;

/* ------------------------------------------ territory + contact suppression */

export const territoryClaims = mysqlTable(
  "territory_claims",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    userId: int("user_id").notNull(),
    scopeKey: varchar("scope_key", { length: 191 }).notNull(),
    label: varchar("label", { length: 191 }).notNull(),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({
    scopeIdx: uniqueIndex("territory_scope_idx").on(table.workspaceId, table.scopeKey),
  }),
);

export const suppressions = mysqlTable(
  "suppressions",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    matchKey: varchar("match_key", { length: 191 }).notNull(),
    kind: varchar("kind", { length: 32 }).default("contacted").notNull(),
    reason: varchar("reason", { length: 512 }),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({
    matchIdx: uniqueIndex("suppressions_match_idx").on(table.workspaceId, table.matchKey),
  }),
);

export type TerritoryClaim = typeof territoryClaims.$inferSelect;
export type Suppression = typeof suppressions.$inferSelect;

/* ------------------------------------------------ proposals and previews */

export const proposals = mysqlTable(
  "proposals",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    prospectId: int("prospect_id"),
    title: varchar("title", { length: 255 }).notNull(),
    prospectName: varchar("prospect_name", { length: 255 }).notNull(),
    findings: json("findings").$type<unknown>(),
    scope: json("scope").$type<unknown>(),
    priceLow: int("price_low"),
    priceHigh: int("price_high"),
    currency: varchar("currency", { length: 8 }).default("USD"),
    html: text("html"),
    createdByUserId: int("created_by_user_id"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({ workspaceIdx: index("proposals_workspace_idx").on(table.workspaceId) }),
);

export const mockups = mysqlTable(
  "mockups",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    prospectId: int("prospect_id"),
    prospectName: varchar("prospect_name", { length: 255 }).notNull(),
    spec: json("spec").$type<unknown>(),
    html: text("html"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({ workspaceIdx: index("mockups_workspace_idx").on(table.workspaceId) }),
);

export type Proposal = typeof proposals.$inferSelect;
export type Mockup = typeof mockups.$inferSelect;

/* ------------------------------------------------------------- integrations */

export const integrations = mysqlTable(
  "integrations",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    kind: varchar("kind", { length: 48 }).notNull(),
    label: varchar("label", { length: 191 }),
    config: json("config").$type<Record<string, unknown>>(),
    active: boolean("active").default(true).notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({
    workspaceKindIdx: uniqueIndex("integrations_workspace_kind_idx").on(table.workspaceId, table.kind),
  }),
);

export type Integration = typeof integrations.$inferSelect;

/* --------------------------------------------------------------- relations */

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  prospects: many(prospects),
}));

export const prospectRelations = relations(prospects, ({ many }) => ({
  audits: many(webAudits),
  pipeline: many(pipelineEntries),
}));

/* -------------------------------------------- observation history (momentum) */

/**
 * Point-in-time snapshots of a prospect's public metrics. Review momentum cannot be
 * bought from a listings API, so Finder derives it by observing the same business over
 * time. Two snapshots are required before any velocity figure is shown.
 */
export const prospectSnapshots = mysqlTable(
  "prospect_snapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspace_id").notNull(),
    dedupeKey: varchar("dedupe_key", { length: 191 }).notNull(),
    reviewCount: int("review_count"),
    rating: decimal("rating", { precision: 3, scale: 2 }),
    hasWebsite: boolean("has_website"),
    decayScore: int("decay_score"),
    observedAt: timestamp("observed_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  },
  table => ({
    keyIdx: index("prospect_snapshots_key_idx").on(table.workspaceId, table.dedupeKey, table.observedAt),
  }),
);

export type ProspectSnapshot = typeof prospectSnapshots.$inferSelect;
