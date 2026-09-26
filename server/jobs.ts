import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { jobs, type InsertJob } from "../drizzle/schema.ts";
import { getDb } from "./db.ts";

export const JOB_TYPES = ["Remote", "Full-time", "Part-time", "Contract", "Hybrid"] as const;

export type JobType = (typeof JOB_TYPES)[number];

export type JobFilters = {
  search?: string;
  location?: string;
  jobType?: JobType;
  category?: string;
  page: number;
  pageSize: number;
};

const seedJobRows: InsertJob[] = [
  {
    title: "Senior Frontend Engineer",
    companyName: "Northstar Labs",
    location: "Remote — Europe",
    jobType: "Remote",
    category: "Engineering",
    salaryRange: "$95k – $125k",
    description: "Build thoughtful, accessible product experiences for a distributed climate-tech company. You will work closely with product and design to turn complex workflows into clear interfaces.",
    requirements: "5+ years with React and TypeScript\nStrong CSS and accessibility fundamentals\nExperience working in a product-focused, remote team",
    applicationContact: "careers@northstarlabs.example",
  },
  {
    title: "Product Designer",
    companyName: "Cedar & Co.",
    location: "New York, NY",
    jobType: "Hybrid",
    category: "Design",
    salaryRange: "$105k – $135k",
    description: "Own end-to-end product design for a new generation of collaborative finance tools. This is a highly visible role with room to shape our design system and research practice.",
    requirements: "4+ years designing SaaS products\nA strong portfolio showing systems thinking\nComfort facilitating workshops with customers and stakeholders",
    applicationContact: "https://cedar.example/careers/product-designer",
  },
  {
    title: "Growth Marketing Manager",
    companyName: "Orbit Commerce",
    location: "London, United Kingdom",
    jobType: "Full-time",
    category: "Marketing",
    salaryRange: "£70k – £90k",
    description: "Lead a small, ambitious growth team as we expand our commerce platform across Europe. You will own the testing roadmap across acquisition, lifecycle, and partnerships.",
    requirements: "6+ years in B2B or SaaS growth marketing\nExperience owning a multi-channel growth budget\nExcellent analytical and written communication skills",
    applicationContact: "talent@orbitcommerce.example",
  },
  {
    title: "Product Manager, AI Platform",
    companyName: "Signal Foundry",
    location: "Remote — Worldwide",
    jobType: "Remote",
    category: "Product",
    salaryRange: "$120k – $155k",
    description: "Shape the roadmap for the platform that helps teams safely bring AI into everyday workflows. You will pair customer insight with strong product judgment and crisp execution.",
    requirements: "3+ years managing technical B2B products\nExperience shipping API or platform capabilities\nFluent in turning ambiguous problems into measurable outcomes",
    applicationContact: "https://signalfoundry.example/jobs/ai-platform-pm",
  },
  {
    title: "Data Analyst",
    companyName: "Morrow Health",
    location: "Austin, TX",
    jobType: "Part-time",
    category: "Engineering",
    salaryRange: "$45 – $60 / hour",
    description: "Help our care operations team make better decisions with reliable reporting and clear, actionable analysis. This role is ideal for someone who enjoys partnering with non-technical teams.",
    requirements: "2+ years using SQL for business analysis\nComfort with dashboards and data storytelling\nCareful, curious, and able to explain trade-offs simply",
    applicationContact: "jobs@morrowhealth.example",
  },
];

export async function listJobs(filters: JobFilters) {
  const db = await getDb();
  if (!db) return { jobs: [], total: 0 };

  const conditions = [eq(jobs.isActive, true)];
  const search = filters.search?.trim();
  if (search) {
    const term = `%${search}%`;
    conditions.push(or(like(jobs.title, term), like(jobs.companyName, term))!);
  }
  if (filters.location?.trim()) conditions.push(like(jobs.location, `%${filters.location.trim()}%`));
  if (filters.jobType) conditions.push(eq(jobs.jobType, filters.jobType));
  if (filters.category?.trim()) conditions.push(eq(jobs.category, filters.category.trim()));

  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db.select().from(jobs).where(where).orderBy(desc(jobs.createdAt)).limit(filters.pageSize).offset((filters.page - 1) * filters.pageSize),
    db.select({ count: sql<number>`count(*)` }).from(jobs).where(where),
  ]);
  return { jobs: rows, total: Number(countRows[0]?.count ?? 0) };
}

export async function getJobById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(jobs).where(and(eq(jobs.id, id), eq(jobs.isActive, true))).limit(1);
  return rows[0];
}

export async function createJob(input: InsertJob) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.insert(jobs).values(input);
  const id = Number(result[0].insertId);
  return getJobById(id);
}

export async function seedJobs() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ count: sql<number>`count(*)` }).from(jobs);
  if (Number(existing[0]?.count ?? 0) > 0) return;
  await db.insert(jobs).values(seedJobRows);
}
