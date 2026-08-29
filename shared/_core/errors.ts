/**
 * Error vocabulary shared by the server and the browser. Kept free of server-only imports
 * so `shared/types.ts` can be pulled into client code.
 */
export const ERROR_CODES = {
  unauthorized: "UNAUTHORIZED",
  forbidden: "FORBIDDEN",
  badRequest: "BAD_REQUEST",
  notFound: "NOT_FOUND",
  preconditionFailed: "PRECONDITION_FAILED",
  tooManyRequests: "TOO_MANY_REQUESTS",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Message shown when a workspace feature is used before a database is configured. */
export const DATABASE_REQUIRED_HINT =
  "This feature stores your work, so it needs a database. Set DATABASE_URL and run `pnpm db:push`.";

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.values(ERROR_CODES).includes(value as ErrorCode);
}
