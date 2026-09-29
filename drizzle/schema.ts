import { boolean, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const jobType = pgEnum("job_type", ["Remote", "Full-time", "Part-time", "Contract", "Hybrid"]);
export const trackingStatus = pgEnum("tracking_status", ["Wishlist", "Applied", "Interviewing", "Offered", "Rejected"]);

export const users = pgTable("users", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  title: varchar("title", { length: 240 }).notNull(),
  companyName: varchar("companyName", { length: 240 }).notNull(),
  location: varchar("location", { length: 240 }).notNull(),
  jobType: jobType("jobType").notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  salaryRange: varchar("salaryRange", { length: 120 }),
  description: text("description").notNull(),
  requirements: text("requirements").notNull(),
  applicationContact: varchar("applicationContact", { length: 320 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
});

export const applicationTracking = pgTable("application_tracking", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  jobId: integer("jobId").notNull(),
  status: trackingStatus("status").default("Wishlist").notNull(),
  notes: text("notes"),
  appliedDate: timestamp("appliedDate", { withTimezone: true }),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  jobIdUnique: uniqueIndex("application_tracking_job_id_unique").on(table.jobId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;
export type ApplicationTracking = typeof applicationTracking.$inferSelect;
export type InsertApplicationTracking = typeof applicationTracking.$inferInsert;
