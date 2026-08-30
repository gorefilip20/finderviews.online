import { describe, expect, it } from "vitest";
import { generateToken, interpretActivity, viewerKeyFor, TRACKED_SECTIONS } from "./sharing";
import { buildTiers, shareActionBar, trackingScript, wrapForSharing } from "./proposal";
import { impactfulFindings } from "./comparison";
import { describeImprovement, isDueForCheck, sparklineSvg } from "./health";
import type { WebAuditResult } from "./webaudit";
import type { TrackedSite } from "../drizzle/schema";

/* ------------------------------------------------------------------ sharing */

describe("generateToken", () => {
  it("produces an unguessable token that is safe in a URL", () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(new Set(Array.from({ length: 200 }, generateToken)).size).toBe(200);
  });
});

describe("viewerKeyFor", () => {
  it("is stable for the same visitor and different for another", () => {
    const a = viewerKeyFor("1.2.3.4", "Chrome");
    expect(viewerKeyFor("1.2.3.4", "Chrome")).toBe(a);
    expect(viewerKeyFor("5.6.7.8", "Chrome")).not.toBe(a);
    expect(viewerKeyFor("1.2.3.4", "Safari")).not.toBe(a);
  });

  it("never contains the raw address it was derived from", () => {
    const key = viewerKeyFor("203.0.113.44", "Mozilla/5.0");
    expect(key).not.toContain("203.0.113.44");
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("handles a missing address without throwing", () => {
    expect(viewerKeyFor(undefined, undefined)).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("interpretActivity", () => {
  it("calls repeated reads of the pricing section the strongest signal", () => {
    const result = interpretActivity({ opens: 4, totalMs: 300_000, reachedPricing: true, status: "opened" });
    expect(result.signalStrength).toBe("hot");
    expect(result.signal).toMatch(/call today/i);
  });

  it("treats real time on pricing as hot even on a single read", () => {
    expect(interpretActivity({ opens: 1, totalMs: 180_000, reachedPricing: true, status: "opened" }).signalStrength).toBe("hot");
  });

  it("distinguishes an unopened proposal from a skimmed one", () => {
    expect(interpretActivity({ opens: 0, totalMs: 0, reachedPricing: false, status: "sent" }).signalStrength).toBe("none");
    const skim = interpretActivity({ opens: 1, totalMs: 8_000, reachedPricing: false, status: "opened" });
    expect(skim.signalStrength).toBe("cold");
    expect(skim.signal).toMatch(/phone|call/i);
  });

  it("reports acceptance and decline as terminal states", () => {
    expect(interpretActivity({ opens: 2, totalMs: 100, reachedPricing: true, status: "accepted" }).signal).toMatch(/invoice/i);
    expect(interpretActivity({ opens: 2, totalMs: 100, reachedPricing: false, status: "declined" }).signalStrength).toBe("cold");
  });

  it("nudges when opened more than once without reaching pricing", () => {
    expect(interpretActivity({ opens: 2, totalMs: 60_000, reachedPricing: false, status: "opened" }).signalStrength).toBe("warm");
  });
});

/* -------------------------------------------------------------------- tiers */

describe("buildTiers", () => {
  const scope = [
    { title: "Website design and build", detail: "", trigger: "" },
    { title: "Search presence", detail: "", trigger: "" },
    { title: "Measurement setup", detail: "", trigger: "" },
  ];
  const deal = { band: "standard" as const, low: 3000, high: 7000, currency: "USD", basis: [], caveat: "" };

  it("returns three ascending tiers with one recommended", () => {
    const tiers = buildTiers(scope, deal);
    expect(tiers).toHaveLength(3);
    expect(tiers[0].price).toBeLessThan(tiers[1].price);
    expect(tiers[1].price).toBeLessThan(tiers[2].price);
    expect(tiers.filter(tier => tier.recommended)).toHaveLength(1);
    expect(tiers[1].recommended).toBe(true);
  });

  it("anchors the middle tier on the deal midpoint", () => {
    const tiers = buildTiers(scope, deal);
    expect(tiers[1].price).toBeGreaterThan(4000);
    expect(tiers[1].price).toBeLessThan(6000);
  });

  it("draws inclusions from the real scope rather than inventing deliverables", () => {
    const tiers = buildTiers(scope, deal);
    expect(tiers[2].includes).toEqual(expect.arrayContaining(["Website design and build", "Search presence"]));
    expect(tiers[2].includes.length).toBeGreaterThan(tiers[0].includes.length);
  });

  it("still produces usable tiers with no deal band and an empty scope", () => {
    const tiers = buildTiers([], undefined);
    expect(tiers).toHaveLength(3);
    for (const tier of tiers) expect(tier.price).toBeGreaterThan(0);
  });
});

/* ----------------------------------------------------------------- tracking */

describe("trackingScript", () => {
  it("embeds the token and endpoint safely as JSON literals", () => {
    const script = trackingScript("abc123", "/api/p/view");
    expect(script).toContain('"abc123"');
    expect(script).toContain('"/api/p/view"');
  });

  it("pauses on tab blur so a forgotten tab cannot inflate the reading time", () => {
    expect(trackingScript("t", "/e")).toContain("visibilitychange");
  });

  it("flushes on unload with sendBeacon so the final reading survives", () => {
    const script = trackingScript("t", "/e");
    expect(script).toContain("pagehide");
    expect(script).toContain("sendBeacon");
  });

  it("tracks the sections the server knows how to store", () => {
    expect(trackingScript("t", "/e")).toContain("data-section");
    expect(TRACKED_SECTIONS).toContain("investment");
  });
});

describe("shareActionBar", () => {
  const tiers = buildTiers([{ title: "Build", detail: "", trigger: "" }], undefined);

  it("offers the tiers, an accept button and a booking link", () => {
    const bar = shareActionBar({
      token: "t",
      endpointBase: "/api/p",
      bookingUrl: "https://cal.example/agency",
      tiers,
      status: "sent",
    });
    expect(bar).toContain("Accept and start");
    expect(bar).toContain("https://cal.example/agency");
    expect(bar).toContain("Most chosen");
  });

  it("replaces the form with a confirmation once accepted", () => {
    const bar = shareActionBar({ token: "t", endpointBase: "/api/p", tiers, status: "accepted", acceptedTier: "Recommended" });
    expect(bar).toContain("Accepted");
    expect(bar).not.toContain("Accept and start");
  });

  it("tells the reader the document reports when it is opened", () => {
    expect(shareActionBar({ token: "t", endpointBase: "/api/p", tiers, status: "sent" })).toMatch(/reports when it is opened/i);
  });

  it("escapes an untrusted booking URL rather than injecting it raw", () => {
    const bar = shareActionBar({
      token: "t",
      endpointBase: "/api/p",
      tiers,
      status: "sent",
      bookingUrl: `https://x.example/"><script>alert(1)</script>`,
    });
    expect(bar).not.toContain("<script>alert(1)</script>");
  });

  it("hides the action bar when the document is printed", () => {
    expect(shareActionBar({ token: "t", endpointBase: "/api/p", tiers, status: "sent" })).toContain("@media print");
  });
});

describe("wrapForSharing", () => {
  it("injects before the closing body tag", () => {
    const wrapped = wrapForSharing("<html><body><p>Proposal</p></body></html>", {
      token: "t",
      endpointBase: "/api/p",
      status: "sent",
    });
    expect(wrapped).toContain("<p>Proposal</p>");
    expect(wrapped.indexOf("finder-accept")).toBeLessThan(wrapped.indexOf("</body>"));
  });

  it("still appends when the document has no body tag", () => {
    const wrapped = wrapForSharing("<p>fragment</p>", { token: "t", endpointBase: "/api/p", status: "sent" });
    expect(wrapped).toContain("fragment");
    expect(wrapped).toContain("finder-accept");
  });
});

/* --------------------------------------------------------------- comparison */

function auditWith(checks: WebAuditResult["checks"]): WebAuditResult {
  return {
    url: "https://x.example",
    finalUrl: "https://x.example",
    reachable: true,
    httpStatus: 200,
    responseMs: 500,
    secure: true,
    mobileFriendly: false,
    decayScore: 60,
    verdict: "decayed",
    headline: "",
    fetchedAt: new Date().toISOString(),
    checks,
  };
}

describe("impactfulFindings", () => {
  it("puts failures before warnings and heavier checks first", () => {
    const findings = impactfulFindings(
      auditWith([
        { key: "analytics", label: "Measurement", status: "warn", weight: 5, detail: "" },
        { key: "viewport", label: "Mobile responsive", status: "fail", weight: 16, detail: "" },
        { key: "https", label: "Secure connection", status: "fail", weight: 14, detail: "" },
      ]),
    );
    expect(findings[0].key).toBe("viewport");
    expect(findings[1].key).toBe("https");
    expect(findings[2].key).toBe("analytics");
  });

  it("translates a technical check into what the owner actually loses", () => {
    const findings = impactfulFindings(auditWith([{ key: "viewport", label: "Mobile responsive", status: "fail", weight: 16, detail: "" }]));
    expect(findings[0].title).toMatch(/phone/i);
    expect(findings[0].impact).toMatch(/pinch|give up|phone/i);
  });

  it("excludes passing checks, so the panel never overstates the problem", () => {
    const findings = impactfulFindings(
      auditWith([
        { key: "https", label: "Secure connection", status: "pass", weight: 14, detail: "" },
        { key: "viewport", label: "Mobile responsive", status: "fail", weight: 16, detail: "" },
      ]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe("viewport");
  });

  it("handles a business with no website at all", () => {
    const findings = impactfulFindings(undefined);
    expect(findings[0].title).toMatch(/no website/i);
  });
});

/* ------------------------------------------------------------------- health */

describe("sparklineSvg", () => {
  it("renders nothing for no data and a dot for a single reading", () => {
    expect(sparklineSvg([])).toBe("");
    expect(sparklineSvg([40])).toContain("<circle");
  });

  it("draws a green line when the score is falling, which means improving", () => {
    expect(sparklineSvg([80, 60, 30])).toContain("#2F6B36");
  });

  it("draws a red line when the score is climbing", () => {
    expect(sparklineSvg([20, 45, 70])).toContain("#9B2C2C");
  });

  it("produces valid inline SVG with no external dependency", () => {
    const svg = sparklineSvg([70, 50, 30, 20]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("polyline");
    expect(svg).not.toContain("http");
  });
});

describe("describeImprovement", () => {
  it("waits for a second reading before claiming a trend", () => {
    const result = describeImprovement(60, 60, 1);
    expect(result.direction).toBe("insufficient");
    expect(result.improvement).toBeNull();
  });

  it("reports an improvement in points and percent", () => {
    const result = describeImprovement(80, 20, 4);
    expect(result.direction).toBe("improved");
    expect(result.improvement).toBe(60);
    expect(result.improvementPercent).toBe(75);
    expect(result.headline).toMatch(/75%/);
  });

  it("flags a regression rather than hiding it", () => {
    const result = describeImprovement(20, 55, 3);
    expect(result.direction).toBe("worsened");
    expect(result.headline).toMatch(/regressed/i);
  });

  it("treats small movement as steady", () => {
    expect(describeImprovement(40, 39, 3).direction).toBe("unchanged");
  });
});

describe("isDueForCheck", () => {
  const site = (overrides: Partial<TrackedSite>): TrackedSite =>
    ({ id: 1, active: true, cadence: "monthly", lastCheckedAt: null, ...overrides }) as TrackedSite;

  it("is due when never checked", () => {
    expect(isDueForCheck(site({}))).toBe(true);
  });

  it("is never due when tracking is switched off", () => {
    expect(isDueForCheck(site({ active: false }))).toBe(false);
  });

  it("respects the cadence", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    expect(isDueForCheck(site({ cadence: "weekly", lastCheckedAt: twoWeeksAgo }))).toBe(true);
    expect(isDueForCheck(site({ cadence: "monthly", lastCheckedAt: twoWeeksAgo }))).toBe(false);
    expect(isDueForCheck(site({ cadence: "quarterly", lastCheckedAt: twoWeeksAgo }))).toBe(false);
  });
});
