const cities = [
  ["Paris", "France"], ["London", "United Kingdom"], ["Berlin", "Germany"], ["Madrid", "Spain"], ["Rome", "Italy"],
  ["Amsterdam", "Netherlands"], ["Vienna", "Austria"], ["Brussels", "Belgium"], ["Dublin", "Ireland"], ["Prague", "Czechia"],
  ["Lisbon", "Portugal"], ["Warsaw", "Poland"], ["Budapest", "Hungary"], ["Copenhagen", "Denmark"], ["Stockholm", "Sweden"],
];
const limit = 8;
const maxAttempts = 3;
const backoffBaseMs = 250;
const timeoutMs = 8000;
const queue = [];
let active = 0;
let peak = 0;
let retryCount = 0;
const events = [];

function drain() {
  while (active < limit && queue.length) {
    active += 1;
    peak = Math.max(peak, active);
    queue.shift()();
  }
}
function enqueue(task) {
  return new Promise((resolve, reject) => {
    queue.push(() => task().then(resolve, reject).finally(() => { active -= 1; drain(); }));
    drain();
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function search([city, country]) {
  const started = performance.now();
  return enqueue(async () => {
    const attempts = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptStarted = performance.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`https://photon.komoot.io/api/?${new URLSearchParams({ q: `restaurant ${city} ${country}`, limit: "50" })}`, {
          headers: { Accept: "application/json", "User-Agent": "Finderviews/1.0 (public business research; https://finderviews.online)" },
          signal: controller.signal,
        });
        const text = await response.text();
        let payload;
        try { payload = JSON.parse(text); } catch { payload = null; }
        const record = { attempt, status: response.status, ms: Math.round(performance.now() - attemptStarted) };
        attempts.push(record);
        if (response.status === 503 && attempt < maxAttempts) {
          retryCount += 1;
          const delayMs = backoffBaseMs * (2 ** (attempt - 1));
          events.push({ city, event: "503-backoff", attempt, delayMs });
          await sleep(delayMs);
          continue;
        }
        return { city, country, ok: response.ok && Array.isArray(payload?.features), status: response.status, records: payload?.features?.length || 0, elapsedMs: Math.round(performance.now() - started), attempts };
      } catch (error) {
        attempts.push({ attempt, error: error?.name || String(error), ms: Math.round(performance.now() - attemptStarted) });
        return { city, country, ok: false, status: null, records: 0, elapsedMs: Math.round(performance.now() - started), attempts };
      } finally { clearTimeout(timer); }
    }
  });
}

const started = performance.now();
const results = await Promise.all(cities.map(search));
const latencies = results.map((r) => r.elapsedMs).sort((a, b) => a - b);
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.ceil((p / 100) * latencies.length) - 1)];
const parisLondon = results.filter((r) => r.city === "Paris" || r.city === "London");
console.log(JSON.stringify({
  concurrencyRequested: cities.length,
  queueLimit: limit,
  peakActive: peak,
  totalWallClockMs: Math.round(performance.now() - started),
  completed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  rateLimited: results.filter((r) => r.status === 429).length,
  serviceUnavailable: results.filter((r) => r.status === 503).length,
  retries: retryCount,
  totalRecords: results.reduce((sum, r) => sum + r.records, 0),
  averageLatencyMs: Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length),
  p50LatencyMs: percentile(50),
  p95LatencyMs: percentile(95),
  maxLatencyMs: latencies.at(-1),
  parisLondon,
  events,
  results,
}, null, 2));
if (results.some((r) => !r.ok)) process.exitCode = 1;
