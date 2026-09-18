const cities = [
  ["Paris", "France"],
  ["Berlin", "Germany"],
  ["London", "United Kingdom"],
  ["Madrid", "Spain"],
  ["Rome", "Italy"],
  ["Amsterdam", "Netherlands"],
  ["Vienna", "Austria"],
  ["Brussels", "Belgium"],
  ["Dublin", "Ireland"],
  ["Prague", "Czechia"],
];

const timeoutMs = 10_000;
const startedAt = performance.now();

async function run(city, country) {
  const started = performance.now();
  const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q: `restaurant ${city} ${country}`, limit: "50" })}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Finderviews/1.0 (public business research; https://finderviews.online)",
      },
      signal: controller.signal,
    });
    const payload = await response.json();
    const elapsedMs = Math.round(performance.now() - started);
    return {
      city,
      country,
      ok: response.ok && Array.isArray(payload.features),
      status: response.status,
      elapsedMs,
      records: Array.isArray(payload.features) ? payload.features.length : 0,
      bytes: JSON.stringify(payload).length,
    };
  } catch (error) {
    return { city, country, ok: false, elapsedMs: Math.round(performance.now() - started), records: 0, error: error?.name || String(error) };
  } finally {
    clearTimeout(timer);
  }
}

const results = await Promise.all(cities.map(([city, country]) => run(city, country)));
const elapsed = results.map((result) => result.elapsedMs).sort((a, b) => a - b);
const percentile = (p) => elapsed[Math.min(elapsed.length - 1, Math.ceil((p / 100) * elapsed.length) - 1)];
const summary = {
  concurrency: cities.length,
  wallClockMs: Math.round(performance.now() - startedAt),
  completed: results.filter((result) => result.ok).length,
  failed: results.filter((result) => !result.ok).length,
  totalRecords: results.reduce((sum, result) => sum + result.records, 0),
  averageLatencyMs: Math.round(elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length),
  minLatencyMs: elapsed[0],
  p50LatencyMs: percentile(50),
  p95LatencyMs: percentile(95),
  maxLatencyMs: elapsed.at(-1),
  averageRecordsPerCity: Number((results.reduce((sum, result) => sum + result.records, 0) / results.length).toFixed(1)),
  results,
};
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exitCode = 1;
