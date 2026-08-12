import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { s3ConfigFromEnv } from "./s3-config";

describe("s3ConfigFromEnv", () => {
  it("returns null when incomplete", () => {
    assert.equal(s3ConfigFromEnv({}), null);
    assert.equal(
      s3ConfigFromEnv({ S3_BUCKET: "b", S3_ACCESS_KEY: "ak" }),
      null,
    );
  });

  it("reads core fields and derives AWS public URL", () => {
    const cfg = s3ConfigFromEnv({
      S3_BUCKET: "my-bucket",
      S3_REGION: "ap-northeast-1",
      S3_ACCESS_KEY: "ak",
      S3_SECRET_KEY: "sk",
    });
    assert.ok(cfg);
    assert.equal(cfg!.bucket, "my-bucket");
    assert.equal(cfg!.region, "ap-northeast-1");
    assert.equal(
      cfg!.publicBaseUrl,
      "https://my-bucket.s3.ap-northeast-1.amazonaws.com",
    );
    assert.equal(cfg!.objectAcl, "public-read");
    assert.equal(cfg!.forcePathStyle, false);
  });

  it("MinIO-style endpoint uses path style + public base", () => {
    const cfg = s3ConfigFromEnv({
      S3_BUCKET: "media",
      S3_ACCESS_KEY: "ak",
      S3_SECRET_KEY: "sk",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_FORCE_PATH_STYLE: "1",
    });
    assert.ok(cfg);
    assert.equal(cfg!.endpoint, "http://127.0.0.1:9000");
    assert.equal(cfg!.forcePathStyle, true);
    assert.equal(cfg!.publicBaseUrl, "http://127.0.0.1:9000/media");
  });

  it("S3_SKIP_ACL disables object ACL", () => {
    const cfg = s3ConfigFromEnv({
      S3_BUCKET: "b",
      S3_ACCESS_KEY: "ak",
      S3_SECRET_KEY: "sk",
      S3_SKIP_ACL: "1",
    });
    assert.ok(cfg);
    assert.equal(cfg!.objectAcl, null);
  });

  it("accepts AWS_* credential aliases", () => {
    const cfg = s3ConfigFromEnv({
      S3_BUCKET: "b",
      AWS_ACCESS_KEY_ID: "ak",
      AWS_SECRET_ACCESS_KEY: "sk",
      AWS_REGION: "us-west-2",
    });
    assert.ok(cfg);
    assert.equal(cfg!.accessKey, "ak");
    assert.equal(cfg!.region, "us-west-2");
  });
});
