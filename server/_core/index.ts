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
