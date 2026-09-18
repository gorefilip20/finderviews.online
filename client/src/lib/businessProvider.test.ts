import { describe, expect, it } from "vitest";
import { OVERPASS_ENDPOINTS, PHOTON_CONCURRENCY_LIMIT, fetchBusinessDirectoryFallback, fetchOverpassData, fetchPhotonData } from "./businessProvider";

describe("business provider requests", () => {
  it("returns the first healthy mirror without waiting for a slow mirror", async () => {
    const started: string[] = [];
    const fetchMock: typeof fetch = async (endpoint) => {
      started.push(String(endpoint));
      if (String(endpoint) === OVERPASS_ENDPOINTS[1]) {
        return new Response(JSON.stringify({ elements: [{ id: 1, type: "node", tags: { name: "Paris Cafe" } }] }), { status: 200 });
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
      throw new Error("slow mirror");
    };

    const result = await fetchOverpassData("[out:json];", fetchMock, 100);

    expect(result?.elements[0]?.tags?.name).toBe("Paris Cafe");
    expect(started).toEqual(expect.arrayContaining([...OVERPASS_ENDPOINTS]));
  });

  it("returns null when every mirror fails within the configured bound", async () => {
    const fetchMock: typeof fetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("provider unavailable");
    };

    await expect(fetchOverpassData("[out:json];", fetchMock, 20)).resolves.toBeNull();
  });

  it("falls back to Photon when Nominatim returns no European businesses", async () => {
    const fetchMock: typeof fetch = async (url) => {
      if (String(url).includes("nominatim")) return new Response("[]", { status: 200 });
      return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [2.3522, 48.8566] }, properties: { name: "Paris Cafe", city: "Paris", state: "Île-de-France", street: "Rue de Rivoli", housenumber: "10", postcode: "75001", phone: "+33 1 23 45 67 89", email: "hello@pariscafe.test", website: "https://pariscafe.test" } }] }), { status: 200 });
    };

    const result = await fetchBusinessDirectoryFallback("Restaurant", "Paris, France", fetchMock);

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]).toMatchObject({ type: "node", lat: 48.8566, lon: 2.3522, tags: { name: "Paris Cafe", phone: "+33 1 23 45 67 89", email: "hello@pariscafe.test", website: "https://pariscafe.test", "addr:city": "Paris", "addr:housenumber": "10", "addr:postcode": "75001" } });
  });

  it("retries HTTP 503 with exponential backoff before succeeding", async () => {
    let calls = 0;
    const fetchMock: typeof fetch = async () => {
      calls += 1;
      if (calls < 3) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({ features: [{ properties: { name: "Berlin Cafe" } }] }), { status: 200 });
    };

    const result = await fetchPhotonData("restaurant Berlin Germany", fetchMock, { backoffBaseMs: 1, timeoutMs: 50 });

    expect(calls).toBe(3);
    expect(result?.features[0]?.properties?.name).toBe("Berlin Cafe");
  });

  it("never runs more than eight Photon requests at once", async () => {
    let active = 0;
    let peak = 0;
    const fetchMock: typeof fetch = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    };

    await Promise.all(Array.from({ length: 16 }, (_, index) => fetchPhotonData(`city-${index}`, fetchMock, { timeoutMs: 50 })));

    expect(peak).toBe(PHOTON_CONCURRENCY_LIMIT);
  });
});
