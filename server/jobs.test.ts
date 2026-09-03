import { describe, expect, it } from "vitest";
import { safeHttpsUrl, stripHtml, toIsoDate } from "./jobs/http";
import { jobicyScope, jobicyTag } from "./jobs/adapters";
import {
  ageInDays,
  dedupe,
  describeFunnel,
  isFresh,
  matchesLocation,
  matchesRole,
  roleScore,
  roleTokens,
  type JobFunnel,
} from "./jobs";
import type { NormalisedJob, SourceOutcome } from "./jobs/types";

const job = (overrides: Partial<NormalisedJob> = {}): NormalisedJob => ({
  externalId: "1",
  title: "Product Manager",
  company: "Fieldworks",
  location: "United States",
  remote: true,
  excerpt: "Own the roadmap.",
  description: "Own the roadmap.",
  postedAt: new Date().toISOString(),
  url: "https://example.com/job",
  tags: [],
  jobType: [],
  sourceName: "Jobicy",
  sourceUrl: "https://jobicy.com/",
  ...overrides,
});

/* -------------------------------------------------------------------- http */

describe("toIsoDate", () => {
  it("accepts ISO strings, unix seconds and unix milliseconds", () => {
    expect(toIsoDate("2026-08-24T09:00:00Z")).toBe("2026-08-24T09:00:00.000Z");
    expect(toIsoDate(1756026000)).toBe(new Date(1756026000000).toISOString());
    expect(toIsoDate(1756026000000)).toBe(new Date(1756026000000).toISOString());
  });

  it("returns null rather than an invalid date", () => {
    expect(toIsoDate("not a date")).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });
});

describe("stripHtml", () => {
  it("removes markup, scripts and entities", () => {
    expect(stripHtml("<p>Build <b>things</b></p><script>evil()</script>")).toBe("Build things");
    expect(stripHtml("Caf&amp;s &amp; bars")).toBe("Caf&s & bars");
  });

  it("returns an empty string for a non-string input", () => {
    expect(stripHtml(undefined)).toBe("");
    expect(stripHtml(42)).toBe("");
  });
});

describe("safeHttpsUrl", () => {
  it("falls back when the provider gives no usable link", () => {
    expect(safeHttpsUrl("https://x.example/a", "https://fallback")).toBe("https://x.example/a");
    expect(safeHttpsUrl("javascript:alert(1)", "https://fallback")).toBe("https://fallback");
    expect(safeHttpsUrl(undefined, "https://fallback")).toBe("https://fallback");
  });
});

/* ------------------------------------------------------------------ jobicy */

describe("jobicyTag", () => {
  it("reduces a role phrase to one lowercase keyword the provider recognises", () => {
    expect(jobicyTag("Product Manager")).toBe("manager");
    expect(jobicyTag("Web Developer")).toBe("developer");
  });

  it("sends no tag for an unfiltered search", () => {
    expect(jobicyTag("All hiring roles")).toBeNull();
    expect(jobicyTag("   ")).toBeNull();
  });
});

describe("jobicyScope", () => {
  it("uses a direct country filter where the provider documents one", () => {
    expect(jobicyScope({ country: "United States", region: "Americas" } as never).geo).toBe("usa");
  });

  it("falls back to the documented regional scope", () => {
    expect(jobicyScope({ country: "France", region: "Europe" } as never).geo).toBe("europe");
  });

  it("sends no geo at all for a region the provider does not cover, rather than an invalid value", () => {
    const scope = jobicyScope({ country: "Nigeria", region: "Africa" } as never);
    expect(scope.geo).toBeNull();
    expect(scope.scope).toBe("worldwide");
  });
});

/* -------------------------------------------------------------- role match */

describe("roleTokens", () => {
  it("drops stop words and seniority prefixes", () => {
    expect(roleTokens("Senior Product Manager")).toEqual(expect.arrayContaining(["product", "manager"]));
    expect(roleTokens("Senior Product Manager")).not.toContain("senior");
  });

  it("expands related wordings so one phrasing finds the others", () => {
    expect(roleTokens("developer")).toEqual(expect.arrayContaining(["developer", "engineer"]));
    expect(roleTokens("copywriter")).toEqual(expect.arrayContaining(["copywriter", "writer", "content"]));
  });

  it("returns nothing for an unfiltered search", () => {
    expect(roleTokens("All hiring roles")).toEqual([]);
  });
});

describe("matchesRole", () => {
  it("matches a real-world title the old exact-alias filter would have missed", () => {
    expect(matchesRole(job({ title: "Senior Product Manager, Growth" }), "Product manager")).toBe(true);
    expect(matchesRole(job({ title: "Staff Frontend Engineer" }), "web developer")).toBe(true);
    expect(matchesRole(job({ title: "Content Marketing Writer" }), "copywriter")).toBe(true);
  });

  it("still rejects an unrelated role", () => {
    expect(matchesRole(job({ title: "Warehouse Operative", excerpt: "Lift boxes." }), "Product manager")).toBe(false);
  });

  it("lets everything through when no role is specified", () => {
    expect(matchesRole(job({ title: "Anything" }), "All hiring roles")).toBe(true);
  });

  it("weights a title hit above a body mention", () => {
    const inTitle = roleScore(job({ title: "Product Manager", excerpt: "" }), "product manager");
    const inBody = roleScore(job({ title: "Warehouse Operative", excerpt: "work with our product manager" }), "product manager");
    expect(inTitle).toBeGreaterThan(inBody);
  });
});

/* -------------------------------------------------------------- freshness */

describe("isFresh and ageInDays", () => {
  const now = Date.parse("2026-09-03T12:00:00Z");

  it("keeps a job inside the window and drops one outside it", () => {
    expect(isFresh(job({ postedAt: "2026-09-01T12:00:00Z" }), 5, now)).toBe(true);
    expect(isFresh(job({ postedAt: "2026-08-20T12:00:00Z" }), 5, now)).toBe(false);
  });

  it("tolerates a small provider clock difference but not a real future date", () => {
    expect(isFresh(job({ postedAt: "2026-09-03T16:00:00Z" }), 5, now)).toBe(true);
    expect(isFresh(job({ postedAt: "2026-09-10T12:00:00Z" }), 5, now)).toBe(false);
  });

  it("widening the window admits more jobs, which is the fix for an empty market", () => {
    const older = job({ postedAt: "2026-08-25T12:00:00Z" });
    expect(isFresh(older, 5, now)).toBe(false);
    expect(isFresh(older, 14, now)).toBe(true);
    expect(Math.round(ageInDays(older, now))).toBe(9);
  });
});

/* ----------------------------------------------------------------- dedupe */

describe("dedupe", () => {
  it("collapses the same posting carried by two sources and keeps the freshest", () => {
    const result = dedupe([
      job({ sourceName: "Jobicy", postedAt: "2026-09-01T00:00:00Z" }),
      job({ sourceName: "RemoteOK", postedAt: "2026-09-02T00:00:00Z" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].sourceName).toBe("RemoteOK");
  });

  it("keeps genuinely different postings apart", () => {
    expect(dedupe([job({ title: "Product Manager" }), job({ title: "Content Writer" })])).toHaveLength(2);
  });

  it("ignores punctuation and casing when comparing", () => {
    expect(dedupe([job({ company: "Field-Works" }), job({ company: "fieldworks" })])).toHaveLength(1);
  });
});

/* --------------------------------------------------------------- location */

describe("matchesLocation", () => {
  it("accepts everything when the search is remote-only", () => {
    expect(matchesLocation(job({ location: "Berlin", remote: false }), { country: "United States", remoteOnly: true })).toBe(true);
  });

  it("keeps a remote job for any market", () => {
    expect(matchesLocation(job({ location: "Anywhere", remote: true }), { country: "Nigeria", remoteOnly: false })).toBe(true);
  });

  it("matches on the country or the city when the job is on-site", () => {
    expect(matchesLocation(job({ location: "Austin, United States", remote: false }), { country: "United States", remoteOnly: false })).toBe(true);
    expect(matchesLocation(job({ location: "Lagos, Nigeria", remote: false }), { country: "Nigeria", location: "Lagos", remoteOnly: false })).toBe(true);
    expect(matchesLocation(job({ location: "Berlin, Germany", remote: false }), { country: "Nigeria", remoteOnly: false })).toBe(false);
  });
});

/* ----------------------------------------------------------------- funnel */

describe("describeFunnel", () => {
  const funnel = (overrides: Partial<JobFunnel> = {}): JobFunnel => ({
    fetched: 80,
    usable: 78,
    afterFreshness: 30,
    afterRole: 12,
    afterLocation: 10,
    afterDedupe: 9,
    ...overrides,
  });
  const ok: SourceOutcome = { source: "Jobicy", ok: true, fetched: 40, usable: 40, ms: 300 };
  const failed: SourceOutcome = { source: "RemoteOK", ok: false, fetched: 0, usable: 0, ms: 12000, error: "Timed out after 12s" };

  it("says plainly when every source is down", () => {
    const note = describeFunnel(funnel({ fetched: 0 }), [failed], 5, "product manager");
    expect(note).toMatch(/no job source could be reached/i);
    expect(note).toContain("Timed out");
  });

  it("names freshness as the reason when everything was too old", () => {
    const note = describeFunnel(funnel({ afterFreshness: 0 }), [ok], 5, "product manager");
    expect(note).toMatch(/none were posted in the last 5 days/i);
    expect(note).toMatch(/widen the freshness window/i);
  });

  it("names the role filter when that is what emptied the list", () => {
    const note = describeFunnel(funnel({ afterRole: 0 }), [ok], 5, "product manager");
    expect(note).toContain('none matched "product manager"');
    expect(note).toMatch(/broader role/i);
  });

  it("names the location filter and how to switch it off", () => {
    const note = describeFunnel(funnel({ afterLocation: 0 }), [ok], 5, "product manager");
    expect(note).toMatch(/remote-only/i);
  });

  it("reports a partial outage alongside a successful result", () => {
    const note = describeFunnel(funnel(), [ok, failed], 5, "product manager");
    expect(note).toContain("9 matching roles");
    expect(note).toMatch(/1 source\(s\) were unavailable/);
    expect(note).toContain("RemoteOK");
  });
});
