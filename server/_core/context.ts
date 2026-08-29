import type { Request, Response } from "express";
import { jwtVerify } from "jose";
import { COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId } from "../db";
import { ENV } from "./env";

export type TrpcContext = {
  user: User | null;
  req: Request;
  res: Response;
};

function readSessionToken(req: Request): string | undefined {
  const header = req.headers?.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[COOKIE_NAME];
}

/**
 * Resolves the signed-in user, or null. A malformed or expired token is treated as
 * "signed out" rather than an error: protected procedures then produce the single
 * UNAUTHED message the client watches for to restart login.
 */
export async function resolveUser(req: Request): Promise<User | null> {
  const token = readSessionToken(req);
  if (!token || !ENV.jwtSecret) return null;

  try {
    const secret = new TextEncoder().encode(ENV.jwtSecret);
    const { payload } = await jwtVerify(token, secret);
    const openId = typeof payload.sub === "string" ? payload.sub : undefined;
    if (!openId) return null;
    return (await getUserByOpenId(openId)) ?? null;
  } catch {
    return null;
  }
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<TrpcContext> {
  return { user: await resolveUser(req), req, res };
}
