import { tosConfigFromEnv } from "@modeldesk/tos-storage";
import { bosConfigFromEnv } from "./bos-config";
import { createBosStorage } from "./bos";
import { cosConfigFromEnv } from "./cos-config";
import { createCosStorage } from "./cos";
import { createNoneStorage } from "./none";
import { ossConfigFromEnv } from "./oss-config";
import { createOssStorage } from "./oss";
import { s3ConfigFromEnv } from "./s3-config";
import { createS3Storage } from "./s3";
import { createTosObjectStorageFromEnv } from "./tos";
import type { ObjectStorage, StorageProvider } from "./types";

export const STORAGE_PROVIDERS: readonly StorageProvider[] = [
  "none",
  "tos",
  "s3",
  "oss",
  "cos",
  "bos",
] as const;

export const CLOUD_STORAGE_PROVIDERS = [
  "tos",
  "s3",
  "oss",
  "cos",
  "bos",
] as const satisfies readonly StorageProvider[];

export type CloudStorageProvider = (typeof CLOUD_STORAGE_PROVIDERS)[number];

/**
 * Resolve provider from env.
 * Default is always `none` unless STORAGE_PROVIDER is set explicitly.
 */
export function resolveStorageProvider(
  env: NodeJS.ProcessEnv = process.env,
): StorageProvider {
  const raw = env.STORAGE_PROVIDER?.trim().toLowerCase() ?? "";
  if ((STORAGE_PROVIDERS as readonly string[]).includes(raw)) {
    return raw as StorageProvider;
  }
  return "none";
}

export function isCloudStorageProvider(
  value: string,
): value is CloudStorageProvider {
  return (CLOUD_STORAGE_PROVIDERS as readonly string[]).includes(value);
}

/** Whether env has complete credentials for a cloud provider. */
export function providerCredentialsReady(
  provider: StorageProvider,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  switch (provider) {
    case "tos":
      return tosConfigFromEnv(env) != null;
    case "s3":
      return s3ConfigFromEnv(env) != null;
    case "oss":
      return ossConfigFromEnv(env) != null;
    case "cos":
      return cosConfigFromEnv(env) != null;
    case "bos":
      return bosConfigFromEnv(env) != null;
    default:
      return false;
  }
}

export type ProviderCredentialStatus = {
  provider: CloudStorageProvider;
  ready: boolean;
};

export function listCloudProviderStatus(
  env: NodeJS.ProcessEnv = process.env,
): ProviderCredentialStatus[] {
  return CLOUD_STORAGE_PROVIDERS.map((provider) => ({
    provider,
    ready: providerCredentialsReady(provider, env),
  }));
}

/**
 * Plain in-memory credentials (e.g. decrypted from SQLite).
 * Maps onto the same *ConfigFromEnv helpers so defaults stay consistent.
 */
export type CloudDriverConfig = {
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
  endpoint?: string;
  publicBaseUrl?: string;
  forcePathStyle?: boolean;
  skipAcl?: boolean;
};

/** Convert CloudDriverConfig → isolated env bag for one provider. */
export function cloudDriverConfigToEnv(
  provider: CloudStorageProvider,
  config: CloudDriverConfig,
): Record<string, string> {
  const bucket = config.bucket.trim();
  const accessKey = config.accessKey.trim();
  const secretKey = config.secretKey.trim();
  const region = config.region?.trim() ?? "";
  const endpoint = config.endpoint?.trim() ?? "";
  const publicBaseUrl = config.publicBaseUrl?.trim() ?? "";
  const forcePathStyle = config.forcePathStyle ? "1" : "0";
  const skipAcl = config.skipAcl ? "1" : "0";

  switch (provider) {
    case "tos":
      return {
        TOS_BUCKET: bucket,
        TOS_ACCESS_KEY: accessKey,
        TOS_SECRET_KEY: secretKey,
        ...(region ? { TOS_REGION: region } : {}),
        ...(endpoint ? { TOS_ENDPOINT: endpoint } : {}),
        ...(publicBaseUrl ? { TOS_PUBLIC_BASE_URL: publicBaseUrl } : {}),
      };
    case "s3":
      return {
        S3_BUCKET: bucket,
        S3_ACCESS_KEY: accessKey,
        S3_SECRET_KEY: secretKey,
        ...(region ? { S3_REGION: region } : {}),
        ...(endpoint ? { S3_ENDPOINT: endpoint } : {}),
        ...(publicBaseUrl ? { S3_PUBLIC_BASE_URL: publicBaseUrl } : {}),
        S3_FORCE_PATH_STYLE: forcePathStyle,
        S3_SKIP_ACL: skipAcl,
      };
    case "oss":
      return {
        OSS_BUCKET: bucket,
        OSS_ACCESS_KEY: accessKey,
        OSS_SECRET_KEY: secretKey,
        ...(region ? { OSS_REGION: region } : {}),
        ...(endpoint ? { OSS_ENDPOINT: endpoint } : {}),
        ...(publicBaseUrl ? { OSS_PUBLIC_BASE_URL: publicBaseUrl } : {}),
        OSS_SKIP_ACL: skipAcl,
      };
    case "cos":
      return {
        COS_BUCKET: bucket,
        COS_SECRET_ID: accessKey,
        COS_SECRET_KEY: secretKey,
        ...(region ? { COS_REGION: region } : {}),
        ...(publicBaseUrl ? { COS_PUBLIC_BASE_URL: publicBaseUrl } : {}),
        COS_SKIP_ACL: skipAcl,
      };
    case "bos":
      return {
        BOS_BUCKET: bucket,
        BOS_ACCESS_KEY: accessKey,
        BOS_SECRET_KEY: secretKey,
        ...(endpoint ? { BOS_ENDPOINT: endpoint } : {}),
        ...(publicBaseUrl ? { BOS_PUBLIC_BASE_URL: publicBaseUrl } : {}),
      };
  }
}

/** Build a driver from explicit credentials (does not read process.env). */
export function createObjectStorageFromCloudConfig(
  provider: CloudStorageProvider,
  config: CloudDriverConfig,
): ObjectStorage {
  return createObjectStorageForProvider(
    provider,
    cloudDriverConfigToEnv(provider, config) as NodeJS.ProcessEnv,
  );
}

function createUnreadyStorage(
  provider: StorageProvider,
  message: string,
): ObjectStorage {
  const none = createNoneStorage();
  return {
    provider,
    isConfigured: () => false,
    uploadBytes: async () => {
      throw new Error(message);
    },
    uploadFile: async () => {
      throw new Error(message);
    },
    ensurePublicUrl: (value, opts) => none.ensurePublicUrl(value, opts),
  };
}

/** Build a driver for an explicit provider (UI / API). */
export function createObjectStorageForProvider(
  provider: StorageProvider,
  env: NodeJS.ProcessEnv = process.env,
): ObjectStorage {
  if (provider === "none") {
    return createNoneStorage();
  }

  if (provider === "s3") {
    const cfg = s3ConfigFromEnv(env);
    if (cfg) return createS3Storage(cfg);
    return createUnreadyStorage(
      "s3",
      "STORAGE_PROVIDER=s3 但 S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY 未配齐。",
    );
  }

  if (provider === "oss") {
    const cfg = ossConfigFromEnv(env);
    if (cfg) return createOssStorage(cfg);
    return createUnreadyStorage(
      "oss",
      "STORAGE_PROVIDER=oss 但 OSS_BUCKET / OSS_ACCESS_KEY / OSS_SECRET_KEY 未配齐。",
    );
  }

  if (provider === "cos") {
    const cfg = cosConfigFromEnv(env);
    if (cfg) return createCosStorage(cfg);
    return createUnreadyStorage(
      "cos",
      "STORAGE_PROVIDER=cos 但 COS_BUCKET / COS_SECRET_ID / COS_SECRET_KEY 未配齐。",
    );
  }

  if (provider === "bos") {
    const cfg = bosConfigFromEnv(env);
    if (cfg) return createBosStorage(cfg);
    return createUnreadyStorage(
      "bos",
      "STORAGE_PROVIDER=bos 但 BOS_BUCKET / BOS_ACCESS_KEY / BOS_SECRET_KEY 未配齐。",
    );
  }

  const tos = createTosObjectStorageFromEnv(env);
  if (tos) return tos;

  return createUnreadyStorage(
    "tos",
    "STORAGE_PROVIDER=tos 但 TOS_BUCKET / TOS_ACCESS_KEY / TOS_SECRET_KEY 未配齐。",
  );
}

/**
 * Build the active object-storage driver from env STORAGE_PROVIDER.
 * Prefer app UI prefs + createObjectStorageForProvider in the web app.
 */
export function createObjectStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStorage {
  return createObjectStorageForProvider(resolveStorageProvider(env), env);
}
