import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bosConfigFromEnv } from "./bos-config";
import { cosConfigFromEnv } from "./cos-config";
import { ossConfigFromEnv } from "./oss-config";
import { resolveStorageProvider } from "./resolve";

describe("resolveStorageProvider (phase 4)", () => {
  it("accepts oss/cos/bos", () => {
    assert.equal(resolveStorageProvider({ STORAGE_PROVIDER: "oss" }), "oss");
    assert.equal(resolveStorageProvider({ STORAGE_PROVIDER: "cos" }), "cos");
    assert.equal(resolveStorageProvider({ STORAGE_PROVIDER: "bos" }), "bos");
  });

  it("does not auto-pick oss when only OSS_* set", () => {
    assert.equal(
      resolveStorageProvider({
        OSS_BUCKET: "b",
        OSS_ACCESS_KEY: "ak",
        OSS_SECRET_KEY: "sk",
      }),
      "none",
    );
  });
});

describe("ossConfigFromEnv", () => {
  it("returns null when incomplete", () => {
    assert.equal(ossConfigFromEnv({}), null);
  });

  it("derives public URL from region", () => {
    const cfg = ossConfigFromEnv({
      OSS_BUCKET: "my-bucket",
      OSS_REGION: "oss-cn-beijing",
      OSS_ACCESS_KEY: "ak",
      OSS_SECRET_KEY: "sk",
    });
    assert.ok(cfg);
    assert.equal(
      cfg!.publicBaseUrl,
      "https://my-bucket.oss-cn-beijing.aliyuncs.com",
    );
    assert.equal(cfg!.objectAcl, "public-read");
  });
});

describe("cosConfigFromEnv", () => {
  it("derives myqcloud public URL", () => {
    const cfg = cosConfigFromEnv({
      COS_BUCKET: "demo-1250000000",
      COS_REGION: "ap-shanghai",
      COS_SECRET_ID: "id",
      COS_SECRET_KEY: "sk",
    });
    assert.ok(cfg);
    assert.equal(
      cfg!.publicBaseUrl,
      "https://demo-1250000000.cos.ap-shanghai.myqcloud.com",
    );
  });
});

describe("bosConfigFromEnv", () => {
  it("derives virtual-hosted public URL", () => {
    const cfg = bosConfigFromEnv({
      BOS_BUCKET: "media",
      BOS_ACCESS_KEY: "ak",
      BOS_SECRET_KEY: "sk",
      BOS_ENDPOINT: "https://bj.bcebos.com",
    });
    assert.ok(cfg);
    assert.equal(cfg!.publicBaseUrl, "https://media.bj.bcebos.com");
  });
});
