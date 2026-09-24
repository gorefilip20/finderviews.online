import { describe, expect, it } from "vitest";
import { enrichBusinessLeadContacts } from "./contactEnrichment";

const lead = {
  id: "osm-node-1",
  name: "Berlin Cafe",
  category: "cafe",
  location: "Berlin, Germany",
  phone: "No public phone listed",
  verified: true,
  hasWebsite: false,
  score: 80,
  growthPath: "Review presence and propose next step",
  presence: "No website listed" as const,
  position: { lat: 52.52, lng: 13.405 },
};

describe("public contact enrichment", () => {
  it("fills missing phone, email, website, address, and source from Nominatim metadata", async () => {
    const fetchMock: typeof fetch = async () => new Response(JSON.stringify([{
      osm_id: 99,
      osm_type: "node",
      extratags: { phone: "+49 30 123", email: "hello@berlin.test", website: "https://berlin.test" },
      address: { house_number: "10", road: "Main Street", postcode: "10115", city: "Berlin" },
    }]), { status: 200 });

    const [result] = await enrichBusinessLeadContacts([lead], fetchMock, { minIntervalMs: 0 });
    expect(result).toMatchObject({
      phone: "+49 30 123",
      email: "hello@berlin.test",
      website: "https://berlin.test",
      address: "10, Main Street, 10115, Berlin",
      source: "https://www.openstreetmap.org/node/99",
      contactSource: "Nominatim public business metadata",
      contactEnriched: true,
    });
  });

  it("does not overwrite existing contact fields", async () => {
    const existing = { ...lead, phone: "+49 30 999", email: "existing@berlin.test", website: "https://existing.test" };
    let calls = 0;
    const fetchMock: typeof fetch = async () => { calls += 1; return new Response("[]", { status: 200 }); };
    const [result] = await enrichBusinessLeadContacts([existing], fetchMock, { minIntervalMs: 0 });
    expect(calls).toBe(0);
    expect(result.phone).toBe("+49 30 999");
    expect(result.email).toBe("existing@berlin.test");
    expect(result.website).toBe("https://existing.test");
  });
});
