const cities = [
  ["Paris", "France"], ["London", "United Kingdom"], ["Berlin", "Germany"], ["Madrid", "Spain"], ["Rome", "Italy"],
  ["Amsterdam", "Netherlands"], ["Vienna", "Austria"], ["Brussels", "Belgium"], ["Dublin", "Ireland"], ["Prague", "Czechia"],
  ["Lisbon", "Portugal"], ["Warsaw", "Poland"], ["Budapest", "Hungary"], ["Copenhagen", "Denmark"], ["Stockholm", "Sweden"],
];
const caps = [8, 10];
const repeats = 3;
const timeoutMs = 8000;
const maxAttempts = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const userAgent = "Finderviews/1.0 (public business research; https://finderviews.online)";

async function run(cap, repeat) {
  let active = 0;
  let peak = 0;
  let retries = 0;
  const queue = [];
  const enqueue = (task) => new Promise((resolve, reject) => {
    queue.push(() => task().then(resolve, reject).finally(() => { active -= 1; drain(); }));
    drain();
  });
  function drain() {
    while (active < cap && queue.length) { active += 1; peak = Math.max(peak, active); queue.shift()(); }
  }
  async function search([city, country]) {
    const started = performance.now();
    return enqueue(async () => {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: `restaurant ${city} ${country}`, limit: "50" })}`, { headers: { Accept: "application/json", "User-Agent": userAgent }, signal: controller.signal });
          const payload = await response.json().catch(() => ({}));
          if (response.status === 503 && attempt < maxAttempts) { retries += 1; await sleep(250 * (2 ** (attempt - 1))); continue; }
          return { city, ok: response.ok && Array.isArray(payload.features), status: response.status, records: payload.features?.length || 0, elapsedMs: Math.round(performance.now() - started) };
        } catch (error) {
          return { city, ok: false, status: null, records: 0, elapsedMs: Math.round(performance.now() - started), error: error?.name || String(error) };
        } finally { clearTimeout(timer); }
      }
    });
  }
  const started = performance.now();
  const results = await Promise.all(cities.map(search));
  const latencies = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
  return { cap, repeat, wallClockMs: Math.round(performance.now() - started), peak, completed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, rateLimited: results.filter((r) => r.status === 429).length, serviceUnavailable: results.filter((r) => r.status === 503).length, retries, records: results.reduce((sum, r) => sum + r.records, 0), averageLatencyMs: Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length), p95LatencyMs: latencies[Math.ceil(latencies.length * 0.95) - 1], results };
}

const results = [];
for (const cap of caps) {
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    results.push(await run(cap, repeat));
    await sleep(2500);
  }
}
const summary = caps.map((cap) => {
  const rows = results.filter((r) => r.cap === cap);
  return { cap, runs: rows.length, averageWallClockMs: Math.round(rows.reduce((sum, r) => sum + r.wallClockMs, 0) / rows.length), minWallClockMs: Math.min(...rows.map((r) => r.wallClockMs)), maxWallClockMs: Math.max(...rows.map((r) => r.wallClockMs)), completed: rows.reduce((sum, r) => sum + r.completed, 0), failed: rows.reduce((sum, r) => sum + r.failed, 0), rateLimited: rows.reduce((sum, r) => sum + r.rateLimited, 0), serviceUnavailable: rows.reduce((sum, r) => sum + r.serviceUnavailable, 0), retries: rows.reduce((sum, r) => sum + r.retries, 0), averageLatencyMs: Math.round(rows.reduce((sum, r) => sum + r.averageLatencyMs, 0) / rows.length), averageP95LatencyMs: Math.round(rows.reduce((sum, r) => sum + r.p95LatencyMs, 0) / rows.length) };
});
console.log(JSON.stringify({ workloadCities: cities.length, repeats, summary, runs: results.map(({ results: _details, ...metrics }) => metrics) }, null, 2));
if (results.some((r) => r.failed > 0)) process.exitCode = 1;
