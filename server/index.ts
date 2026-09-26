import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { createJob, getJobById, listJobs, seedJobs, JOB_TYPES } from "./jobs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(express.json({ limit: "100kb" }));

  app.get("/api/jobs", async (req, res) => {
    const query = z.object({
      search: z.string().trim().max(120).optional(),
      location: z.string().trim().max(160).optional(),
      jobType: z.enum(JOB_TYPES).optional(),
      category: z.string().trim().max(120).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(10),
    }).safeParse(req.query);
    if (!query.success) return res.status(400).json({ error: "Invalid job search filters.", details: query.error.flatten() });
    try {
      const result = await listJobs(query.data);
      return res.json({ ...result, page: query.data.page, pageSize: query.data.pageSize, totalPages: Math.ceil(result.total / query.data.pageSize) });
    } catch (error) {
      console.error("[Jobs] Failed to list jobs", error);
      return res.status(500).json({ error: "Unable to load jobs right now." });
    }
  });

  app.get("/api/jobs/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid job id." });
    try {
      const job = await getJobById(id);
      return job ? res.json({ job }) : res.status(404).json({ error: "Job not found." });
    } catch (error) {
      console.error("[Jobs] Failed to load job", error);
      return res.status(500).json({ error: "Unable to load this job right now." });
    }
  });

  app.post("/api/jobs", async (req, res) => {
    const payload = z.object({
      title: z.string().trim().min(2).max(240),
      companyName: z.string().trim().min(2).max(240),
      location: z.string().trim().min(2).max(240),
      jobType: z.enum(JOB_TYPES),
      category: z.string().trim().min(2).max(120),
      salaryRange: z.string().trim().max(120).optional().or(z.literal("")),
      description: z.string().trim().min(20).max(12000),
      requirements: z.string().trim().min(10).max(8000),
      applicationContact: z.string().trim().min(3).max(320).refine((value) => /^(?:https?:\/\/|mailto:|[^\s@]+@[^\s@]+\.[^\s@]+$)/i.test(value), "Enter a valid email or application URL."),
    }).safeParse(req.body);
    if (!payload.success) return res.status(400).json({ error: "Please check the required fields.", details: payload.error.flatten() });
    try {
      const job = await createJob({ ...payload.data, salaryRange: payload.data.salaryRange || null });
      return res.status(201).json({ job });
    } catch (error) {
      console.error("[Jobs] Failed to create job", error);
      return res.status(500).json({ error: "Unable to publish this job right now." });
    }
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  await seedJobs().catch((error) => console.warn("[Jobs] Seed skipped:", error));

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
