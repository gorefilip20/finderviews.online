import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("hiring.brief", () => {
  it("requires an authenticated user before it requests an AI opportunity brief", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());

    await expect(caller.hiring.brief({
      title: "Product Manager",
      company: "Example Company",
      geography: "United States",
      industry: ["Product & Operations"],
      jobType: ["Full-Time"],
      level: "Mid-Senior",
      excerpt: "A public job listing for a product manager.",
      description: "The public description asks for product strategy and delivery experience.",
      postedAt: "2026-08-24T09:00:00.000Z",
      sourceUrl: "https://jobicy.com/jobs/example",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
