import { describe, expect, it } from "vitest";
import { csvCell, toCsv, EXPORT_COLUMNS } from "./exporting";
import type { Prospect } from "../drizzle/schema";

const row = (overrides: Partial<Prospect> = {}) =>
  ({
    name: "Cedar Goods",
    category: "Home goods",
    country: "United States",
    city: "Austin",
    address: "South Congress",
    phone: "+1 512 555 0138",
    website: null,
    listingUrl: "https://maps.example/1",
    rating: "4.7",
    reviewCount: 180,
    signalType: "rising",
    signalSummary: "Rated 4.7 with no website listed.",
    gapScore: 78,
    dealBand: "standard",
    dealLow: 3000,
    dealHigh: 6800,
    source: "Google Places",
    sourceUrl: "https://maps.example/1",
    observedAt: new Date("2026-08-29T10:00:00Z"),
    ...overrides,
  }) as unknown as Prospect;

describe("csvCell", () => {
  it("neutralises spreadsheet formula injection from untrusted business names", () => {
    expect(csvCell("=cmd|'/c calc'!A1")).toBe(`"'=cmd|'/c calc'!A1"`);
    expect(csvCell("+1234")).toBe(`"'+1234"`);
    expect(csvCell("-1+1")).toBe(`"'-1+1"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
  });

  it("escapes embedded quotes so a cell cannot break the row", () => {
    expect(csvCell('He said "hello"')).toBe('"He said ""hello"""');
  });

  it("renders empty for null and undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("writes a header matching the exported columns", () => {
    const csv = toCsv([row()]);
    expect(csv.split("\n")[0]).toBe(EXPORT_COLUMNS.join(","));
  });

  it("keeps one line per prospect", () => {
    const csv = toCsv([row(), row({ name: "Orchard Auto" })]);
    expect(csv.trim().split("\n")).toHaveLength(3);
    expect(csv).toContain("Orchard Auto");
  });

  it("produces a header-only file for an empty result set", () => {
    expect(toCsv([]).trim()).toBe(EXPORT_COLUMNS.join(","));
  });
});
