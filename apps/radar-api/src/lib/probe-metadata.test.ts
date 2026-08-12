import { describe, expect, it } from "vitest";
import { analyzeConnectivity, analyzeMetadata } from "./probe-metadata.js";
import { synthesizeOverall } from "./probe-types.js";

describe("analyzeConnectivity", () => {
  it("passes on 200", () => {
    const d = analyzeConnectivity({ httpStatus: 200, latencyMs: 100 });
    expect(d.status).toBe("pass");
  });

  it("fails on 401", () => {
    const d = analyzeConnectivity({ httpStatus: 401, latencyMs: 50 });
    expect(d.status).toBe("fail");
    expect(d.details?.reason).toBe("auth");
  });
});

describe("analyzeMetadata", () => {
  it("passes when model and usage look normal", () => {
    const { dimension, returnedModel } = analyzeMetadata({
      requestedModel: "gpt-4o",
      httpStatus: 200,
      bodyText: "",
      parsed: {
        model: "gpt-4o",
        usage: { prompt_tokens: 10, completion_tokens: 2 },
        choices: [{ finish_reason: "stop", message: { content: "OK" } }],
      },
    });
    expect(returnedModel).toBe("gpt-4o");
    expect(dimension.status).toBe("pass");
  });

  it("fails when returned model mismatches", () => {
    const { dimension } = analyzeMetadata({
      requestedModel: "claude-sonnet-4",
      httpStatus: 200,
      bodyText: "",
      parsed: {
        model: "gpt-3.5-turbo",
        usage: { prompt_tokens: 10, completion_tokens: 2 },
        choices: [{ finish_reason: "stop" }],
      },
    });
    expect(dimension.status).toBe("fail");
  });

  it("weak when usage missing", () => {
    const { dimension } = analyzeMetadata({
      requestedModel: "gpt-4o",
      httpStatus: 200,
      bodyText: "",
      parsed: {
        model: "gpt-4o",
        choices: [{ finish_reason: "stop" }],
      },
    });
    expect(dimension.status).toBe("weak");
  });
});

describe("synthesizeOverall", () => {
  it("likely_genuine when both pass", () => {
    const { overall } = synthesizeOverall([
      { id: "connectivity", status: "pass", title: "C", summary: "ok" },
      { id: "metadata", status: "pass", title: "M", summary: "ok" },
    ]);
    expect(overall).toBe("likely_genuine");
  });

  it("suspicious on metadata fail", () => {
    const { overall } = synthesizeOverall([
      { id: "connectivity", status: "pass", title: "C", summary: "ok" },
      { id: "metadata", status: "fail", title: "M", summary: "bad" },
    ]);
    expect(overall).toBe("suspicious");
  });
});
