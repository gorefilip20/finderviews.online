import { describe, expect, it } from "vitest";
import { OVERPASS_ENDPOINTS, fetchOverpassData } from "./businessProvider";

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
});
