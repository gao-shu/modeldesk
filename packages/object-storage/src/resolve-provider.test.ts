import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveStorageProvider } from "./resolve";

describe("resolveStorageProvider", () => {
  it("defaults to none", () => {
    assert.equal(resolveStorageProvider({}), "none");
  });

  it("defaults to none even when TOS_* set", () => {
    assert.equal(
      resolveStorageProvider({
        TOS_BUCKET: "b",
        TOS_ACCESS_KEY: "ak",
        TOS_SECRET_KEY: "sk",
      }),
      "none",
    );
  });

  it("honors explicit none", () => {
    assert.equal(
      resolveStorageProvider({
        STORAGE_PROVIDER: "none",
        TOS_BUCKET: "b",
        TOS_ACCESS_KEY: "ak",
        TOS_SECRET_KEY: "sk",
      }),
      "none",
    );
  });

  it("explicit tos", () => {
    assert.equal(
      resolveStorageProvider({ STORAGE_PROVIDER: "tos" }),
      "tos",
    );
  });

  it("explicit s3", () => {
    assert.equal(
      resolveStorageProvider({ STORAGE_PROVIDER: "s3" }),
      "s3",
    );
  });
});
