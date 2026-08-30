/**
 * Express wiring for the Finder API. Everything the gateway routes lives under /api/.
 */
import cookieParser from "cookie-parser";
import type { Express, Request, Response } from "express";
import express from "express";
import { SignJWT } from "jose";
import { COOKIE_NAME, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import { upsertUser } from "../db";
import { appRouter } from "../routers";
import { runDueDigests } from "../digest";
import { runDueHealthChecks } from "../health";
import { proposals } from "../../drizzle/schema";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import { buildTiers, wrapForSharing } from "../proposal";
import { acceptShare, getShareByToken, recordView, viewerKeyFor } from "../sharing";
import { getSessionCookieOptions } from "./cookies";
import { createContext } from "./context";
import { ENV } from "./env";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

type PortalProfile = {
  openId?: string;
  open_id?: string;
  id?: string;
  sub?: string;
  name?: string;
  email?: string;
  loginMethod?: string;
};

async function exchangeCodeForProfile(code: string, redirectUri: string): Promise<PortalProfile> {
  if (!ENV.oauthPortalUrl || !ENV.appId || !ENV.oauthClientSecret) {
    throw new Error("OAuth is not configured. Set VITE_OAUTH_PORTAL_URL, VITE_APP_ID and OAUTH_CLIENT_SECRET.");
  }
  const base = ENV.oauthPortalUrl.replace(/\/+$/, "");

  const tokenResponse = await fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appId: ENV.appId,
      appSecret: ENV.oauthClientSecret,
      code,
      redirectUri,
      grantType: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed (${tokenResponse.status})`);
  }
  const tokenPayload = (await tokenResponse.json()) as { accessToken?: string; access_token?: string; user?: PortalProfile };
  if (tokenPayload.user?.openId || tokenPayload.user?.open_id) return tokenPayload.user;

  const accessToken = tokenPayload.accessToken || tokenPayload.access_token;
  if (!accessToken) throw new Error("The login provider did not return an access token.");

  const profileResponse = await fetch(`${base}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileResponse.ok) throw new Error(`Profile lookup failed (${profileResponse.status})`);
  return (await profileResponse.json()) as PortalProfile;
}

async function mintSession(openId: string) {
  if (!ENV.jwtSecret) throw new Error("JWT_SECRET is required to issue a session.");
  const secret = new TextEncoder().encode(ENV.jwtSecret);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(openId)
    .setIssuedAt()
    .setExpirationTime("365d")
    .sign(secret);
}

export function registerApi(app: Express) {
  app.use(cookieParser());
  app.use("/api", express.json({ limit: "1mb" }));

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    try {
      const code = typeof req.query.code === "string" ? req.query.code : undefined;
      const rawState = typeof req.query.state === "string" ? req.query.state : "";
      if (!code) return res.status(400).send("Missing authorization code.");

      const state = decodeOAuthState(rawState);
      const expectedNonce = (req as Request & { cookies?: Record<string, string> }).cookies?.[OAUTH_STATE_COOKIE];
      if (!state.nonce || !expectedNonce || state.nonce !== expectedNonce) {
        return res.status(403).send("invalid oauth state");
      }
      res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

      const redirectUri = state.redirectUri || `${req.protocol}://${req.get("host")}/api/oauth/callback`;
      const profile = await exchangeCodeForProfile(code, redirectUri);
      const openId = profile.openId || profile.open_id || profile.sub || profile.id;
      if (!openId) return res.status(502).send("The login provider did not return a user id.");

      await upsertUser({
        openId,
        name: profile.name ?? null,
        email: profile.email ?? null,
        loginMethod: profile.loginMethod ?? "manus",
        lastSignedIn: new Date(),
      });

      const token = await mintSession(openId);
      res.cookie(COOKIE_NAME, token, getSessionCookieOptions(req));
      return res.redirect("/app");
    } catch (error) {
      console.error("[OAuth] callback failed:", error);
      return res.status(500).send("Sign-in could not be completed. Please try again.");
    }
  });

  /**
   * Scheduled digest hook. Protected by a shared secret so it can be called by any
   * external scheduler (Hostinger cron, GitHub Action, uptime pinger).
   */
  app.post("/api/cron/digest", async (req: Request, res: Response) => {
    const provided = req.get("x-cron-secret");
    if (!ENV.cronSecret || provided !== ENV.cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const result = await runDueDigests();
      return res.json(result);
    } catch (error) {
      console.error("[Digest] run failed:", error);
      return res.status(500).json({ error: "Digest run failed" });
    }
  });

  /* ---------------------------------------------- public proposal sharing */

  /**
   * The recipient-facing proposal. Served from the app itself rather than sent as an attachment,
   * which is what makes read-tracking and one-click acceptance possible at all.
   */
  app.get("/p/:token", async (req: Request, res: Response) => {
    try {
      const share = await getShareByToken(req.params.token);
      const db = await getDb();
      if (!db) return res.status(503).send("This link is temporarily unavailable.");

      const rows = await db.select().from(proposals).where(eq(proposals.id, share.proposalId)).limit(1);
      if (rows.length === 0 || !rows[0].html) return res.status(404).send("That proposal is no longer available.");

      const stored = Array.isArray(share.tiers) ? (share.tiers as ReturnType<typeof buildTiers>) : null;
      const html = wrapForSharing(rows[0].html, {
        token: share.token,
        endpointBase: "/api/p",
        bookingUrl: share.bookingUrl,
        tiers: stored,
        status: share.status,
        acceptedTier: share.acceptedTier,
      });

      // Never cached: the action bar reflects live acceptance state.
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return res.status(200).type("html").send(html);
    } catch (error) {
      const message = error instanceof Error ? error.message : "That link is not valid.";
      return res.status(404).send(message);
    }
  });

  /** Reading beacon. Deliberately unauthenticated — the recipient is not a Finder user. */
  app.post("/api/p/view", async (req: Request, res: Response) => {
    try {
      const { token, totalMs, sectionMs, referrer } = req.body ?? {};
      if (typeof token !== "string") return res.status(400).json({ error: "Missing token" });

      await recordView({
        token,
        viewerKey: viewerKeyFor(req.ip, req.get("user-agent")),
        totalMs: Number(totalMs) || 0,
        sectionMs: sectionMs && typeof sectionMs === "object" ? sectionMs : {},
        referrer: typeof referrer === "string" ? referrer : undefined,
      });
      return res.status(204).end();
    } catch {
      // A failed beacon must never surface to the reader as an error.
      return res.status(204).end();
    }
  });

  app.post("/api/p/accept", async (req: Request, res: Response) => {
    try {
      const { token, tier, name, email } = req.body ?? {};
      if (typeof token !== "string") return res.status(400).json({ error: "Missing token" });

      const result = await acceptShare({
        token,
        tier: typeof tier === "string" ? tier : undefined,
        name: typeof name === "string" ? name : undefined,
        email: typeof email === "string" ? email : undefined,
      });
      return res.json({ accepted: true, alreadyAccepted: result.alreadyAccepted });
    } catch (error) {
      console.error("[Proposal] accept failed:", error);
      return res.status(400).json({ error: "That could not be recorded." });
    }
  });

  app.post("/api/cron/health", async (req: Request, res: Response) => {
    const provided = req.get("x-cron-secret");
    if (!ENV.cronSecret || provided !== ENV.cronSecret) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      return res.json(await runDueHealthChecks());
    } catch (error) {
      console.error("[Health] run failed:", error);
      return res.status(500).json({ error: "Health run failed" });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path }) {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[tRPC] ${path ?? "unknown"}:`, error.cause ?? error.message);
        }
      },
    }),
  );
}
