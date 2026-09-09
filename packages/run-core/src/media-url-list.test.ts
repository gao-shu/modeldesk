import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coerceMediaUrlList } from "./media-url-list.ts";

describe("coerceMediaUrlList", () => {
  it("keeps string arrays", () => {
    assert.deepEqual(coerceMediaUrlList(["https://a.com/1.png", "https://b.com/2.png"]), [
      "https://a.com/1.png",
      "https://b.com/2.png",
    ]);
  });

  it("unwraps OpenAI-shaped { url } objects", () => {
    assert.deepEqual(
      coerceMediaUrlList([
        { url: "https://haode-ai.tos-cn-beijing.volces.com/a.jpeg" },
        { url: "https://haode-ai.tos-cn-beijing.volces.com/b.jpeg" },
        { url: "https://haode-ai.tos-cn-beijing.volces.com/c.jpeg" },
      ]),
      [
        "https://haode-ai.tos-cn-beijing.volces.com/a.jpeg",
        "https://haode-ai.tos-cn-beijing.volces.com/b.jpeg",
        "https://haode-ai.tos-cn-beijing.volces.com/c.jpeg",
      ],
    );
  });

  it("unwraps nested image_url / audio_url objects", () => {
    assert.deepEqual(
      coerceMediaUrlList([{ image_url: { url: "https://x.com/i.png" } }]),
      ["https://x.com/i.png"],
    );
    assert.deepEqual(
      coerceMediaUrlList([{ audio_url: { url: "https://x.com/a.mp3" } }]),
      ["https://x.com/a.mp3"],
    );
  });
});
