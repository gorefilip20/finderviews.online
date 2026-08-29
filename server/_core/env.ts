/**
 * Central environment access. Nothing else in the server reads process.env directly,
 * so a missing variable surfaces as one clear message instead of an undefined deep in a
 * request handler.
 */
import dotenv from "dotenv";

dotenv.config();

const read = (key: string) => {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
};

export const ENV = {
  nodeEnv: read("NODE_ENV") || "development",
  port: Number(read("PORT") || 3000),
  isProduction: (read("NODE_ENV") || "development") === "production",

  databaseUrl: read("DATABASE_URL"),

  ownerOpenId: read("OWNER_OPEN_ID"),
  appId: read("VITE_APP_ID") || read("APP_ID"),
  oauthPortalUrl: read("VITE_OAUTH_PORTAL_URL") || read("OAUTH_PORTAL_URL"),
  oauthClientSecret: read("OAUTH_CLIENT_SECRET"),
  jwtSecret: read("JWT_SECRET") || read("SESSION_SECRET"),

  forgeApiUrl: read("BUILT_IN_FORGE_API_URL"),
  forgeApiKey: read("BUILT_IN_FORGE_API_KEY"),

  /** Optional prospecting data providers. Absent key => the finder reports "source not connected". */
  placesApiKey: read("PLACES_API_KEY") || read("GOOGLE_PLACES_API_KEY"),
  placesApiUrl: read("PLACES_API_URL") || "https://places.googleapis.com/v1",
  adLibraryToken: read("META_AD_LIBRARY_TOKEN"),
  registryApiKey: read("BUSINESS_REGISTRY_API_KEY"),
  registryApiUrl: read("BUSINESS_REGISTRY_API_URL"),
  localJobsApiKey: read("LOCAL_JOBS_API_KEY"),
  localJobsApiUrl: read("LOCAL_JOBS_API_URL"),

  /** Outbound email for the weekly digest. */
  resendApiKey: read("RESEND_API_KEY"),
  digestFromEmail: read("DIGEST_FROM_EMAIL") || "finder@finderviews.online",
  /** Shared secret required to trigger the scheduled digest endpoint. */
  cronSecret: read("CRON_SECRET"),

  publicBaseUrl: read("PUBLIC_BASE_URL") || "https://finderviews.online",
} as const;

export function requireEnv(key: keyof typeof ENV): string {
  const value = ENV[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required environment variable for "${String(key)}".`);
  }
  return value;
}
