import { describe, expect, it } from "vitest";
import { compositeScore } from "@modeldesk/radar-types";

describe("server re-exports compositeScore", () => {
  it("matches docs formula", () => {
    const score = compositeScore({
      rankWeight: 55,
      authenticityStatus: "pass",
      stabilityScore: "excellent",
      lastVerifiedAt: "2026-07-17T10:00:00Z",
      now: new Date("2026-07-18T00:00:00Z"),
    });
    expect(score).toBe(84.25);
  });
});
