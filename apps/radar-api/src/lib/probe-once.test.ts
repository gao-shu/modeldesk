import { describe, expect, it } from "vitest";
import {
  assertProbeTarget,
  resolveChatCompletionsUrl,
} from "./probe-once.js";

describe("probe-once helpers", () => {
  it("resolves /v1 base to chat completions", () => {
    expect(resolveChatCompletionsUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("keeps existing chat completions path", () => {
    expect(
      resolveChatCompletionsUrl("https://api.example.com/v1/chat/completions"),
    ).toBe("https://api.example.com/v1/chat/completions");
  });

  it("rejects private hosts by default", () => {
    expect(() => assertProbeTarget("http://127.0.0.1:8787/v1")).toThrow(
      /内网/,
    );
  });
});
