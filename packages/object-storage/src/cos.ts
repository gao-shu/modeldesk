import COS from "cos-nodejs-sdk-v5";
import {
  makeEnsurePublicUrl,
  prepareUpload,
  toSchemeUri,
  uploadFileViaBytes,
} from "./common";
import type { CosConfig } from "./cos-config";
import type {
  MediaKind,
  ObjectStorage,
  UploadInput,
  UploadResult,
} from "./types";

type CosPutParams = {
  Bucket: string;
  Region: string;
  Key: string;
  Body: Buffer;
  ContentType?: string;
  ContentLength?: number;
  ACL?: string;
};

function putObject(cos: COS, params: CosPutParams): Promise<unknown> {
  return new Promise((resolve, reject) => {
    cos.putObject(params, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

export function createCosStorage(config: CosConfig): ObjectStorage {
  const cos = new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
  });

  async function uploadBytes(input: UploadInput): Promise<UploadResult> {
    const prepared = prepareUpload(input);
    await putObject(cos, {
      Bucket: config.bucket,
      Region: config.region,
      Key: prepared.key,
      Body: prepared.bytes,
      ContentType: prepared.mime,
      ContentLength: prepared.bytes.length,
      ...(prepared.publicRead && config.objectAcl
        ? { ACL: config.objectAcl }
        : {}),
    });
    const uri = toSchemeUri("cos", config.bucket, prepared.key);
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
    provider: "cos",
    isConfigured: () => true,
    uploadBytes,
    uploadFile: (file, kind?: MediaKind) =>
      uploadFileViaBytes(uploadBytes, file, kind),
    ensurePublicUrl: makeEnsurePublicUrl({
      scheme: "cos",
      bucket: config.bucket,
      publicBaseUrl: config.publicBaseUrl,
      uploadBytes,
    }),
  };
}
