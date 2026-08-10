import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cloudDriverConfigToEnv,
  createObjectStorageFromCloudConfig,
} from "./resolve";

describe("createObjectStorageFromCloudConfig", () => {
  it("builds TOS from in-memory config without process.env", () => {
    const prev = process.env.TOS_BUCKET;
    delete process.env.TOS_BUCKET;
    try {
      const storage = createObjectStorageFromCloudConfig("tos", {
        bucket: "mem-bucket",
        accessKey: "ak",
        secretKey: "sk",
        endpoint: "tos-cn-beijing.volces.com",
        region: "cn-beijing",
      });
      assert.equal(storage.provider, "tos");
      assert.equal(storage.isConfigured(), true);
    } finally {
      if (prev === undefined) delete process.env.TOS_BUCKET;
      else process.env.TOS_BUCKET = prev;
    }
  });

  it("maps COS accessKey → COS_SECRET_ID", () => {
    const env = cloudDriverConfigToEnv("cos", {
      bucket: "b",
      accessKey: "sid",
      secretKey: "sk",
      region: "ap-guangzhou",
    });
    assert.equal(env.COS_SECRET_ID, "sid");
    assert.equal(env.COS_SECRET_KEY, "sk");
    assert.equal(env.COS_BUCKET, "b");
  });

  it("returns unready when incomplete", () => {
    const storage = createObjectStorageFromCloudConfig("s3", {
      bucket: "",
      accessKey: "ak",
      secretKey: "sk",
    });
    assert.equal(storage.isConfigured(), false);
  });
});
