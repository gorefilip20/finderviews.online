export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const ForbiddenError = (message = "Forbidden") => new HttpError(403, message);
export const UnauthorizedError = (message = "Unauthorized") => new HttpError(401, message);
