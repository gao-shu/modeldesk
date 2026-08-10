import { describe, expect, it } from "vitest";
import { overallView, statusMark } from "./probe-report-view.js";

describe("probe-report-view re-exports", () => {
  it("overallView + statusMark stay wired", () => {
    expect(overallView("unreachable").badge).toBe("未检测");
    expect(statusMark("pass").mark).toBe("✓");
  });
});
