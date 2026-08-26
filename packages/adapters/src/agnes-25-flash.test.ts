import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveApiFormatId,
  applyFormatParamAliases,
  videoSettingsFromParams,
} from "@modeldesk/shared";
import {
  buildAgnes25FlashSubmitBody,
  isAgnesVideo25Flash,
} from "./video";
import { defaultVideoPollTiming } from "./poll";

const baseOpts = {
  model: "agnes-video-2.5-flash",
  prompt: "a quiet street after rain",
  referenceImages: [] as string[],
  referenceAudios: [] as string[],
  officialHost: true,
};

describe("isAgnesVideo25Flash", () => {
  it("matches format id", () => {
    assert.equal(isAgnesVideo25Flash("other", "video.agnes-25-flash"), true);
  });

  it("matches model id", () => {
    assert.equal(isAgnesVideo25Flash("agnes-video-2.5-flash"), true);
    assert.equal(isAgnesVideo25Flash("agnes-video-v2.0"), false);
  });
});

describe("buildAgnes25FlashSubmitBody", () => {
  it("infers text when no reference slots filled", () => {
    const body = buildAgnes25FlashSubmitBody({
      ...baseOpts,
      durationSec: 5,
      aspectRatio: "16:9",
      resolution: "720P",
    });
    assert.equal(body.model, "agnes-video-2.5-flash");
    assert.equal(body.mode, "text");
    assert.equal(body.seconds, "5");
    assert.equal(body.size, "720P");
    assert.equal(body.aspect_ratio, "16:9");
    assert.equal(body.first_frame, undefined);
    assert.equal(body.last_frame, undefined);
    assert.equal(body.images, undefined);
    assert.equal(body.audios, undefined);
    assert.equal(body.width, undefined);
    assert.equal(body.num_frames, undefined);
  });

  it("clamps seconds to 4–12 as string", () => {
    assert.equal(
      buildAgnes25FlashSubmitBody({ ...baseOpts, durationSec: 2 })
        .seconds,
      "4",
    );
    assert.equal(
      buildAgnes25FlashSubmitBody({ ...baseOpts, durationSec: 20 })
        .seconds,
      "12",
    );
  });

  it("keyframe: first only / last only / both (inferred from slots)", () => {
    const first = buildAgnes25FlashSubmitBody({
      ...baseOpts,
      referenceImage: "https://example.com/first.png",
    });
    assert.equal(first.mode, "keyframe");
    assert.equal(first.first_frame, "https://example.com/first.png");
    assert.equal(first.last_frame, undefined);

    const last = buildAgnes25FlashSubmitBody({
      ...baseOpts,
      referenceImageEnd: "https://example.com/last.png",
    });
    assert.equal(last.last_frame, "https://example.com/last.png");
    assert.equal(last.first_frame, undefined);

    const both = buildAgnes25FlashSubmitBody({
      ...baseOpts,
      referenceImage: "https://example.com/first.png",
      referenceImageEnd: "https://example.com/last.png",
    });
    assert.equal(both.first_frame, "https://example.com/first.png");
    assert.equal(both.last_frame, "https://example.com/last.png");
  });

  it("reference: images ≤5 and optional audios (inferred from slots)", () => {
    const body = buildAgnes25FlashSubmitBody({
      ...baseOpts,
      referenceImages: [
        "https://example.com/a.png",
        "https://example.com/b.png",
      ],
      referenceAudios: ["https://example.com/a.mp3"],
    });
    assert.deepEqual(body.images, [
      "https://example.com/a.png",
      "https://example.com/b.png",
    ]);
    assert.deepEqual(body.audios, ["https://example.com/a.mp3"]);
  });

  it("reference: rejects more than 5 images", () => {
    assert.throws(
      () =>
        buildAgnes25FlashSubmitBody({
          ...baseOpts,
          referenceImages: [
            "https://a/1.png",
            "https://a/2.png",
            "https://a/3.png",
            "https://a/4.png",
            "https://a/5.png",
            "https://a/6.png",
          ],
        }),
      /最多 5 张/,
    );
  });

  it("single ref in 首帧 slot → keyframe; stale mode= keyframe ignored when empty", () => {
    const auto = buildAgnes25FlashSubmitBody({
      ...baseOpts,
      referenceImage: "https://example.com/x.png",
    });
    assert.equal(auto.mode, "keyframe");
    assert.equal(auto.first_frame, "https://example.com/x.png");
    const text = buildAgnes25FlashSubmitBody({ ...baseOpts, mode: "keyframe" });
    assert.equal(text.mode, "text");
  });

  it("input_reference alias → reference_image → keyframe body", () => {
    const aliased = applyFormatParamAliases("video.agnes-25-flash", {
      input_reference: "https://example.com/ref.jpg",
      duration_sec: "5",
    });
    assert.equal(aliased.reference_image, "https://example.com/ref.jpg");
    const body = buildAgnes25FlashSubmitBody({
      ...baseOpts,
      referenceImage:
        typeof aliased.reference_image === "string"
          ? aliased.reference_image
          : undefined,
    });
    assert.equal(body.mode, "keyframe");
    assert.equal(body.first_frame, "https://example.com/ref.jpg");
  });

  it("multi refs in list slot → reference", () => {
    const auto = buildAgnes25FlashSubmitBody({
      ...baseOpts,
      referenceImages: ["https://example.com/a.png"],
    });
    assert.equal(auto.mode, "reference");
    assert.deepEqual(auto.images, ["https://example.com/a.png"]);
  });

  it("resolution defaults to 720P; rejects other tiers", () => {
    assert.equal(
      buildAgnes25FlashSubmitBody({ ...baseOpts, resolution: "720P" }).size,
      "720P",
    );
    assert.equal(
      buildAgnes25FlashSubmitBody({ ...baseOpts, size: "720p" }).size,
      "720P",
    );
    assert.throws(
      () => buildAgnes25FlashSubmitBody({ ...baseOpts, resolution: "960P" }),
      /720P/,
    );
  });

  it("official host rejects base64 reference", () => {
    assert.throws(
      () =>
        buildAgnes25FlashSubmitBody({
          ...baseOpts,
          referenceImage: "data:image/png;base64,AAAA",
          officialHost: true,
        }),
      /公网可访问/,
    );
  });
});

describe("videoSettingsFromParams (agnes-25-flash)", () => {
  it("returns size 720P and clamped duration without frame knobs", () => {
    const knobs = videoSettingsFromParams(
      { duration_sec: 5, aspect_ratio: "9:16", resolution: "720P" },
      "video.agnes-25-flash",
    );
    assert.equal(knobs.size, "720P");
    assert.equal(knobs.durationSec, 5);
    assert.equal(knobs.width, 720);
    assert.equal(knobs.height, 1280);
    assert.equal(knobs.numFrames, 0);
  });

  it("v2.0 path still maps num_frames", () => {
    const knobs = videoSettingsFromParams(
      { duration_sec: 5, resolution: "720p", aspect_ratio: "16:9" },
      "video.agnes",
    );
    assert.equal(knobs.numFrames, 121);
    assert.notEqual(knobs.size, "720P");
  });
});

describe("resolveApiFormatId (agnes flash)", () => {
  it("prefers flash format for agnes-video-2.5-flash model id", () => {
    assert.equal(
      resolveApiFormatId({
        modality: "video",
        modelId: "agnes-video-2.5-flash",
      }),
      "video.agnes-25-flash",
    );
  });

  it("keeps v2.0 for agnes-video-v2.0", () => {
    assert.equal(
      resolveApiFormatId({
        modality: "video",
        modelId: "agnes-video-v2.0",
      }),
      "video.agnes",
    );
  });
});

describe("defaultVideoPollTiming (agnes flash)", () => {
  it("uses Agnes-style slow polling", () => {
    const t = defaultVideoPollTiming({
      apiFormat: "video.agnes-25-flash",
    });
    assert.equal(t.initialDelayMs, 5_000);
    assert.equal(t.intervalMs, 8_000);
  });
});
