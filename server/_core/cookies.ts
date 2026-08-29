import type { Request } from "express";
import { ONE_YEAR_MS } from "@shared/const";

type CookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "none" | "lax";
  path: string;
  maxAge: number;
};

/**
 * The app is embedded in preview iframes, so the session cookie has to be
 * SameSite=None; Secure. Over plain http (local dev) browsers reject that pair,
 * so fall back to Lax there.
 */
export function getSessionCookieOptions(req: Pick<Request, "protocol" | "headers">): CookieOptions {
  const forwardedProto = req.headers?.["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || req.protocol;
  const isSecure = proto === "https";

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "none" : "lax",
    path: "/",
    maxAge: ONE_YEAR_MS,
  };
}
