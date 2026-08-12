/** Media category mapped to TOS temp/ prefixes. */
export type MediaKind = "image" | "video" | "voice";

export type TosConfig = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  /** e.g. https://your-bucket.tos-cn-beijing.volces.com */
  publicBaseUrl: string;
};

export type UploadInput = {
  bytes: Buffer | Uint8Array;
  mime?: string;
  filename?: string;
  /** Force folder; otherwise inferred from mime/filename. */
  kind?: MediaKind;
  /** Override ACL; default public-read (Agnes needs fetchable URL). */
  publicRead?: boolean;
};

export type UploadResult = {
  bucket: string;
  key: string;
  kind: MediaKind;
  mime: string;
  /** Internal URI: tos://{bucket}/{key} */
  tosUri: string;
  /** Public HTTPS URL for upstream providers. */
  publicUrl: string;
  /** Alias of publicUrl for callers that expect `url`. */
  url: string;
};

/** Prefix for each kind — lifecycle rules should expire `temp/` monthly. */
export const TEMP_PREFIX_BY_KIND: Record<MediaKind, string> = {
  image: "temp/images",
  video: "temp/videos",
  voice: "temp/voice",
};
