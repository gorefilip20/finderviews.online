import { describe, expect, it } from "vitest";
import { consume, sweep } from "./ratelimit";

describe("consume", () => {
  it("allows requests up to the limit and then refuses", () => {
    const key = `test-${Math.random()}`;
    expect(consume(key, 3, 60_000).ok).toBe(true);
    expect(consume(key, 3, 60_000).ok).toBe(true);
    expect(consume(key, 3, 60_000).ok).toBe(true);

    const blocked = consume(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps separate callers independent", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    consume(a, 1, 60_000);
    expect(consume(a, 1, 60_000).ok).toBe(false);
    expect(consume(b, 1, 60_000).ok).toBe(true);
  });

  it("opens a fresh window once the old one has expired", () => {
    const key = `expiry-${Math.random()}`;
    expect(consume(key, 1, 1).ok).toBe(true);
    expect(consume(key, 1, 1).ok).toBe(false);
    // The window is 1ms, so by the next tick it has lapsed.
    return new Promise<void>(resolve =>
      setTimeout(() => {
        expect(consume(key, 1, 1).ok).toBe(true);
        resolve();
      }, 5),
    );
  });
});

describe("sweep", () => {
  it("drops lapsed buckets so the map cannot grow without bound", () => {
    const key = `sweep-${Math.random()}`;
    consume(key, 1, 1);
    sweep(Date.now() + 10_000);
    expect(consume(key, 1, 60_000).ok).toBe(true);
  });
});
