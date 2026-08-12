/** First-party API hosts — skip relay swap-detection suites. */

const OFFICIAL_HOST_SUFFIXES = [
  "openai.com",
  "anthropic.com",
  "googleapis.com",
  "google.com",
  "x.ai",
  "bigmodel.cn",
  "zhipuai.cn",
  "deepseek.com",
  "moonshot.cn",
  "aliyuncs.com",
  "dashscope.aliyuncs.com",
  "volces.com",
  "volcengineapi.com",
  "volcengine.com",
  "baichuan-ai.com",
  "minimax.chat",
  "minimax.io",
  "lingyiwanwu.com",
  "tencentcloudapi.com",
  "xf-yun.com",
  "baidubce.com",
  "siliconflow.cn",
  "together.xyz",
  "groq.com",
  "mistral.ai",
  "cohere.ai",
  "cohere.com",
  "fireworks.ai",
  "perplexity.ai",
] as const;

export type ProbeChannel = "official" | "relay";

export function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isOfficialApiHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return OFFICIAL_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function classifyProbeChannel(baseUrlOrEndpoint: string): ProbeChannel {
  const host = hostnameFromUrl(baseUrlOrEndpoint);
  if (host && isOfficialApiHost(host)) return "official";
  return "relay";
}
