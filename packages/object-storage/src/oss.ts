import OSS from "ali-oss";
import {
  makeEnsurePublicUrl,
  prepareUpload,
  toSchemeUri,
  uploadFileViaBytes,
} from "./common";
import type { OssConfig } from "./oss-config";
import type {
  MediaKind,
  ObjectStorage,
  UploadInput,
  UploadResult,
} from "./types";

export function createOssStorage(config: OssConfig): ObjectStorage {
  const client = new OSS({
    region: config.region,
    accessKeyId: config.accessKey,
    accessKeySecret: config.secretKey,
    bucket: config.bucket,
    ...(config.endpoint
      ? {
          endpoint: config.endpoint.replace(/^https?:\/\//i, ""),
          secure: !/^http:\/\//i.test(config.endpoint),
        }
      : {}),
  });

  async function uploadBytes(input: UploadInput): Promise<UploadResult> {
    const prepared = prepareUpload(input);
    await client.put(prepared.key, prepared.bytes, {
      headers: {
        "Content-Type": prepared.mime,
        ...(prepared.publicRead && config.objectAcl
          ? { "x-oss-object-acl": config.objectAcl }
          : {}),
      },
      mime: prepared.mime,
    });
    const uri = toSchemeUri("oss", config.bucket, prepared.key);
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
    provider: "oss",
    isConfigured: () => true,
    uploadBytes,
    uploadFile: (file, kind?: MediaKind) =>
      uploadFileViaBytes(uploadBytes, file, kind),
    ensurePublicUrl: makeEnsurePublicUrl({
      scheme: "oss",
      bucket: config.bucket,
      publicBaseUrl: config.publicBaseUrl,
      uploadBytes,
    }),
  };
}
