import { describe, expect, it } from "vitest";
import {
  OVERALL_LABELS,
  STATUS_MARKS,
  labelsForClient,
  overallView,
  statusMark,
} from "./probe-report-labels.js";
import type { OverallStatus } from "./probe-types.js";

const ALL_OVERALL: OverallStatus[] = [
  "likely_genuine",
  "suspicious",
  "likely_fake",
  "unreachable",
  "inconclusive",
];

describe("authenticityHero", () => {
  it("shows big-probability for scored genuine", async () => {
    const { authenticityHero } = await import("./probe-report-labels.js");
    expect(authenticityHero("likely_genuine", 88)).toEqual({
      glyph: "✓",
      label: "倾向真货",
      tone: "ok",
      probability: 88,
    });
    expect(authenticityHero("unreachable", 10).probability).toBeNull();
  });
});

describe("OVERALL_LABELS mapping table", () => {
  it("covers every overall exactly once with unique ring text", () => {
    const rings = ALL_OVERALL.map((k) => OVERALL_LABELS[k].ring);
    expect(new Set(rings).size).toBe(ALL_OVERALL.length);
    expect(OVERALL_LABELS.likely_genuine).toMatchObject({
      ring: "倾向真货",
      badge: "倾向可信",
      tone: "ok",
    });
    expect(OVERALL_LABELS.suspicious).toMatchObject({
      ring: "存疑",
      badge: "需复核",
      tone: "warn",
    });
    expect(OVERALL_LABELS.likely_fake).toMatchObject({
      ring: "高度可疑",
      badge: "疑似假货",
      tone: "bad",
    });
    expect(OVERALL_LABELS.unreachable).toMatchObject({
      ring: "无法检测",
      badge: "未检测",
      tone: "mute",
    });
    expect(OVERALL_LABELS.inconclusive).toMatchObject({
      ring: "无法判定",
      badge: "样本不足",
      tone: "warn",
    });
  });

  it("overallView falls back to inconclusive", () => {
    expect(overallView("not-a-real-status").ring).toBe("无法判定");
  });

  it("short titles used by /verify match ring for all statuses", () => {
    for (const k of ALL_OVERALL) {
      expect(OVERALL_LABELS[k].short).toBe(OVERALL_LABELS[k].ring);
    }
  });
});

describe("STATUS_MARKS", () => {
  it("maps pass/weak/fail/skip without collision", () => {
    expect(statusMark("pass")).toEqual(STATUS_MARKS.pass);
    expect(statusMark("weak")).toEqual(STATUS_MARKS.weak);
    expect(statusMark("fail")).toEqual(STATUS_MARKS.fail);
    expect(statusMark("skip")).toEqual(STATUS_MARKS.skip);
    expect(STATUS_MARKS.pass.mark).toBe("✓");
    expect(STATUS_MARKS.weak.mark).toBe("△");
    expect(STATUS_MARKS.fail.mark).toBe("✗");
    expect(STATUS_MARKS.skip.mark).toBe("—");
    const marks = Object.values(STATUS_MARKS).map((m) => m.mark);
    expect(new Set(marks).size).toBe(4);
  });

  it("unknown status → skip dash", () => {
    expect(statusMark("whatever").mark).toBe("—");
  });
});

describe("labelsForClient", () => {
  it("exports all overall + status keys for verify embed", () => {
    const c = labelsForClient();
    for (const k of ALL_OVERALL) {
      expect(c.overall[k]?.ring).toBe(OVERALL_LABELS[k].ring);
      expect(c.overall[k]?.short).toBe(OVERALL_LABELS[k].short);
    }
    expect(c.status.pass?.label).toBe("通过");
    expect(c.status.fail?.mark).toBe("✗");
  });
});
