export type OssConfig = {
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  endpoint?: string;
  publicBaseUrl: string;
  objectAcl: "public-read" | null;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function derivePublicBaseUrl(input: {
  bucket: string;
  region: string;
  endpoint?: string;
}): string {
  if (input.endpoint) {
    try {
      const raw = /^https?:\/\//i.test(input.endpoint)
        ? input.endpoint
        : `https://${input.endpoint}`;
      const u = new URL(raw);
      if (u.hostname === input.bucket || u.hostname.startsWith(`${input.bucket}.`)) {
        return stripTrailingSlash(`${u.protocol}//${u.host}`);
      }
      return stripTrailingSlash(`${u.protocol}//${input.bucket}.${u.host}`);
    } catch {
      /* fall through */
    }
  }
  return `https://${input.bucket}.${input.region}.aliyuncs.com`;
}

/** Read OSS_* from env. Returns null when incomplete. */
export function ossConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OssConfig | null {
  const bucket = env.OSS_BUCKET?.trim() ?? "";
  const accessKey =
    env.OSS_ACCESS_KEY?.trim() ||
    env.OSS_ACCESS_KEY_ID?.trim() ||
    env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim() ||
    "";
  const secretKey =
    env.OSS_SECRET_KEY?.trim() ||
    env.OSS_ACCESS_KEY_SECRET?.trim() ||
    env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim() ||
    "";
  if (!bucket || !accessKey || !secretKey) return null;

  const region = env.OSS_REGION?.trim() || "oss-cn-hangzhou";
  const endpoint = env.OSS_ENDPOINT?.trim() || undefined;
  const skipAcl =
    env.OSS_SKIP_ACL === "1" || env.OSS_SKIP_ACL?.toLowerCase() === "true";

  return {
    bucket,
    region,
    accessKey,
    secretKey,
    endpoint,
    publicBaseUrl: stripTrailingSlash(
      env.OSS_PUBLIC_BASE_URL?.trim() ||
        derivePublicBaseUrl({ bucket, region, endpoint }),
    ),
    objectAcl: skipAcl ? null : "public-read",
  };
}
