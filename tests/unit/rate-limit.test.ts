import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clearRateLimit,
  isRateLimited,
  recordFailure,
  resetRateLimits,
} from "@/lib/api/rate-limit";

const OPTIONS = { limit: 3, windowMs: 1000 };

describe("rate limiter", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests up to the limit and rejects the next one", () => {
    const now = 1_000_000;

    expect(checkRateLimit("a", OPTIONS, now).allowed).toBe(true);
    expect(checkRateLimit("a", OPTIONS, now).allowed).toBe(true);
    expect(checkRateLimit("a", OPTIONS, now).allowed).toBe(true);
    expect(checkRateLimit("a", OPTIONS, now).allowed).toBe(false);
  });

  it("counts each client separately", () => {
    const now = 1_000_000;

    for (let i = 0; i < 3; i += 1) checkRateLimit("a", OPTIONS, now);

    expect(checkRateLimit("a", OPTIONS, now).allowed).toBe(false);
    expect(checkRateLimit("b", OPTIONS, now).allowed).toBe(true);
  });

  it("allows again once the window has passed", () => {
    const now = 1_000_000;

    for (let i = 0; i < 3; i += 1) checkRateLimit("a", OPTIONS, now);
    expect(checkRateLimit("a", OPTIONS, now).allowed).toBe(false);

    expect(checkRateLimit("a", OPTIONS, now + OPTIONS.windowMs + 1).allowed).toBe(true);
  });
});

/**
 * The failure-counting primitives behind sign-in throttling. Time is injected,
 * so the window's expiry — which the route-level tests cannot wait for — is
 * asserted directly.
 */
describe("failure counting for sign-in", () => {
  const WINDOW = { limit: 3, windowMs: 15 * 60 * 1000 };
  const t0 = 5_000_000;

  beforeEach(() => {
    resetRateLimits();
  });

  it("blocks once the failures reach the limit, and not before", () => {
    recordFailure("k", WINDOW, t0);
    recordFailure("k", WINDOW, t0);
    expect(isRateLimited("k", WINDOW, t0)).toBe(false);

    recordFailure("k", WINDOW, t0);
    expect(isRateLimited("k", WINDOW, t0)).toBe(true);
  });

  it("checking does not itself count as an attempt", () => {
    for (let i = 0; i < 10; i += 1) isRateLimited("k", WINDOW, t0);

    expect(isRateLimited("k", WINDOW, t0)).toBe(false);
  });

  it("lets a legitimate user back in once the window has passed", () => {
    for (let i = 0; i < WINDOW.limit; i += 1) recordFailure("k", WINDOW, t0);
    expect(isRateLimited("k", WINDOW, t0 + WINDOW.windowMs - 1)).toBe(true);

    expect(isRateLimited("k", WINDOW, t0 + WINDOW.windowMs)).toBe(false);
  });

  it("forgets a key entirely when cleared", () => {
    for (let i = 0; i < WINDOW.limit; i += 1) recordFailure("k", WINDOW, t0);

    clearRateLimit("k");

    expect(isRateLimited("k", WINDOW, t0)).toBe(false);
  });
});
