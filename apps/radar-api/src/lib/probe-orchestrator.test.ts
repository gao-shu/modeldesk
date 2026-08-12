import { describe, expect, it } from "vitest";
import {
  makeSeededRng,
  pickSuite,
  scoreAnswer,
  type SuiteQuestion,
} from "../data/probe-suites.js";
import { computeScore } from "./probe-orchestrator.js";
import { synthesizeOverallA } from "./probe-types.js";

describe("scoreAnswer", () => {
  it("scores calc exactly", () => {
    const q: SuiteQuestion = {
      id: "c",
      kind: "calc",
      prompt: "x",
      expectNumber: 381,
      maxTokens: 8,
    };
    expect(scoreAnswer(q, "381")).toBe("pass");
    expect(scoreAnswer(q, "380")).toBe("weak");
    expect(scoreAnswer(q, "1")).toBe("fail");
  });

  it("flags identity swap for claude request", () => {
    const q: SuiteQuestion = {
      id: "identity-claude",
      kind: "identity",
      prompt: "x",
      expectIncludes: ["id_mark"],
      expectFamilyAny: ["claude", "anthropic"],
      maxTokens: 80,
    };
    expect(scoreAnswer(q, "I am GPT-4o helper.\nID_MARK", "claude")).toBe(
      "fail",
    );
    expect(scoreAnswer(q, "I am Claude Sonnet.\nID_MARK", "claude")).toBe(
      "pass",
    );
  });

  it("allows adjacent year as weak for cutoff", () => {
    const q: SuiteQuestion = {
      id: "cutoff",
      kind: "cutoff",
      prompt: "x",
      expectRegex: "2024",
      maxTokens: 8,
    };
    expect(scoreAnswer(q, "2024")).toBe("pass");
    expect(scoreAnswer(q, "2023")).toBe("weak");
    expect(scoreAnswer(q, "2010")).toBe("fail");
  });
});

describe("pickSuite", () => {
  it("standard has 1 calc; deep has 2", () => {
    const fixed = () => 0.1;
    const s = pickSuite("claude", "standard", fixed);
    const d = pickSuite("claude", "deep", fixed);
    expect(s.calcs).toHaveLength(1);
    expect(d.calcs).toHaveLength(2);
    expect(s.cutoff.kind).toBe("cutoff");
    expect(s.identity.kind).toBe("identity");
  });

  it("same seed picks same suite", () => {
    const a = pickSuite("openai", "standard", makeSeededRng(42));
    const b = pickSuite("openai", "standard", makeSeededRng(42));
    expect(a.all.map((q) => q.id)).toEqual(b.all.map((q) => q.id));
  });
});

describe("computeScore + overall A", () => {
  it("high score => likely_genuine", () => {
    const dims = [
      {
        id: "handshake" as const,
        status: "pass" as const,
        title: "h",
        summary: "",
      },
      {
        id: "metadata" as const,
        status: "pass" as const,
        title: "m",
        summary: "",
      },
      { id: "style" as const, status: "pass" as const, title: "s", summary: "" },
      {
        id: "capability" as const,
        status: "pass" as const,
        title: "c",
        summary: "",
      },
      {
        id: "cache" as const,
        status: "skip" as const,
        title: "k",
        summary: "",
      },
      {
        id: "client" as const,
        status: "pass" as const,
        title: "cl",
        summary: "",
      },
    ];
    const { score } = computeScore(dims);
    expect(score).toBeGreaterThanOrEqual(75);
    const { overall, message } = synthesizeOverallA(dims, score);
    expect(overall).toBe("likely_genuine");
    expect(message).toContain("最终结论：倾向真货");
  });

  it("official channel => available verdict without capability", () => {
    const dims = [
      {
        id: "handshake" as const,
        status: "pass" as const,
        title: "h",
        summary: "",
      },
      {
        id: "metadata" as const,
        status: "pass" as const,
        title: "m",
        summary: "",
      },
      {
        id: "capability" as const,
        status: "skip" as const,
        title: "c",
        summary: "",
      },
    ];
    const { overall, message } = synthesizeOverallA(dims, 100, {
      channel: "official",
    });
    expect(overall).toBe("likely_genuine");
    expect(message).toContain("官方直连可用");
  });
});

describe("familyOfModel domestic", () => {
  it("maps glm / deepseek", async () => {
    const { familyOfModel } = await import("../data/probe-suites.js");
    expect(familyOfModel("glm-4-plus")).toBe("glm");
    expect(familyOfModel("deepseek-v4-pro")).toBe("deepseek");
  });
});
