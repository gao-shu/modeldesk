import type {
  EnsurePublicUrlOpts,
  MediaKind,
  ObjectStorage,
  UploadInput,
  UploadResult,
} from "./types";

const NOT_CONFIGURED =
  "对象存储未启用（STORAGE_PROVIDER=none）。需要公网 URL 时请配置 tos 或 s3，见 .env.example。";

/**
 * Default driver for self-host / open-source: no cloud upload.
 * ensurePublicUrl keeps https / data URI / base64 unchanged.
 */
export function createNoneStorage(): ObjectStorage {
  async function uploadBytes(_input: UploadInput): Promise<UploadResult> {
    throw new Error(NOT_CONFIGURED);
  }

  async function uploadFile(
    _file: {
      arrayBuffer: () => Promise<ArrayBuffer>;
      type?: string;
      name?: string;
    },
    _kind?: MediaKind,
  ): Promise<UploadResult> {
    throw new Error(NOT_CONFIGURED);
  }

  async function ensurePublicUrl(
    value: string | null | undefined,
    _opts?: EnsurePublicUrlOpts,
  ): Promise<string | undefined> {
    if (!value?.trim()) return undefined;
    return value.trim();
  }

  return {
    provider: "none",
    isConfigured: () => false,
    uploadBytes,
    uploadFile,
    ensurePublicUrl,
  };
}
