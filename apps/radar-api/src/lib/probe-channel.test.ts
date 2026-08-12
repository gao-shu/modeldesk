import { describe, expect, it } from "vitest";
import {
  classifyProbeChannel,
  isOfficialApiHost,
} from "./probe-channel.js";

describe("probe-channel", () => {
  it("recognizes zhipu / deepseek official hosts", () => {
    expect(isOfficialApiHost("open.bigmodel.cn")).toBe(true);
    expect(isOfficialApiHost("api.deepseek.com")).toBe(true);
    expect(classifyProbeChannel("https://open.bigmodel.cn/api/paas/v4")).toBe(
      "official",
    );
  });

  it("treats unknown hosts as relay", () => {
    expect(classifyProbeChannel("https://relay.example.com/v1")).toBe("relay");
  });
});
