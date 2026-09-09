import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAgnesApiBaseUrl,
  isVolcengineArkImageBaseUrl,
  isZhipuImageBaseUrl,
  mapOpenAiAsyncQuality,
  mapOpenAiAsyncSize,
  resolveSeedreamSize,
} from "./image-format-helpers.ts";

describe("image-format-helpers", () => {
  it("detects vendor base urls", () => {
    assert.equal(isAgnesApiBaseUrl("https://api.agnes-ai.com/v1"), true);
    assert.equal(isVolcengineArkImageBaseUrl("https://ark.cn-beijing.volces.com"), true);
    assert.equal(isZhipuImageBaseUrl("https://open.bigmodel.cn/api"), true);
    assert.equal(isAgnesApiBaseUrl("https://api.openai.com"), false);
  });

  it("maps openai-async quality and size", () => {
    assert.equal(mapOpenAiAsyncQuality("4k"), "4k");
    assert.equal(mapOpenAiAsyncQuality("high"), "auto");
    assert.equal(mapOpenAiAsyncQuality(undefined, "2k"), "2k");
    assert.equal(mapOpenAiAsyncSize("1024x1024", "9:16"), "9:16");
    assert.equal(mapOpenAiAsyncSize("weird", undefined), "16:9");
  });

  it("resolves seedream size tiers and ratios", () => {
    assert.equal(resolveSeedreamSize("1024x768"), "1024x768");
    assert.equal(resolveSeedreamSize("2K"), "2K");
    assert.equal(resolveSeedreamSize("2K", "16:9"), "2848x1600");
    assert.equal(resolveSeedreamSize("4k", "1:1"), "4096x4096");
  });
});
