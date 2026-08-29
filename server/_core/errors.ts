import { TRPCError } from "@trpc/server";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";

export const unauthorized = () => new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
export const forbidden = () => new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });

export const badRequest = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });
export const notFound = (message: string) => new TRPCError({ code: "NOT_FOUND", message });
export const failedPrecondition = (message: string) =>
  new TRPCError({ code: "PRECONDITION_FAILED", message });

/**
 * Turns an unknown thrown value into a message safe to show a user. Provider errors can
 * carry upstream payloads, so we never spread them straight into a response.
 */
export function toSafeMessage(error: unknown, fallback: string): string {
  if (error instanceof TRPCError) return error.message;
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return fallback;
}
