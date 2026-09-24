export const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;

export const OVERPASS_TIMEOUT_MS = 8_000;
export const PHOTON_CONCURRENCY_LIMIT = 10;
export const PHOTON_MAX_ATTEMPTS = 3;
export const PHOTON_BACKOFF_BASE_MS = 250;

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

let photonActive = 0;
const photonQueue: Array<() => void> = [];

function drainPhotonQueue() {
  while (photonActive < PHOTON_CONCURRENCY_LIMIT && photonQueue.length > 0) {
    photonActive += 1;
    photonQueue.shift()?.();
  }
}

export function enqueuePhoton<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    photonQueue.push(() => {
      task().then(resolve, reject).finally(() => {
        photonActive -= 1;
        drainPhotonQueue();
      });
    });
    drainPhotonQueue();
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchPhotonData(
  query: string,
  fetchImpl: DirectoryFetch = fetch,
  options: { maxAttempts?: number; backoffBaseMs?: number; timeoutMs?: number } = {},
): Promise<{ features: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }> } | null> {
  const maxAttempts = options.maxAttempts ?? PHOTON_MAX_ATTEMPTS;
  const backoffBaseMs = options.backoffBaseMs ?? PHOTON_BACKOFF_BASE_MS;
  const timeoutMs = options.timeoutMs ?? 8_000;

  return enqueuePhoton(async () => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`https://photon.komoot.io/api/?${new URLSearchParams({ q: query, limit: "50" })}`, {
          headers: {
            Accept: "application/json",
            "User-Agent": "Finderviews/1.0 (public business research; https://finderviews.online)",
          },
          signal: controller.signal,
        });
        if (response.status === 503 && attempt < maxAttempts) {
          await sleep(backoffBaseMs * (2 ** (attempt - 1)));
          continue;
        }
        if (!response.ok) return null;
        const payload = await response.json() as { features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }> };
        return { features: Array.isArray(payload.features) ? payload.features : [] };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  });
}

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
    const photonData = await fetchPhotonData(`${term} ${marketLabel}`, fetchImpl);
    directoryData = (photonData?.features || []).flatMap((feature, index) => {
      const coordinates = feature.geometry?.coordinates;
      const properties = feature.properties || {};
      if (!coordinates || coordinates.length < 2 || !properties.name) return [];
      return [{
        osm_id: Number(properties.osm_id) || index + 1,
        osm_type: String(properties.osm_type || "node"),
        lat: String(coordinates[1]),
        lon: String(coordinates[0]),
        name: properties.name,
        display_name: [properties.name, properties.street, properties.city, properties.state, properties.country].filter(Boolean).join(", "),
        extratags: Object.fromEntries([
          ["phone", properties.phone], ["email", properties.email], ["website", properties.website],
          ["contact:phone", properties["contact:phone"]], ["contact:email", properties["contact:email"]],
          ["contact:website", properties["contact:website"]], ["url", properties.url],
        ].filter(([, value]) => typeof value === "string" && value.length > 0) as Array<[string, string]>),
        address: {
          city: properties.city || properties.locality || "",
          state: properties.state || "",
          road: properties.street || "",
          house_number: properties.housenumber || "",
          postcode: properties.postcode || "",
        },
      }];
    });
  }

  return { elements: directoryData.map((item) => ({ id: item.osm_id, type: item.osm_type.toLowerCase(), lat: Number.parseFloat(item.lat), lon: Number.parseFloat(item.lon), tags: { name: item.name || item.display_name?.split(",")[0] || term, ...(item.extratags || {}), "addr:city": item.address?.city || item.address?.town || item.address?.village || "", "addr:state": item.address?.state || "", "addr:street": item.address?.road || "", "addr:housenumber": item.address?.house_number || "", "addr:postcode": item.address?.postcode || "" } })) };
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
          "User-Agent": "Finderviews/1.0 (public business research; https://finderviews.online)",
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
