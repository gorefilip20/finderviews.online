import "dotenv/config";
import { seedJobs } from "../server/jobs.ts";

await seedJobs();
console.log("Job seed complete.");
