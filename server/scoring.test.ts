import { describe, expect, it } from "vitest";
import { estimateDealBand, matchIcp, scoreProspect } from "./scoring";

describe("scoreProspect", () => {
  it("ranks proven demand with no website as a prime opportunity", () => {
    const result = scoreProspect({
      hasWebsite: false,
      listingComplete: true,
      hasPublicContact: true,
      rating: 4.7,
      reviewCount: 180,
      reviewVelocity: 6,
    });

    expect(result.band).toBe("prime");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.gapIndex).toBeGreaterThan(result.demandIndex - 40);
  });

  it("refuses to rank a business highly when demand is absent", () => {
    const noDemand = scoreProspect({
      hasWebsite: false,
      listingComplete: false,
      hasPublicContact: false,
      rating: 2.0,
      reviewCount: 0,
      reviewVelocity: 0,
    });

    expect(noDemand.demandIndex).toBeLessThan(20);
    expect(noDemand.score).toBeLessThanOrEqual(30);
  });

  it("refuses to rank a thriving business with a healthy site highly", () => {
    const noGap = scoreProspect({
      hasWebsite: true,
      websiteReachable: true,
      decayScore: 5,
      mobileFriendly: true,
      secure: true,
      listingComplete: true,
      hasPublicContact: true,
      rating: 4.8,
      reviewCount: 400,
      reviewVelocity: 9,
    });

    expect(noGap.gapIndex).toBeLessThan(20);
    expect(noGap.score).toBeLessThanOrEqual(25);
  });

  it("reports confidence from observed inputs only and names what is missing", () => {
    const sparse = scoreProspect({ hasWebsite: false });
    const full = scoreProspect({
      hasWebsite: false,
      mobileFriendly: false,
      secure: false,
      listingComplete: true,
      hasPublicContact: true,
      rating: 4.5,
      reviewCount: 90,
      reviewVelocity: 4,
      hiringNow: true,
      runningAds: false,
      recentlyOpened: false,
    });

    expect(sparse.confidence).toBeLessThan(full.confidence);
    expect(sparse.missingInputs.length).toBeGreaterThan(0);
    expect(full.factors.every(factor => factor.evidence.length > 0)).toBe(true);
  });

  it("never fabricates evidence for an unobserved factor", () => {
    const result = scoreProspect({ hasWebsite: false });
    const unobserved = result.factors.filter(factor => !factor.observed);
    expect(unobserved.length).toBeGreaterThan(0);
    for (const factor of unobserved) {
      expect(factor.evidence).toContain("Not observed");
    }
  });
});

describe("estimateDealBand", () => {
  it("scales with market, category and gap, and always states its uncertainty", () => {
    const us = estimateDealBand({ category: "law firm", country: "United States", gapScore: 80, hasWebsite: false });
    const ro = estimateDealBand({ category: "cafe", country: "Romania", gapScore: 40, hasWebsite: true });

    expect(us.low).toBeGreaterThan(ro.low);
    expect(us.high).toBeGreaterThan(us.low);
    expect(us.caveat).toMatch(/no access to this company's budget/i);
    expect(us.basis.length).toBeGreaterThan(0);
  });

  it("falls back to a conservative multiplier for an unlisted country", () => {
    const known = estimateDealBand({ country: "United States" });
    const unknown = estimateDealBand({ country: "Nowhereland" });
    expect(unknown.low).toBeLessThan(known.low);
    expect(unknown.low).toBeGreaterThan(0);
  });
});

describe("matchIcp", () => {
  it("scores against only the criteria that were actually set", () => {
    const match = matchIcp(
      { category: "Dentist", country: "United States", region: "Americas", gapScore: 72, rating: 4.6, reviewCount: 120 },
      { industries: ["dentist"], countries: ["United States"], minGapScore: 60 },
    );
    expect(match.verdict).toBe("on-profile");
    expect(match.matched.length).toBe(3);
    expect(match.missed).toHaveLength(0);
  });

  it("returns a neutral score when no criteria are configured", () => {
    const match = matchIcp({ category: "Cafe", country: "Spain" }, {});
    expect(match.score).toBe(50);
  });

  it("marks a prospect off-profile when the important criteria miss", () => {
    const match = matchIcp(
      { category: "Bakery", country: "Poland", region: "Europe", gapScore: 20 },
      { industries: ["law firm"], countries: ["United States"], minGapScore: 70 },
    );
    expect(match.verdict).toBe("off-profile");
    expect(match.missed.length).toBeGreaterThan(0);
  });
});
