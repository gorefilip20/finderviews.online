import { describe, expect, it } from "vitest";
import { buildProposal, deriveScope } from "./proposal";
import type { WebAuditResult } from "./webaudit";

function auditWith(overrides: Partial<WebAuditResult> = {}): WebAuditResult {
  return {
    url: "https://example.com",
    finalUrl: "https://example.com",
    reachable: true,
    httpStatus: 200,
    responseMs: 400,
    secure: true,
    mobileFriendly: true,
    decayScore: 20,
    verdict: "healthy",
    headline: "fine",
    fetchedAt: new Date().toISOString(),
    checks: [],
    ...overrides,
  };
}

describe("deriveScope", () => {
  it("only bills for work a failed check justifies", () => {
    const scope = deriveScope({
      agencyName: "Studio",
      prospectName: "Cedar Goods",
      prospectWebsite: "https://cedar.example",
      audit: auditWith({
        checks: [
          { key: "viewport", label: "Mobile responsive", status: "fail", weight: 16, detail: "No viewport." },
          { key: "https", label: "Secure connection", status: "pass", weight: 14, detail: "HTTPS." },
          { key: "speed", label: "Server response time", status: "pass", weight: 12, detail: "Fast." },
        ],
      }),
    });

    const titles = scope.map(item => item.title);
    expect(titles).toContain("Mobile-first rebuild");
    expect(titles).not.toContain("Secure hosting and certificate");
    expect(titles).not.toContain("Performance work");
  });

  it("proposes a full build when no website exists", () => {
    const scope = deriveScope({ agencyName: "Studio", prospectName: "Rosa's" });
    expect(scope[0].title).toBe("Website design and build");
    expect(scope[0].trigger).toMatch(/no website is listed/i);
  });

  it("proposes a growth review rather than nothing when everything passes", () => {
    const scope = deriveScope({
      agencyName: "Studio",
      prospectName: "Healthy Co",
      prospectWebsite: "https://healthy.example",
      audit: auditWith({
        checks: [{ key: "https", label: "Secure connection", status: "pass", weight: 14, detail: "HTTPS." }],
      }),
    });
    expect(scope).toHaveLength(1);
    expect(scope[0].title).toBe("Growth review");
    expect(scope[0].trigger).toMatch(/no critical faults/i);
  });

  it("ties every scope item to the observation that triggered it", () => {
    const scope = deriveScope({
      agencyName: "Studio",
      prospectName: "Aging Co",
      prospectWebsite: "https://aging.example",
      audit: auditWith({
        checks: [
          { key: "analytics", label: "Measurement", status: "warn", weight: 5, detail: "No analytics tag." },
          { key: "copyright", label: "Content freshness", status: "fail", weight: 14, detail: "Footer reads 2016." },
        ],
      }),
    });
    expect(scope.length).toBeGreaterThan(0);
    for (const item of scope) expect(item.trigger.length).toBeGreaterThan(0);
  });
});

describe("buildProposal", () => {
  it("escapes untrusted business names instead of injecting markup", () => {
    const built = buildProposal({
      agencyName: "Studio",
      prospectName: '<script>alert("x")</script>',
      prospectWebsite: "https://example.com",
    });
    expect(built.html).not.toContain("<script>alert");
    expect(built.html).toContain("&lt;script&gt;");
  });

  it("always states that only public information was used", () => {
    const built = buildProposal({ agencyName: "Studio", prospectName: "Cedar Goods" });
    expect(built.html).toMatch(/publicly available information only/i);
    expect(built.html).toMatch(/does not collect private or personal contact data/i);
  });

  it("omits the investment block when no deal band was supplied", () => {
    const built = buildProposal({ agencyName: "Studio", prospectName: "Cedar Goods" });
    expect(built.html).not.toContain("Indicative investment");
  });
});
