import { describe, expect, it } from "vitest";
import {
  MARKET_COVERAGE,
  SUPPORTED_COUNTRY_COUNT,
  SUPPORTED_REGIONS,
  isExcludedMarket,
  isSupportedCountry,
  regionForCountry,
} from "./marketCoverage";
import { complianceFor, COMPLIANCE_DISCLAIMER } from "./compliance";

describe("market coverage", () => {
  it("covers all five regions the product now sells into", () => {
    expect(SUPPORTED_REGIONS).toEqual(["Europe", "Americas", "Africa", "Asia", "Oceania"]);
  });

  it("includes the African markets that were previously excluded", () => {
    for (const country of ["Nigeria", "Kenya", "South Africa", "Ghana", "Egypt", "Morocco"]) {
      expect(isSupportedCountry(country)).toBe(true);
      expect(regionForCountry(country)).toBe("Africa");
    }
  });

  it("no longer excludes any market", () => {
    for (const country of ["Nigeria", "Kenya", "South Africa", "United States", "Japan"]) {
      expect(isExcludedMarket(country)).toBe(false);
    }
  });

  it("resolves a country to exactly one region", () => {
    expect(regionForCountry("United States")).toBe("Americas");
    expect(regionForCountry("Australia")).toBe("Oceania");
    expect(regionForCountry("Hong Kong")).toBe("Asia");
    expect(regionForCountry("nowhereland")).toBeUndefined();
  });

  it("matches on country name regardless of casing or padding", () => {
    expect(regionForCountry("  nIgErIa ")).toBe("Africa");
  });

  it("lists no country in two regions at once", () => {
    const all = SUPPORTED_REGIONS.flatMap(region => MARKET_COVERAGE[region]);
    expect(new Set(all).size).toBe(all.length);
    expect(SUPPORTED_COUNTRY_COUNT).toBe(all.length);
  });
});

describe("complianceFor", () => {
  it("returns the permissive US regime", () => {
    const profile = complianceFor("United States");
    expect(profile.regime).toBe("CAN-SPAM Act");
    expect(profile.level).toBe("opt-out");
  });

  it("returns GDPR for EU members and the UK's own variant", () => {
    expect(complianceFor("Germany").regime).toBe("GDPR / ePrivacy");
    expect(complianceFor("United Kingdom").regime).toBe("UK GDPR / PECR");
    expect(complianceFor("France").level).toBe("mixed");
  });

  it("returns the consent-based regimes where they apply", () => {
    expect(complianceFor("Canada").level).toBe("opt-in");
    expect(complianceFor("South Africa").regime).toBe("POPIA");
    expect(complianceFor("China").level).toBe("opt-in");
    expect(complianceFor("Australia").level).toBe("opt-in");
  });

  it("names the African statutes rather than lumping the continent together", () => {
    expect(complianceFor("Nigeria").regime).toMatch(/Nigeria Data Protection Act/);
    expect(complianceFor("Kenya").regime).toMatch(/Data Protection Act 2019/);
    expect(complianceFor("Ghana").regime).toMatch(/Data Protection Act 2012/);
  });

  it("falls back to the strictest posture for an unrecognised market", () => {
    const profile = complianceFor("Nowhereland");
    expect(profile.level).toBe("opt-in");
    expect(profile.rule).toMatch(/strictest/i);
  });

  it("always carries requirements and a disclaimer the UI can show", () => {
    for (const country of ["United States", "Nigeria", "Germany", "Japan"]) {
      expect(complianceFor(country).requirements.length).toBeGreaterThan(0);
    }
    expect(COMPLIANCE_DISCLAIMER).toMatch(/not legal advice/i);
  });
});
