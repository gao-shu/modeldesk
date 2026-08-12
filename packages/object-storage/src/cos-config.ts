export type CosConfig = {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  publicBaseUrl: string;
  objectAcl: "public-read" | null;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Read COS_* from env. Returns null when incomplete. */
export function cosConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CosConfig | null {
  const bucket = env.COS_BUCKET?.trim() ?? "";
  const secretId =
    env.COS_SECRET_ID?.trim() ||
    env.COS_ACCESS_KEY?.trim() ||
    env.TENCENTCLOUD_SECRET_ID?.trim() ||
    "";
  const secretKey =
    env.COS_SECRET_KEY?.trim() ||
    env.TENCENTCLOUD_SECRET_KEY?.trim() ||
    "";
  if (!bucket || !secretId || !secretKey) return null;

  const region = env.COS_REGION?.trim() || "ap-guangzhou";
  const skipAcl =
    env.COS_SKIP_ACL === "1" || env.COS_SKIP_ACL?.toLowerCase() === "true";

  return {
    bucket,
    region,
    secretId,
    secretKey,
    publicBaseUrl: stripTrailingSlash(
      env.COS_PUBLIC_BASE_URL?.trim() ||
        `https://${bucket}.cos.${region}.myqcloud.com`,
    ),
    objectAcl: skipAcl ? null : "public-read",
  };
}
