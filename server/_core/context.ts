import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
};
