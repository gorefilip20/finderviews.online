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

type DirectoryFetch = typeof fetch;

export async function fetchBusinessDirectoryFallback(
  term: string,
  marketLabel: string,
  fetchImpl: DirectoryFetch = fetch,
): Promise<OverpassData> {
  const params = new URLSearchParams({ q: `${term} in ${marketLabel}`, format: "json", limit: "50", addressdetails: "1", extratags: "1", namedetails: "1" });
  let directoryData: Array<{ osm_id: number; osm_type: string; lat: string; lon: string; display_name?: string; name?: string; extratags?: Record<string, string>; address?: Record<string, string> }> = [];
  try {
    const response = await fetchImpl(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (response.ok) directoryData = await response.json() as typeof directoryData;
  } catch { /* use Photon below */ }

  if (directoryData.length === 0) {
    try {
      const response = await fetchImpl(`https://photon.komoot.io/api/?${new URLSearchParams({ q: `${term} ${marketLabel}`, limit: "50" })}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
      const payload = await response.json() as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }> };
      directoryData = (payload.features || []).flatMap((feature, index) => {
        const coordinates = feature.geometry?.coordinates;
        const properties = feature.properties || {};
        if (!coordinates || coordinates.length < 2 || !properties.name) return [];
        return [{ osm_id: index + 1, osm_type: "node", lat: String(coordinates[1]), lon: String(coordinates[0]), name: properties.name, display_name: properties.name, extratags: {}, address: { city: properties.city || properties.locality || "", state: properties.state || "", road: properties.street || "" } }];
      });
    } catch { /* caller will show the provider-unavailable error */ }
  }

  return { elements: directoryData.map((item) => ({ id: item.osm_id, type: item.osm_type.toLowerCase(), lat: Number.parseFloat(item.lat), lon: Number.parseFloat(item.lon), tags: { name: item.name || item.display_name?.split(",")[0] || term, ...(item.extratags || {}), "addr:city": item.address?.city || item.address?.town || item.address?.village || "", "addr:state": item.address?.state || "", "addr:street": item.address?.road || "" } })) };
}

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
