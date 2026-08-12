export type S3Config = {
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  /** Custom endpoint host or URL (MinIO, gateway). Empty = AWS default. */
  endpoint?: string;
  /** Path-style URLs — usually required for MinIO. */
  forcePathStyle: boolean;
  /** Public/CDN base without trailing slash. */
  publicBaseUrl: string;
  /**
   * Send ACL public-read on PutObject.
   * Disable when the bucket rejects ACL (policy-only buckets).
   */
  objectAcl: "public-read" | null;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizeEndpoint(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return stripTrailingSlash(t);
  return `https://${t.replace(/\/+$/, "")}`;
}

function derivePublicBaseUrl(input: {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
}): string {
  if (input.endpoint) {
    if (input.forcePathStyle) {
      return `${input.endpoint}/${input.bucket}`;
    }
    try {
      const u = new URL(input.endpoint);
      return `${u.protocol}//${input.bucket}.${u.host}`;
    } catch {
      return `${input.endpoint}/${input.bucket}`;
    }
  }
  return `https://${input.bucket}.s3.${input.region}.amazonaws.com`;
}

/** Read S3_* from env. Returns null when incomplete. */
export function s3ConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): S3Config | null {
  const bucket = env.S3_BUCKET?.trim() ?? "";
  const accessKey =
    env.S3_ACCESS_KEY?.trim() ||
    env.S3_ACCESS_KEY_ID?.trim() ||
    env.AWS_ACCESS_KEY_ID?.trim() ||
    "";
  const secretKey =
    env.S3_SECRET_KEY?.trim() ||
    env.S3_SECRET_ACCESS_KEY?.trim() ||
    env.AWS_SECRET_ACCESS_KEY?.trim() ||
    "";
  if (!bucket || !accessKey || !secretKey) return null;

  const region =
    env.S3_REGION?.trim() ||
    env.AWS_REGION?.trim() ||
    env.AWS_DEFAULT_REGION?.trim() ||
    "us-east-1";
  const endpointRaw = env.S3_ENDPOINT?.trim() ?? "";
  const endpoint = endpointRaw ? normalizeEndpoint(endpointRaw) : undefined;
  const forcePathStyle =
    env.S3_FORCE_PATH_STYLE === "1" ||
    env.S3_FORCE_PATH_STYLE?.toLowerCase() === "true" ||
    Boolean(endpoint && /localhost|127\.0\.0\.1/i.test(endpoint));

  const skipAcl =
    env.S3_SKIP_ACL === "1" ||
    env.S3_SKIP_ACL?.toLowerCase() === "true" ||
    env.S3_PUBLIC_ACL === "0";

  const publicBaseUrl = stripTrailingSlash(
    env.S3_PUBLIC_BASE_URL?.trim() ||
      derivePublicBaseUrl({
        bucket,
        region,
        endpoint,
        forcePathStyle,
      }),
  );

  return {
    bucket,
    region,
    accessKey,
    secretKey,
    endpoint,
    forcePathStyle,
    publicBaseUrl,
    objectAcl: skipAcl ? null : "public-read",
  };
}

export function assertS3Config(config: S3Config | null): S3Config {
  if (!config) {
    throw new Error(
      "S3 未配置（需要 S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY，并设置 STORAGE_PROVIDER=s3）",
    );
  }
  return config;
}
