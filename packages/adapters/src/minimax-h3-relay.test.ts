import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMinimaxH3RelaySubmit,
  normalizeMinimaxH3RelayResolution,
  resolveMinimaxH3RelaySize,
} from "./video.ts";

describe("minimax-h3-relay", () => {
  it("normalizes resolution to 768p / 2K", () => {
    assert.equal(normalizeMinimaxH3RelayResolution(undefined), "768p");
    assert.equal(normalizeMinimaxH3RelayResolution("720p"), "768p");
    assert.equal(normalizeMinimaxH3RelayResolution("2k"), "2K");
    assert.equal(normalizeMinimaxH3RelayResolution("1080P"), "2K");
  });

  it("maps aspect to documented size", () => {
    assert.equal(resolveMinimaxH3RelaySize("16:9"), "1280x720");
    assert.equal(resolveMinimaxH3RelaySize("9:16"), "720x1280");
    assert.equal(resolveMinimaxH3RelaySize("21:9"), "1344x576");
  });

  it("builds JSON body for text-to-video", () => {
    const payload = buildMinimaxH3RelaySubmit({
      model: "minimax_h3",
      prompt: "boat",
      durationSec: 15,
      aspectRatio: "16:9",
      resolution: "768p",
    });
    assert.equal(payload.mode, "json");
    if (payload.mode !== "json") return;
    assert.deepEqual(payload.body, {
      model: "minimax_h3",
      prompt: "boat",
      seconds: "15",
      size: "1280x720",
      resolution: "768p",
      ratio: "16:9",
    });
  });

  it("clamps seconds to 4–15", () => {
    const low = buildMinimaxH3RelaySubmit({
      model: "minimax_h3",
      prompt: "x",
      durationSec: 1,
    });
    assert.equal(low.mode, "json");
    if (low.mode === "json") assert.equal(low.body.seconds, "4");

    const high = buildMinimaxH3RelaySubmit({
      model: "minimax_h3",
      prompt: "x",
      durationSec: 99,
    });
    assert.equal(high.mode, "json");
    if (high.mode === "json") assert.equal(high.body.seconds, "15");
  });

  it("uses multipart for first-frame reference", () => {
    const payload = buildMinimaxH3RelaySubmit({
      model: "minimax_h3",
      prompt: "boat",
      referenceImage: "https://example.com/a.png",
    });
    assert.equal(payload.mode, "multipart");
    if (payload.mode !== "multipart") return;
    assert.equal(payload.logBody.input_reference, "https://example.com/a.png");
    assert.equal(payload.logBody.resolution, "768p");
  });
});
