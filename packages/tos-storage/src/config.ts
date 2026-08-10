import type { TosConfig } from "./types";

function stripHost(endpoint: string): string {
  return endpoint.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Read TOS_* from process.env. Returns null when incomplete. */
export function tosConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TosConfig | null {
  const bucket = env.TOS_BUCKET?.trim() ?? "";
  const accessKey =
    env.TOS_ACCESS_KEY?.trim() || env.TOS_ACCESS_KEY_ID?.trim() || "";
  const secretKey =
    env.TOS_SECRET_KEY?.trim() || env.TOS_ACCESS_KEY_SECRET?.trim() || "";
  const endpoint = stripHost(
    env.TOS_ENDPOINT?.trim() || "tos-cn-beijing.volces.com",
  );
  const region = env.TOS_REGION?.trim() || "cn-beijing";
  if (!bucket || !accessKey || !secretKey) return null;

  const publicBaseUrl = (
    env.TOS_PUBLIC_BASE_URL?.trim() || `https://${bucket}.${endpoint}`
  ).replace(/\/+$/, "");

  return { bucket, endpoint, region, accessKey, secretKey, publicBaseUrl };
}

export function assertTosConfig(config: TosConfig | null): TosConfig {
  if (!config) {
    throw new Error(
      "TOS 未配置（需要 TOS_BUCKET / TOS_ACCESS_KEY / TOS_SECRET_KEY）",
    );
  }
  return config;
}
