import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 240 }).notNull(),
  companyName: varchar("companyName", { length: 240 }).notNull(),
  location: varchar("location", { length: 240 }).notNull(),
  jobType: mysqlEnum("jobType", ["Remote", "Full-time", "Part-time", "Contract", "Hybrid"]).notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  salaryRange: varchar("salaryRange", { length: 120 }),
  description: text("description").notNull(),
  requirements: text("requirements").notNull(),
  applicationContact: varchar("applicationContact", { length: 320 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  isActive: boolean("isActive").default(true).notNull(),
});

export const applicationTracking = mysqlTable("application_tracking", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  status: mysqlEnum("status", ["Wishlist", "Applied", "Interviewing", "Offered", "Rejected"]).default("Wishlist").notNull(),
  notes: text("notes"),
  appliedDate: timestamp("appliedDate"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  jobIdUnique: uniqueIndex("application_tracking_job_id_unique").on(table.jobId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type InsertJob = typeof jobs.$inferInsert;
export type ApplicationTracking = typeof applicationTracking.$inferSelect;
export type InsertApplicationTracking = typeof applicationTracking.$inferInsert;
