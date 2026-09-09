/**
 * Pure helpers for image adapter routing / OpenAI-async field mapping.
 * Kept small and fixture-testable (PHASE2 D5).
 */

export function isAgnesApiBaseUrl(baseUrl: string | null | undefined): boolean {
  if (!baseUrl) return false;
  return baseUrl.toLowerCase().includes("agnes-ai.com");
}

export function isVolcengineArkImageBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return u.includes("volces.com") || u.includes("volcengine");
}

export function isZhipuImageBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  if (!baseUrl) return false;
  const u = baseUrl.toLowerCase();
  return (
    u.includes("bigmodel.cn") ||
    u.includes("bigmodel.com") ||
    u.includes("open.bigmodel")
  );
}

/** Map UI quality → async relay quality (auto | 2k | 4k). */
export function mapOpenAiAsyncQuality(
  quality: string | undefined,
  size?: string,
): "auto" | "2k" | "4k" {
  const q = (quality ?? "auto").trim().toLowerCase();
  if (q === "4k") return "4k";
  if (q === "2k") return "2k";
  if (q === "high" || q === "medium" || q === "low") return "auto";
  const tier = (size ?? "").trim().toLowerCase();
  if (tier === "4k") return "4k";
  if (tier === "2k") return "2k";
  return "auto";
}

/** Async relay uses ratio strings in `size`, not pixels. */
export function mapOpenAiAsyncSize(
  size: string | undefined,
  ratio: string | undefined,
): string {
  const candidate = (ratio ?? size ?? "16:9").trim();
  if (/^\d+:\d+$/.test(candidate)) return candidate;
  return "16:9";
}

/**
 * Volcengine Ark Seedream 推荐宽高（文档方式 2）。
 * 官方无独立 aspect_ratio：指定比例时把 分辨率+宽高比 换成 WxH。
 */
const SEEDREAM_PIXEL_MAP: Record<string, Record<string, string>> = {
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2848x1600",
    "9:16": "1600x2848",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3136x1344",
  },
  "3K": {
    "1:1": "3072x3072",
    "4:3": "3456x2592",
    "3:4": "2592x3456",
    "16:9": "4096x2304",
    "9:16": "2304x4096",
    "3:2": "3744x2496",
    "2:3": "2496x3744",
    "21:9": "4704x2016",
  },
  "4K": {
    "1:1": "4096x4096",
    "4:3": "4704x3520",
    "3:4": "3520x4704",
    "16:9": "5504x3040",
    "9:16": "3040x5504",
    "3:2": "4992x3328",
    "2:3": "3328x4992",
    "21:9": "6240x2656",
  },
};

/** Resolve Seedream `size` for API: tier (adaptive) or recommended WxH. */
export function resolveSeedreamSize(
  size: string | undefined,
  ratio?: string | undefined,
): string {
  const sizeRaw = (size ?? "2K").trim();
  if (/^\d+x\d+$/i.test(sizeRaw)) return sizeRaw;

  const tierMatch = sizeRaw.match(/^([1-4])[Kk]$/);
  const tier = tierMatch ? `${tierMatch[1]}K` : "2K";
  const r = (ratio ?? "").trim().toLowerCase();
  if (!r || r === "adaptive" || r === "auto" || r === "默认") {
    return tier;
  }
  return SEEDREAM_PIXEL_MAP[tier]?.[r] ?? SEEDREAM_PIXEL_MAP["2K"]?.[r] ?? tier;
}
