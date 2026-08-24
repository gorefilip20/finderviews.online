import { describe, expect, it } from "vitest";
import { MAX_JOB_AGE_DAYS, getJobicyGeoScope, mapFreshJob, mapFreshJobs, matchesRequestedRole } from "./hiring";

const now = Date.UTC(2026, 7, 24, 12, 0, 0);

describe("Finder fresh-job mapper", () => {
  it("keeps a public job listing posted within five days", () => {
    const job = mapFreshJob({
      id: 1,
      jobTitle: "Product Manager",
      companyName: "Fieldworks",
      pubDate: "2026-08-21T12:00:00Z",
      jobDescription: "<p>Build a useful product.</p>",
      url: "https://jobicy.com/jobs/example",
    }, now);

    expect(job).toMatchObject({
      title: "Product Manager",
      company: "Fieldworks",
      ageHours: 72,
      sourceName: "Jobicy",
    });
  });

  it("excludes a job listing older than the strict five-day maximum", () => {
    const job = mapFreshJob({
      id: 2,
      jobTitle: "Content Writer",
      companyName: "Northstar",
      pubDate: "2026-08-19T11:59:59Z",
    }, now);

    expect(job).toBeNull();
  });

  it("sorts retained jobs by most recent original publication time", () => {
    const jobs = mapFreshJobs([
      { id: 1, jobTitle: "Older", companyName: "A", pubDate: "2026-08-21T12:00:00Z" },
      { id: 2, jobTitle: "Newer", companyName: "B", pubDate: "2026-08-24T09:00:00Z" },
    ], now);

    expect(jobs.map((job) => job.title)).toEqual(["Newer", "Older"]);
    expect(MAX_JOB_AGE_DAYS).toBe(5);
  });

  it("uses the closest documented geographic source filter while preserving match precision", () => {
    expect(getJobicyGeoScope({ role: "product manager", country: "United States", region: "Americas" })).toEqual({ geo: "usa", scope: "country" });
    expect(getJobicyGeoScope({ role: "product manager", country: "Japan", region: "Asia" })).toEqual({ geo: "apac", scope: "region" });
    expect(getJobicyGeoScope({ role: "content writer", country: "France", region: "Europe" })).toEqual({ geo: "europe", scope: "region" });
  });

  it("keeps job cards relevant to the requested role or accepted role alias", () => {
    const productJob = mapFreshJob({ id: 3, jobTitle: "Principal Product Manager", companyName: "Atlas", pubDate: "2026-08-24T09:00:00Z" }, now);
    const unrelatedJob = mapFreshJob({ id: 4, jobTitle: "Engineering Manager", companyName: "Atlas", pubDate: "2026-08-24T09:00:00Z" }, now);

    expect(productJob && matchesRequestedRole(productJob, "Product manager")).toBe(true);
    expect(unrelatedJob && matchesRequestedRole(unrelatedJob, "Product manager")).toBe(false);
  });
});
