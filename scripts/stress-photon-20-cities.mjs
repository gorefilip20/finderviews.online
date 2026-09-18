const cities = [
  ["Paris", "France"], ["Berlin", "Germany"], ["London", "United Kingdom"], ["Madrid", "Spain"],
  ["Rome", "Italy"], ["Amsterdam", "Netherlands"], ["Vienna", "Austria"], ["Brussels", "Belgium"],
  ["Dublin", "Ireland"], ["Prague", "Czechia"], ["Lisbon", "Portugal"], ["Warsaw", "Poland"],
  ["Budapest", "Hungary"], ["Copenhagen", "Denmark"], ["Stockholm", "Sweden"], ["Oslo", "Norway"],
  ["Helsinki", "Finland"], ["Athens", "Greece"], ["Zagreb", "Croatia"], ["Bucharest", "Romania"],
];
const rounds = 3;
const pauseMs = 5000;
const timeoutMs = 10000;
const userAgent = "Finderviews/1.0 (public business research; https://finderviews.online)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function search([city, country], round) {
  const started = performance.now();
  const url = `https://photon.komoot.io/api/?${new URLSearchParams({ q: `restaurant ${city} ${country}`, limit: "50" })}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": userAgent }, signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}
    const ok = response.ok && Array.isArray(payload?.features);
    return { round, city, country, ok, status: response.status, elapsedMs: Math.round(performance.now() - started), records: payload?.features?.length || 0, bytes: text.length, rateLimited: response.status === 429 };
  } catch (error) {
    return { round, city, country, ok: false, status: null, elapsedMs: Math.round(performance.now() - started), records: 0, bytes: 0, error: error?.name || String(error), rateLimited: false };
  } finally { clearTimeout(timer); }
}

const allResults = [];
const startedAt = performance.now();
for (let round = 1; round <= rounds; round++) {
  const results = await Promise.all(cities.map((city) => search(city, round)));
  allResults.push(...results);
  if (round < rounds) await sleep(pauseMs);
}

const latencies = allResults.map((r) => r.elapsedMs).sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.ceil((p / 100) * latencies.length) - 1)];
const byRound = Array.from({ length: rounds }, (_, index) => {
  const results = allResults.filter((r) => r.round === index + 1);
  const values = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
  return {
    round: index + 1,
    completed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    rateLimited: results.filter((r) => r.rateLimited).length,
    statuses: Object.fromEntries(Object.entries(Object.groupBy(results, (r) => String(r.status))).map(([status, rows]) => [status, rows.length])),
    records: results.reduce((sum, r) => sum + r.records, 0),
    wallClockMs: Math.max(...values),
    averageLatencyMs: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
    p95LatencyMs: values[Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)],
  };
});

console.log(JSON.stringify({
  concurrency: cities.length,
  rounds,
  requests: allResults.length,
  pauseMs,
  totalWallClockMs: Math.round(performance.now() - startedAt),
  completed: allResults.filter((r) => r.ok).length,
  failed: allResults.filter((r) => !r.ok).length,
  rateLimited: allResults.filter((r) => r.rateLimited).length,
  totalRecords: allResults.reduce((sum, r) => sum + r.records, 0),
  averageLatencyMs: Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length),
  p50LatencyMs: percentile(50),
  p95LatencyMs: percentile(95),
  maxLatencyMs: latencies.at(-1),
  byRound,
  results: allResults,
}, null, 2));
