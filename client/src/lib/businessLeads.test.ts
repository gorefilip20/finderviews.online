import { describe, expect, it } from "vitest";
import { mapBusinessRecords, mapNominatimRecords, shouldUseWebsiteFallback } from "./businessLeads";

const options = {
  country: "United States",
  marketLabel: "Dallas, United States",
  category: "Restaurant",
  presenceMode: "No website or limited presence" as const,
};

describe("business lead search mapping", () => {
  it("keeps businesses without a website and preserves public contact fields", () => {
    const leads = mapBusinessRecords([
      {
        id: 101,
        type: "node",
        lat: 32.78,
        lon: -96.8,
        tags: {
          name: "Krispy Kreme",
          amenity: "restaurant",
          "addr:city": "Dallas",
          phone: "+1 214 555 0100",
          email: "hello@example.test",
        },
      },
    ], options);

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      name: "Krispy Kreme",
      hasWebsite: false,
      presence: "No website listed",
      phone: "+1 214 555 0100",
      email: "hello@example.test",
      contactSearchUrl: expect.stringContaining("official%20contact"),
    });
  });

  it("excludes businesses that already have a website in no-website mode", () => {
    const leads = mapBusinessRecords([
      {
        id: 102,
        type: "way",
        center: { lat: 32.79, lon: -96.81 },
        tags: { name: "Already Online Cafe", amenity: "cafe", website: "https://example.test" },
      },
    ], { ...options, presenceMode: "No listed website" });

    expect(leads).toEqual([]);
  });

  it("uses the website-directory fallback when the primary provider has no usable records", () => {
    expect(shouldUseWebsiteFallback([])).toBe(true);
    expect(shouldUseWebsiteFallback([{ id: "x", name: "Found", category: "shop", location: "Dallas", phone: "No public phone listed", verified: true, hasWebsite: false, score: 80, growthPath: "Review presence and propose next step", presence: "No website listed" }])).toBe(false);

    const fallbackLeads = mapNominatimRecords([
      {
        osm_id: 301,
        osm_type: "node",
        lat: "32.781",
        lon: "-96.801",
        display_name: "Fallback Bakery, Dallas, Texas",
        extratags: { phone: "+1 214 555 0111" },
        address: { city: "Dallas", state: "Texas", road: "Main Street" },
      },
    ], options);

    expect(fallbackLeads).toHaveLength(1);
    expect(fallbackLeads[0]).toMatchObject({
      name: "Fallback Bakery",
      hasWebsite: false,
      phone: "+1 214 555 0111",
      location: "Dallas, Texas, United States",
    });
  });
});
