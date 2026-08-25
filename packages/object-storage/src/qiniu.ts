import { createS3Storage } from "./s3";
import type { S3Config } from "./s3-config";
import type { ObjectStorage } from "./types";
import { qiniuConfigFromEnv } from "./qiniu-config";

/** Qiniu Kodo via S3-compatible API. */
export function createQiniuStorage(config: S3Config): ObjectStorage {
  const inner = createS3Storage(config);
  return { ...inner, provider: "qiniu" };
}

export function createQiniuStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStorage | null {
  const cfg = qiniuConfigFromEnv(env);
  if (!cfg) return null;
  return createQiniuStorage(cfg);
}
