import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { createDb } from "../db/client.js";
import {
  assertSnapshotSafe,
  extractTestedHost,
  toPublicSnapshot,
} from "./probe-report-snapshot.js";
import {
  getProbeReport,
  purgeExpiredProbeReports,
  saveProbeReport,
} from "./probe-report-store.js";
import type { ProbeReport } from "./probe-types.js";

function sampleReport(overrides: Partial<ProbeReport> = {}): ProbeReport {
  return {
    probeVersion: "0.3.5-share",
    mode: "standard",
    overall: "unreachable",
    message: "鉴权失败；泄漏样例 sk-abcdefghijklmnopqrstuvwxyz123456",
    result: "fail",
    score: 0,
    suiteSeed: 42,
    suiteIds: ["style-mark", "calc-381"],
    scored: [{ id: "handshake", status: "fail", weight: 12 }],
    httpStatus: 404,
    latencyMs: 120,
    requestedModel: "claude-fable-5",
    returnedModel: null,
    endpoint: "https://api.example.com/v1/chat/completions",
    dimensions: [
      {
        id: "handshake",
        status: "fail",
        title: "API 握手与协议探测",
        summary: "模型不存在；Bearer sk-abcdefghijklmnopqrstuvwxyz123456",
        details: { apiKey: "sk-should-never-appear", chatHttp: 404 },
      },
      {
        id: "client",
        status: "fail",
        title: "客户端兼容（轻量）",
        summary: "跳过",
      },
    ],
    rawPreview: '{"error":"no","apiKey":"sk-raw-should-go"}',
    ...overrides,
  };
}

const tempDbs: string[] = [];

afterEach(() => {
  for (const p of tempDbs.splice(0)) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(`${p}-wal`);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(`${p}-shm`);
    } catch {
      /* ignore */
    }
  }
});

describe("extractTestedHost", () => {
  it("parses hostname from chat completions url", () => {
    expect(
      extractTestedHost("https://api.example.com/v1/chat/completions"),
    ).toBe("api.example.com");
  });
});

describe("toPublicSnapshot", () => {
  it("never keeps apiKey / sk- / rawPreview / details", () => {
    const snap = toPublicSnapshot(sampleReport(), {
      testedAt: "2026-07-20T03:59:00.000Z",
      testerLabel: "api-radar",
    });
    assertSnapshotSafe(snap);
    const blob = JSON.stringify(snap);
    expect(blob).not.toMatch(/sk-[a-zA-Z0-9_\-]{8,}/);
    expect(blob.toLowerCase()).not.toContain("apikey");
    expect(snap.testedHost).toBe("api.example.com");
    expect(snap.requestedModel).toBe("claude-fable-5");
    expect(snap.dimensions[0]?.summary).toContain("[redacted]");
    expect(snap.dimensions[0]).not.toHaveProperty("details");
    expect(snap.rawPreviewSnippet).toBeNull();
    expect(snap).not.toHaveProperty("endpoint");
    expect(snap.suiteIds).toEqual(["style-mark", "calc-381"]);
    expect(snap.schemaVersion).toBe(2);
  });

  it("omits suiteIds when opted out; includes scrubbed preview when opted in", () => {
    const snap = toPublicSnapshot(sampleReport(), {
      includeSuiteIds: false,
      includeRawPreview: true,
    });
    expect(snap.suiteIds).toEqual([]);
    expect(snap.rawPreviewSnippet).toBeTruthy();
    expect(snap.rawPreviewSnippet).toContain("[redacted]");
    assertSnapshotSafe(snap);
  });

  it("allows overriding testedHost", () => {
    const snap = toPublicSnapshot(sampleReport(), { testedHost: "custom.host" });
    expect(snap.testedHost).toBe("custom.host");
  });
});

describe("probe report store", () => {
  it("saves and loads snapshot without secrets", () => {
    const dbPath = path.join(
      os.tmpdir(),
      `api-radar-probe-report-${Date.now()}.sqlite`,
    );
    tempDbs.push(dbPath);
    const { db, sqlite } = createDb(dbPath);
    try {
      const saved = saveProbeReport(db, { report: sampleReport() });
      expect(saved.id.length).toBeGreaterThanOrEqual(10);
      assertSnapshotSafe(saved.snapshot);

      const got = getProbeReport(db, saved.id);
      expect(got.ok).toBe(true);
      if (!got.ok) return;
      assertSnapshotSafe(got.snapshot);
      expect(got.snapshot.testedHost).toBe("api.example.com");
      expect(JSON.stringify(got.snapshot)).not.toMatch(/sk-[a-zA-Z0-9_\-]{8,}/);
    } finally {
      sqlite.close();
    }
  });

  it("marks expired reports and purges them", () => {
    const dbPath = path.join(
      os.tmpdir(),
      `api-radar-probe-report-exp-${Date.now()}.sqlite`,
    );
    tempDbs.push(dbPath);
    const { db, sqlite } = createDb(dbPath);
    try {
      const saved = saveProbeReport(db, {
        report: sampleReport(),
        meta: {
          testedAt: "2020-01-01T00:00:00.000Z",
          ttlMs: 1000,
        },
      });
      const got = getProbeReport(db, saved.id, new Date("2026-07-20T00:00:00Z"));
      expect(got.ok).toBe(false);
      if (got.ok) return;
      expect(got.reason).toBe("expired");

      const n = purgeExpiredProbeReports(db, new Date("2026-07-20T00:00:00Z"));
      expect(n).toBeGreaterThanOrEqual(0);
      expect(getProbeReport(db, saved.id).ok).toBe(false);
    } finally {
      sqlite.close();
    }
  });
});
