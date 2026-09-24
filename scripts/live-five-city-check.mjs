const cities = [
  ["London", "United Kingdom"],
  ["Paris", "France"],
  ["Berlin", "Germany"],
  ["Madrid", "Spain"],
  ["Amsterdam", "Netherlands"],
];
const startedAt = performance.now();
const timeoutMs = 10_000;
const userAgent = "Finderviews/1.0 (public business research; https://finderviews.online)";

async function search([city, country]) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: `restaurant ${city} ${country}`, limit: "50" })}`, { headers: { Accept: "application/json", "User-Agent": userAgent }, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return { city, country, ok: response.ok && Array.isArray(payload.features), status: response.status, records: payload.features?.length || 0, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { city, country, ok: false, status: null, records: 0, latencyMs: Math.round(performance.now() - started), error: error?.name || String(error) };
  } finally { clearTimeout(timer); }
}

const results = await Promise.all(cities.map(search));
const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.ceil((p / 100) * latencies.length) - 1)];
console.log(JSON.stringify({
  concurrency: cities.length,
  wallClockMs: Math.round(performance.now() - startedAt),
  completed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  rateLimited: results.filter((r) => r.status === 429).length,
  serviceUnavailable: results.filter((r) => r.status === 503).length,
  totalRecords: results.reduce((sum, r) => sum + r.records, 0),
  p50Ms: percentile(50),
  p95Ms: percentile(95),
  p99Ms: percentile(99),
  maxMs: latencies.at(-1),
  results,
}, null, 2));
if (results.some((r) => !r.ok)) process.exitCode = 1;
