import { ENV } from "./env";
import { getDb } from "../db";
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure.query(async () => {
    const db = await getDb();
    return {
      ok: true,
      environment: ENV.nodeEnv,
      databaseConnected: Boolean(db),
      time: new Date().toISOString(),
    };
  }),
  /** What the UI needs to decide which panels can run live vs. need a source connected. */
  capabilities: publicProcedure.query(async () => {
    const db = await getDb();
    return {
      database: Boolean(db),
      ai: Boolean(ENV.forgeApiUrl && ENV.forgeApiKey),
      places: Boolean(ENV.placesApiKey),
      adLibrary: Boolean(ENV.adLibraryToken),
      registry: Boolean(ENV.registryApiKey && ENV.registryApiUrl),
      localJobs: Boolean(ENV.localJobsApiKey && ENV.localJobsApiUrl),
      email: Boolean(ENV.resendApiKey),
    };
  }),
});
