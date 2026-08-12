import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildObjectKey,
  resolveMediaKind,
  requireMediaKind,
  toTosUri,
} from "./kind";

describe("resolveMediaKind", () => {
  it("classifies by mime", () => {
    assert.equal(resolveMediaKind({ mime: "image/png" }), "image");
    assert.equal(resolveMediaKind({ mime: "video/mp4" }), "video");
    assert.equal(resolveMediaKind({ mime: "audio/mpeg" }), "voice");
  });

  it("classifies by extension", () => {
    assert.equal(resolveMediaKind({ filename: "a.WEBP" }), "image");
    assert.equal(resolveMediaKind({ filename: "clip.mov" }), "video");
    assert.equal(resolveMediaKind({ filename: "say.wav" }), "voice");
  });

  it("returns null for unknown", () => {
    assert.equal(resolveMediaKind({ mime: "application/pdf" }), null);
  });
});

describe("buildObjectKey", () => {
  it("uses temp/{images|videos|voice}/yyyy/mm/uuid.ext", () => {
    const now = new Date(Date.UTC(2026, 6, 24));
    assert.equal(
      buildObjectKey({ kind: "image", ext: "png", id: "abc", now }),
      "temp/images/2026/07/abc.png",
    );
    assert.equal(
      buildObjectKey({ kind: "video", ext: "mp4", id: "abc", now }),
      "temp/videos/2026/07/abc.mp4",
    );
    assert.equal(
      buildObjectKey({ kind: "voice", ext: "wav", id: "abc", now }),
      "temp/voice/2026/07/abc.wav",
    );
  });
});

describe("requireMediaKind + tos uri", () => {
  it("honors explicit kind", () => {
    assert.equal(
      requireMediaKind({ mime: "application/octet-stream", kind: "voice" }),
      "voice",
    );
  });

  it("builds tos uri", () => {
    assert.equal(
      toTosUri("your-bucket", "temp/images/2026/07/x.png"),
      "tos://your-bucket/temp/images/2026/07/x.png",
    );
  });
});
