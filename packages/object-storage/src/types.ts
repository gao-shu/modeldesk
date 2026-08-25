/** Media category → temp/ prefix folders. */
export type MediaKind = "image" | "video" | "voice";

/** Configured drivers. */
export type StorageProvider =
  | "none"
  | "tos"
  | "s3"
  | "qiniu"
  | "oss"
  | "cos"
  | "bos";

export type UploadInput = {
  bytes: Buffer | Uint8Array;
  mime?: string;
  filename?: string;
  kind?: MediaKind;
  /** Prefer public-read when the driver supports ACL. Default true. */
  publicRead?: boolean;
};

export type UploadResult = {
  /** Bucket name when the driver uses one. */
  bucket?: string;
  key: string;
  kind: MediaKind;
  mime: string;
  /**
   * Driver-specific object URI, e.g. `tos://bucket/key` or `s3://bucket/key`.
   * Prefer this over vendor-specific fields in new code.
   */
  uri: string;
  /** @deprecated Prefer `uri`. Kept when provider=tos for older callers. */
  tosUri?: string;
  /** Public HTTPS URL for upstream providers. */
  publicUrl: string;
  /** Alias of publicUrl. */
  url: string;
};

export type EnsurePublicUrlOpts = {
  kind?: MediaKind;
  mime?: string;
};

/**
 * Uniform object-storage port.
 * Local artifacts stay on disk; this is only for public temp URLs.
 */
export type ObjectStorage = {
  readonly provider: StorageProvider;
  /** True when uploadBytes / ensurePublicUrl can produce a public https URL. */
  isConfigured(): boolean;
  uploadBytes(input: UploadInput): Promise<UploadResult>;
  uploadFile(
    file: {
      arrayBuffer: () => Promise<ArrayBuffer>;
      type?: string;
      name?: string;
    },
    kind?: MediaKind,
  ): Promise<UploadResult>;
  /**
   * - https?:// → passthrough
   * - data: / raw base64 → upload when configured; else return as-is (none)
   * - tos://… → map via TOS driver when provider=tos
   */
  ensurePublicUrl(
    value: string | null | undefined,
    opts?: EnsurePublicUrlOpts,
  ): Promise<string | undefined>;
};

export const TEMP_PREFIX_BY_KIND: Record<MediaKind, string> = {
  image: "temp/images",
  video: "temp/videos",
  voice: "temp/voice",
};
