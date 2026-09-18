export const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

export const OVERPASS_TIMEOUT_MS = 8_000;

export type OverpassElement = {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type OverpassData = { elements: OverpassElement[] };

export async function fetchOverpassData(
  query: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = OVERPASS_TIMEOUT_MS,
): Promise<OverpassData | null> {
  const requests = OVERPASS_ENDPOINTS.map(async (endpoint) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Overpass ${response.status}`);
      const payload = await response.json() as Partial<OverpassData>;
      if (!Array.isArray(payload.elements)) throw new Error("Overpass returned an invalid payload");
      return payload as OverpassData;
    } finally {
      clearTimeout(timer);
    }
  });

  try {
    return await Promise.any(requests);
  } catch {
    return null;
  }
}
