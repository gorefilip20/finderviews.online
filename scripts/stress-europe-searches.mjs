const cities = [
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Berlin", lat: 52.52, lon: 13.405 },
  { name: "London", lat: 51.5074, lon: -0.1278 },
];

const endpoints = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const timeoutMs = 8000;

function queryFor(city) {
  return `[out:json][timeout:8];(nwr["amenity"~"restaurant|cafe|fast_food|bar"](around:10000,${city.lat},${city.lon}););out center tags 50;`;
}

async function request(endpoint, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Finderviews/1.0 (public business research; https://finderviews.online)" },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok || !text.trim().startsWith("{")) return { endpoint, ok: false, ms: Math.round(performance.now() - started), status: response.status, contentType: response.headers.get("content-type"), prefix: text.slice(0, 80) };
    const payload = JSON.parse(text);
    return { endpoint, ok: true, ms: Math.round(performance.now() - started), count: Array.isArray(payload.elements) ? payload.elements.filter((x) => x.tags?.name).length : 0 };
  } catch (error) {
    return { endpoint, ok: false, ms: Math.round(performance.now() - started), error: error?.name || String(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function search(city) {
  const started = performance.now();
  const attempts = await Promise.all(endpoints.map((endpoint) => request(endpoint, queryFor(city))));
  const winner = attempts.find((result) => result.ok);
  if (winner) return { city: city.name, status: "overpass", ms: Math.round(performance.now() - started), records: winner.count, winner: winner.endpoint, attempts };

  const photonStart = performance.now();
  try {
    const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: `restaurant ${city.name}`, limit: "50" })}`, { signal: AbortSignal.timeout(8000) });
    const payload = await response.json();
    return { city: city.name, status: "photon-fallback", ms: Math.round(performance.now() - started), fallbackMs: Math.round(performance.now() - photonStart), records: payload.features?.length || 0, winner: "photon" , attempts };
  } catch (error) {
    return { city: city.name, status: "failed", ms: Math.round(performance.now() - started), records: 0, winner: null, error: error?.name || String(error), attempts };
  }
}

const started = performance.now();
const results = await Promise.all(cities.map(search));
const summary = {
  concurrency: cities.length,
  totalMs: Math.round(performance.now() - started),
  completed: results.filter((result) => result.status !== "failed").length,
  failed: results.filter((result) => result.status === "failed").length,
  results,
};
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exitCode = 1;
