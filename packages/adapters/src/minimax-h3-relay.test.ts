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

  it("builds JSON body for text-to-video", async () => {
    const payload = await buildMinimaxH3RelaySubmit({
      model: "MiniMax-H3",
      prompt: "boat",
      durationSec: 15,
      aspectRatio: "16:9",
      resolution: "768p",
    });
    assert.equal(payload.mode, "json");
    if (payload.mode !== "json") return;
    assert.deepEqual(payload.body, {
      model: "MiniMax-H3",
      prompt: "boat",
      seconds: "15",
      size: "1280x720",
      resolution: "768p",
      ratio: "16:9",
    });
  });

  it("clamps seconds to 4–15", async () => {
    const low = await buildMinimaxH3RelaySubmit({
      model: "MiniMax-H3",
      prompt: "x",
      durationSec: 1,
    });
    assert.equal(low.mode, "json");
    if (low.mode === "json") assert.equal(low.body.seconds, "4");

    const high = await buildMinimaxH3RelaySubmit({
      model: "MiniMax-H3",
      prompt: "x",
      durationSec: 99,
    });
    assert.equal(high.mode, "json");
    if (high.mode === "json") assert.equal(high.body.seconds, "15");
  });

  it("builds content[] for first-frame reference", async () => {
    const payload = await buildMinimaxH3RelaySubmit({
      model: "MiniMax-H3",
      prompt: "boat",
      referenceImage: "https://example.com/a.png",
    });
    assert.equal(payload.mode, "json");
    if (payload.mode !== "json") return;
    assert.deepEqual(payload.body.content, [
      {
        type: "image_url",
        image_url: { url: "https://example.com/a.png" },
        role: "first_frame",
      },
    ]);
  });

  it("passes through local data URI without /files upload", async () => {
    const dataUri = "data:image/png;base64,AAAA";
    const payload = await buildMinimaxH3RelaySubmit({
      model: "MiniMax-H3",
      prompt: "boat",
      referenceImage: dataUri,
    });
    assert.equal(payload.mode, "json");
    if (payload.mode !== "json") return;
    assert.deepEqual(payload.body.content, [
      {
        type: "image_url",
        image_url: { url: dataUri },
        role: "first_frame",
      },
    ]);
  });

  it("builds content[] for first+last frames", async () => {
    const payload = await buildMinimaxH3RelaySubmit({
      model: "MiniMax-H3",
      prompt: "transition",
      aspectRatio: "9:16",
      referenceImage: "https://example.com/first.jpg",
      referenceImageEnd: "https://example.com/last.jpg",
    });
    assert.equal(payload.mode, "json");
    if (payload.mode !== "json") return;
    assert.equal(payload.body.ratio, "9:16");
    assert.deepEqual(payload.body.content, [
      {
        type: "image_url",
        image_url: { url: "https://example.com/first.jpg" },
        role: "first_frame",
      },
      {
        type: "image_url",
        image_url: { url: "https://example.com/last.jpg" },
        role: "last_frame",
      },
    ]);
  });

  it("builds content[] multi-ref as reference_image in order", async () => {
    const payload = await buildMinimaxH3RelaySubmit({
      model: "MiniMax-H3",
      prompt: "图片1办公室；图片2人物A；图片3人物B",
      durationSec: 15,
      aspectRatio: "9:16",
      resolution: "768p",
      referenceImages: [
        "https://example.com/office.jpg",
        "https://example.com/a.jpg",
        "https://example.com/b.jpg",
      ],
    });
    assert.equal(payload.mode, "json");
    if (payload.mode !== "json") return;
    assert.deepEqual(payload.body.content, [
      {
        type: "image_url",
        image_url: { url: "https://example.com/office.jpg" },
        role: "reference_image",
      },
      {
        type: "image_url",
        image_url: { url: "https://example.com/a.jpg" },
        role: "reference_image",
      },
      {
        type: "image_url",
        image_url: { url: "https://example.com/b.jpg" },
        role: "reference_image",
      },
    ]);
  });

  it("rejects multi-ref together with first/last frames", async () => {
    await assert.rejects(
      () =>
        buildMinimaxH3RelaySubmit({
          model: "MiniMax-H3",
          prompt: "x",
          referenceImage: "https://example.com/a.png",
          referenceImages: ["https://example.com/b.png"],
        }),
      /多参参考图与首尾帧不能同时使用/,
    );
  });

  it("keeps adaptive ratio", async () => {
    const payload = await buildMinimaxH3RelaySubmit({
      model: "MiniMax-H3",
      prompt: "x",
      aspectRatio: "adaptive",
    });
    assert.equal(payload.mode, "json");
    if (payload.mode === "json") assert.equal(payload.body.ratio, "adaptive");
  });
});
