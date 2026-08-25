import type { S3Config } from "./s3-config";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizeEndpoint(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return stripTrailingSlash(t);
  return `https://${t.replace(/\/+$/, "")}`;
}

/** Read QINIU_* from env. Returns null when incomplete. */
export function qiniuConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): S3Config | null {
  const bucket = env.QINIU_BUCKET?.trim() ?? "";
  const accessKey = env.QINIU_ACCESS_KEY?.trim() ?? "";
  const secretKey = env.QINIU_SECRET_KEY?.trim() ?? "";
  if (!bucket || !accessKey || !secretKey) return null;

  const region = env.QINIU_REGION?.trim() || "cn-north-1";
  const endpointRaw =
    env.QINIU_ENDPOINT?.trim() || `s3.${region}.qiniucs.com`;
  const endpoint = normalizeEndpoint(endpointRaw);
  const forcePathStyle =
    env.QINIU_FORCE_PATH_STYLE === "1" ||
    env.QINIU_FORCE_PATH_STYLE?.toLowerCase() === "true";
  const skipAcl =
    env.QINIU_SKIP_ACL === "1" ||
    env.QINIU_SKIP_ACL?.toLowerCase() === "true" ||
    env.QINIU_SKIP_ACL === undefined;

  const publicBaseUrl = stripTrailingSlash(
    env.QINIU_PUBLIC_BASE_URL?.trim() ||
      `https://${bucket}.s3.${region}.qiniucs.com`,
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
