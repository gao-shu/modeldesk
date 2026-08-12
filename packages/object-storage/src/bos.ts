/// <reference path="./shims.d.ts" />
import { BosClient } from "bce-sdk-js";
import {
  makeEnsurePublicUrl,
  prepareUpload,
  toSchemeUri,
  uploadFileViaBytes,
} from "./common";
import type { BosConfig } from "./bos-config";
import type {
  MediaKind,
  ObjectStorage,
  UploadInput,
  UploadResult,
} from "./types";

export function createBosStorage(config: BosConfig): ObjectStorage {
  const client = new BosClient({
    endpoint: config.endpoint,
    credentials: {
      ak: config.accessKey,
      sk: config.secretKey,
    },
  });

  async function uploadBytes(input: UploadInput): Promise<UploadResult> {
    const prepared = prepareUpload(input);
    await client.putObjectFromBlob(
      config.bucket,
      prepared.key,
      prepared.bytes,
      {
        "Content-Type": prepared.mime,
        "Content-Length": String(prepared.bytes.length),
      },
    );
    const uri = toSchemeUri("bos", config.bucket, prepared.key);
    const publicUrl = `${config.publicBaseUrl}/${prepared.key}`;
    return {
      bucket: config.bucket,
      key: prepared.key,
      kind: prepared.kind,
      mime: prepared.mime,
      uri,
      publicUrl,
      url: publicUrl,
    };
  }

  return {
    provider: "bos",
    isConfigured: () => true,
    uploadBytes,
    uploadFile: (file, kind?: MediaKind) =>
      uploadFileViaBytes(uploadBytes, file, kind),
    ensurePublicUrl: makeEnsurePublicUrl({
      scheme: "bos",
      bucket: config.bucket,
      publicBaseUrl: config.publicBaseUrl,
      uploadBytes,
    }),
  };
}
