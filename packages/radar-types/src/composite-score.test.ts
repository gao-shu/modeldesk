import { describe, expect, it } from "vitest";
import { compositeScore } from "./composite-score.js";

describe("compositeScore", () => {
  const now = new Date("2026-07-18T00:00:00Z");

  it("scores a strong provider highly", () => {
    const score = compositeScore({
      rankWeight: 55,
      authenticityStatus: "pass",
      stabilityScore: "excellent",
      lastVerifiedAt: "2026-07-17T10:00:00Z",
      now,
    });
    // 55*0.35=19.25 + 30 + 20 + 15 = 84.25
    expect(score).toBe(84.25);
  });

  it("penalizes fail authenticity and stale verification", () => {
    const score = compositeScore({
      rankWeight: 50,
      authenticityStatus: "fail",
      stabilityScore: "poor",
      lastVerifiedAt: "2025-01-01T00:00:00Z",
      now,
    });
    // 50*0.35=17.5 + 0 + 0 + 0 = 17.5
    expect(score).toBe(17.5);
  });

  it("applies 30-day freshness band", () => {
    const score = compositeScore({
      rankWeight: 40,
      authenticityStatus: "unknown",
      stabilityScore: "fair",
      lastVerifiedAt: "2026-07-01T00:00:00Z",
      now,
    });
    // 40*0.35=14 + 10 + 10 + 8 = 42
    expect(score).toBe(42);
  });
});
