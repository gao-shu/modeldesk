export type BosConfig = {
  bucket: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  publicBaseUrl: string;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function normalizeEndpoint(raw: string): string {
  const t = raw.trim();
  if (!t) return "https://bj.bcebos.com";
  if (/^https?:\/\//i.test(t)) return stripTrailingSlash(t);
  return `https://${t.replace(/\/+$/, "")}`;
}

/** Read BOS_* from env. Returns null when incomplete. */
export function bosConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): BosConfig | null {
  const bucket = env.BOS_BUCKET?.trim() ?? "";
  const accessKey =
    env.BOS_ACCESS_KEY?.trim() ||
    env.BOS_AK?.trim() ||
    env.BAIDUCLOUD_ACCESS_KEY?.trim() ||
    "";
  const secretKey =
    env.BOS_SECRET_KEY?.trim() ||
    env.BOS_SK?.trim() ||
    env.BAIDUCLOUD_SECRET_KEY?.trim() ||
    "";
  if (!bucket || !accessKey || !secretKey) return null;

  const endpoint = normalizeEndpoint(
    env.BOS_ENDPOINT?.trim() || "https://bj.bcebos.com",
  );

  // Virtual-hosted style: https://{bucket}.{host}
  let publicBaseUrl = env.BOS_PUBLIC_BASE_URL?.trim();
  if (!publicBaseUrl) {
    try {
      const u = new URL(endpoint);
      publicBaseUrl = `${u.protocol}//${bucket}.${u.host}`;
    } catch {
      publicBaseUrl = `${endpoint}/${bucket}`;
    }
  }

  return {
    bucket,
    endpoint,
    accessKey,
    secretKey,
    publicBaseUrl: stripTrailingSlash(publicBaseUrl),
  };
}
