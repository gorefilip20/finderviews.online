import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const llm = vi.hoisted(() => ({
  listLLMModels: vi.fn(),
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/llm", () => llm);

import { appRouter } from "./routers";

function createAuthenticatedContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "finder-test-user",
      name: "Finder Test User",
      email: "finder-test@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("hiring.brief", () => {
  it("returns a source-bound AI brief for an authenticated user", async () => {
    llm.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-5-mini" }] });
    llm.invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            companyNeed: "The public listing asks for product leadership during an AI-focused expansion.",
            likelyDecisionMakerRole: "Head of Product or VP Product",
            outreachAngle: "Offer a focused discovery sprint that clarifies the new workflow and customer value proposition.",
            recommendedService: "Product positioning and conversion-focused web experience",
            evidence: ["The public title names AI Creation & Growth.", "The description requests product strategy and delivery experience."],
            caveat: "This is a public-listing interpretation, not confirmation of the company’s internal buying process.",
          }),
        },
      }],
    });

    const caller = appRouter.createCaller(createAuthenticatedContext());
    const result = await caller.hiring.brief({
      title: "Principal Product Manager - AI Creation & Growth",
      company: "Example Company",
      geography: "USA",
      industry: ["Product & Operations"],
      jobType: ["Full-Time"],
      level: "Senior",
      excerpt: "A public job listing for product leadership in an AI-focused team.",
      description: "The public description asks for product strategy and delivery experience.",
      postedAt: "2026-08-24T09:00:00.000Z",
      sourceUrl: "https://jobicy.com/jobs/example",
    });

    expect(result.likelyDecisionMakerRole).toBe("Head of Product or VP Product");
    expect(result.evidence).toHaveLength(2);
    expect(result.freshnessLimitDays).toBe(5);
    expect(result.sourceNote).toContain("public");
    expect(llm.invokeLLM).toHaveBeenCalledTimes(1);
  });
});
