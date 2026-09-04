import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRunCoreAgentModality,
  isRunCoreMvpModality,
  prepareErrorHttpStatus,
  RUN_CORE_AGENT_MODALITIES,
  RUN_CORE_MVP_MODALITIES,
} from "./run-core-meta.ts";

describe("run-core-meta", () => {
  it("agent modalities cover desk run types", () => {
    assert.deepEqual(
      [...RUN_CORE_AGENT_MODALITIES],
      ["text", "image", "video", "audio"],
    );
    assert.deepEqual([...RUN_CORE_MVP_MODALITIES], [...RUN_CORE_AGENT_MODALITIES]);
    assert.equal(isRunCoreAgentModality("text"), true);
    assert.equal(isRunCoreAgentModality("video"), true);
    assert.equal(isRunCoreAgentModality("audio"), true);
    assert.equal(isRunCoreAgentModality("music"), false);
    assert.equal(isRunCoreMvpModality("image"), true);
    assert.equal(isRunCoreAgentModality("unknown"), false);
  });

  it("maps prepare errors to HTTP status", () => {
    assert.equal(prepareErrorHttpStatus("not_found"), 404);
    assert.equal(prepareErrorHttpStatus("modality_mismatch"), 400);
    assert.equal(prepareErrorHttpStatus("no_key"), 400);
    assert.equal(prepareErrorHttpStatus("no_base_url"), 400);
  });
});
