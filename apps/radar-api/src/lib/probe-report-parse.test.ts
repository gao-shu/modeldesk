import { describe, expect, it } from "vitest";
import { parseProbeReportCreateBody } from "./probe-report-parse.js";
import { assertSnapshotSafe, toPublicSnapshot } from "./probe-report-snapshot.js";

describe("parseProbeReportCreateBody", () => {
  it("accepts nested report and strips apiKey", () => {
    const parsed = parseProbeReportCreateBody({
      apiKey: "sk-should-be-ignored-completely-here",
      testedHost: "sub.example.com",
      report: {
        probeVersion: "0.3.5-share",
        mode: "standard",
        overall: "unreachable",
        message: "fail",
        result: "fail",
        score: 0,
        httpStatus: 404,
        latencyMs: 10,
        requestedModel: "claude-fable-5",
        returnedModel: null,
        endpoint: "https://sub.example.com/v1/chat/completions",
        dimensions: [
          {
            id: "handshake",
            status: "fail",
            title: "握手",
            summary: "404",
            details: { apiKey: "sk-in-details" },
          },
        ],
        rawPreview: "sk-raw-preview",
        apiKey: "sk-nested-also-ignored",
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.testedHost).toBe("sub.example.com");
    expect(typeof parsed.report.rawPreview).toBe("string");
    expect(parsed.report.dimensions[0]).not.toHaveProperty("details");
    const snap = toPublicSnapshot(parsed.report, {
      testedHost: parsed.testedHost,
      includeRawPreview: false,
    });
    assertSnapshotSafe(snap);
    expect(snap.rawPreviewSnippet).toBeNull();
    expect(JSON.stringify(snap)).not.toMatch(/sk-[a-zA-Z0-9_\-]{8,}/);
  });

  it("rejects missing overall", () => {
    const parsed = parseProbeReportCreateBody({
      requestedModel: "gpt-4o",
      mode: "standard",
    });
    expect(parsed.ok).toBe(false);
  });
});
