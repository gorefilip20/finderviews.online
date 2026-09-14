import { describe, expect, it } from "vitest";
import { MAX_JOB_AGE_DAYS, fetchAdzuna, getJobicyGeoScope, mapFreshJob, mapFreshJobs, matchesRequestedRole } from "./hiring";

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

  it("keeps a job listing inside the documented 30-day maximum", () => {
    const job = mapFreshJob({
      id: 2,
      jobTitle: "Content Writer",
      companyName: "Northstar",
      pubDate: "2026-08-19T11:59:59Z",
    }, now);

    expect(job).not.toBeNull();
  });

  it("sorts retained jobs by most recent original publication time", () => {
    const jobs = mapFreshJobs([
      { id: 1, jobTitle: "Older", companyName: "A", pubDate: "2026-08-21T12:00:00Z" },
      { id: 2, jobTitle: "Newer", companyName: "B", pubDate: "2026-08-24T09:00:00Z" },
    ], now);

    expect(jobs.map((job) => job.title)).toEqual(["Newer", "Older"]);
    expect(MAX_JOB_AGE_DAYS).toBe(30);
  });

  it("uses the closest documented geographic source filter while preserving match precision", () => {
    expect(getJobicyGeoScope({ role: "product manager", country: "United States", region: "Americas" })).toEqual({ geo: "usa", scope: "country" });
    expect(getJobicyGeoScope({ role: "product manager", country: "Worldwide", region: "Americas" })).toEqual({ geo: "", scope: "global" });
    expect(getJobicyGeoScope({ role: "product manager", country: "Japan", region: "Asia" })).toEqual({ geo: "japan", scope: "country" });
    expect(getJobicyGeoScope({ role: "content writer", country: "France", region: "Europe" })).toEqual({ geo: "france", scope: "country" });
  });

  it("keeps job cards relevant to the requested role or accepted role alias", () => {
    const productJob = mapFreshJob({ id: 3, jobTitle: "Principal Product Manager", companyName: "Atlas", pubDate: "2026-08-24T09:00:00Z" }, now);
    const unrelatedJob = mapFreshJob({ id: 4, jobTitle: "Engineering Manager", companyName: "Atlas", pubDate: "2026-08-24T09:00:00Z" }, now);

    expect(productJob && matchesRequestedRole(productJob, "Product manager")).toBe(true);
    expect(unrelatedJob && matchesRequestedRole(unrelatedJob, "Product manager")).toBe(false);
  });

  it("queries Adzuna Germany and Finland with mock credentials and normalizes both responses", async () => {
    const originalFetch = globalThis.fetch;
    const originalAppId = process.env.ADZUNA_APP_ID;
    const originalAppKey = process.env.ADZUNA_APP_KEY;
    process.env.ADZUNA_APP_ID = "mock-app-id";
    process.env.ADZUNA_APP_KEY = "mock-app-key";
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      const country = url.match(/\/jobs\/([^/]+)\/search/)?.[1];
      return new Response(JSON.stringify({ results: [{ id: country, title: `${country} Product Manager`, company: { display_name: `${country} Company` }, location: { display_name: country === "de" ? "Berlin, Germany" : "Helsinki, Finland" }, description: "Build products.", created: "2026-08-24T10:00:00Z", redirect_url: `https://jobs.example.test/${country}`, category: { label: "Product" }, contract_type: "permanent", contract_time: "full_time" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    try {
      const germany = await fetchAdzuna({ role: "Product manager", country: "Germany", region: "Europe" }, "Product manager");
      const finland = await fetchAdzuna({ role: "Product manager", country: "Finland", region: "Europe" }, "Product manager");
      expect(requestedUrls.some((url) => url.includes("/jobs/de/search/1"))).toBe(true);
      expect(requestedUrls.some((url) => url.includes("/jobs/fi/search/1"))).toBe(true);
      expect(germany[0]).toMatchObject({ company: "de Company", geography: "Berlin, Germany", sourceName: "Adzuna" });
      expect(finland[0]).toMatchObject({ company: "fi Company", geography: "Helsinki, Finland", sourceName: "Adzuna" });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalAppId === undefined) delete process.env.ADZUNA_APP_ID; else process.env.ADZUNA_APP_ID = originalAppId;
      if (originalAppKey === undefined) delete process.env.ADZUNA_APP_KEY; else process.env.ADZUNA_APP_KEY = originalAppKey;
    }
  });
});
