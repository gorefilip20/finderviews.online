import { describe, expect, it } from "vitest";
import { assertEligibleMarket, buildDedupeKey, complementsFor, computeVelocity } from "./discovery";

describe("buildDedupeKey", () => {
  it("collapses legal suffixes and punctuation so one business is one record", () => {
    const a = buildDedupeKey("The Cedar & Loom Goods Ltd", "Austin, Texas");
    const b = buildDedupeKey("Cedar and Loom Goods", "austin texas");
    expect(a).toBe(b);
  });

  it("keeps businesses of the same name in different places apart", () => {
    expect(buildDedupeKey("Rosa's Kitchen", "Austin")).not.toBe(buildDedupeKey("Rosa's Kitchen", "Dallas"));
  });

  it("stays within the indexed column length", () => {
    const key = buildDedupeKey("x".repeat(400), "y".repeat(400));
    expect(key.length).toBeLessThanOrEqual(180);
  });
});

describe("assertEligibleMarket", () => {
  it("permits every covered region now that coverage is worldwide", () => {
    expect(() => assertEligibleMarket("United States", "Americas")).not.toThrow();
    expect(() => assertEligibleMarket("Japan", "Asia")).not.toThrow();
    expect(() => assertEligibleMarket("Nigeria", "Africa")).not.toThrow();
    expect(() => assertEligibleMarket("South Africa", "Africa")).not.toThrow();
    expect(() => assertEligibleMarket("Australia", "Oceania")).not.toThrow();
  });

  it("rejects a country Finder does not recognise", () => {
    expect(() => assertEligibleMarket("Nowhereland", "Europe")).toThrow(/does not recognise/i);
  });

  it("catches a country and region that do not agree, so the wrong scope is never searched", () => {
    expect(() => assertEligibleMarket("Nigeria", "Americas")).toThrow(/Nigeria is in Africa, not Americas/);
    expect(() => assertEligibleMarket("Japan", "Europe")).toThrow(/Japan is in Asia, not Europe/);
  });
});

describe("computeVelocity", () => {
  const now = new Date("2026-08-29T00:00:00Z");

  it("reports nothing without prior observations, rather than guessing", () => {
    expect(computeVelocity(undefined, { reviewCount: 100, observedAt: now })).toBeUndefined();
    expect(computeVelocity([], { reviewCount: 100, observedAt: now })).toBeUndefined();
  });

  it("refuses to report a figure from observations that are too close together", () => {
    const history = [{ reviewCount: 90, observedAt: new Date("2026-08-27T00:00:00Z") }];
    expect(computeVelocity(history, { reviewCount: 100, observedAt: now })).toBeUndefined();
  });

  it("computes reviews per month once there is enough separation", () => {
    const history = [{ reviewCount: 60, observedAt: new Date("2026-05-31T00:00:00Z") }];
    const velocity = computeVelocity(history, { reviewCount: 120, observedAt: now });
    expect(velocity).toBeGreaterThan(15);
    expect(velocity).toBeLessThan(25);
  });

  it("returns nothing when the count went backwards, which means the data changed shape", () => {
    const history = [{ reviewCount: 200, observedAt: new Date("2026-05-31T00:00:00Z") }];
    expect(computeVelocity(history, { reviewCount: 100, observedAt: now })).toBeUndefined();
  });
});

describe("complementsFor", () => {
  it("suggests non-competing categories that share a customer", () => {
    const wedding = complementsFor("wedding photographer");
    expect(wedding).toContain("florist");
    expect(wedding).not.toContain("wedding photographer");
  });

  it("always returns something usable for an unmapped category", () => {
    expect(complementsFor("artisan candle maker").length).toBeGreaterThan(0);
  });
});
