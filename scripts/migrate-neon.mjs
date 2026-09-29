import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Copy the pooled PostgreSQL URL from Neon and set it before running the migration.");
  process.exit(1);
}

const migrationFiles = ["0000_users.sql", "0001_jobs.sql", "0002_application_tracking.sql"];
const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 5_000,
});

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('finderviews-schema'))");
    for (const fileName of migrationFiles) {
      const sql = await readFile(resolve(process.cwd(), "drizzle", fileName), "utf8");
      console.log(`Applying ${fileName}...`);
      await client.query(sql);
    }
    await client.query("COMMIT");
    console.log("Neon PostgreSQL schema is ready.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Neon migration failed: ${message}`);
    process.exitCode = 1;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
