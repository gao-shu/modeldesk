/** Catalog modules for radar dashboard — empty by default (open-source safe). */

export type CatalogMerchant = {
  name: string;
  url: string;
  note?: string;
  reason?: string;
  plan?: {
    price?: string;
    quota?: string;
    daily?: string;
    concurrency?: string;
  };
};

export type CatalogModel = {
  id: string;
  name: string;
  verifyModelId?: string;
  merchants: CatalogMerchant[];
};

export type CatalogModule = {
  id: "llm" | "image" | "video" | "tts";
  title: string;
  blurb: string;
  models: CatalogModel[];
};

export function formatMerchantPlan(
  plan: CatalogMerchant["plan"],
): string {
  if (!plan) return "";
  return [plan.price, plan.quota, plan.daily, plan.concurrency]
    .filter(Boolean)
    .join(" · ");
}

/** 演示商家：仅用于 RADAR_DEMO_CATALOG=1 */
const demo = (
  name: string,
  note: string,
  reason: string,
  plan?: CatalogMerchant["plan"],
): CatalogMerchant => ({
  name: `DEMO · ${name}`,
  url: "https://example.com",
  note,
  reason,
  plan,
});

/** Fake merchants for local UI demos — never the default export. */
export const DEMO_CATALOG_MODULES: CatalogModule[] = [
  {
    id: "llm",
    title: "大语言模型",
    blurb: "演示数据：选模型 → 看假商家 → 去验证 Key。",
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        verifyModelId: "gpt-4o",
        merchants: [
          demo("低价中转", "按量", "演示：同档偏低价", {
            price: "$2.5 / 1M in",
            quota: "按量",
          }),
        ],
      },
      {
        id: "deepseek-v3",
        name: "DeepSeek V3",
        verifyModelId: "deepseek-chat",
        merchants: [demo("DeepSeek 渠道", "国产价", "演示：国产模型低价")],
      },
    ],
  },
  {
    id: "image",
    title: "生图模型",
    blurb: "演示渠道占位。",
    models: [
      {
        id: "gpt-image-1",
        name: "GPT Image 1",
        verifyModelId: "gpt-image-1",
        merchants: [demo("生图站 A", "按张", "演示：按张出图")],
      },
    ],
  },
  {
    id: "video",
    title: "生视频模型",
    blurb: "演示位可为空商家。",
    models: [{ id: "runway-gen3", name: "Runway Gen-3", merchants: [] }],
  },
  {
    id: "tts",
    title: "TTS 语音",
    blurb: "演示音色渠道。",
    models: [
      {
        id: "tts-1",
        name: "OpenAI TTS-1",
        verifyModelId: "tts-1",
        merchants: [
          demo("TTS 渠道 A", "按字符", "演示：标准音色", { price: "按字符" }),
        ],
      },
    ],
  },
];

function demoCatalogEnabled(): boolean {
  const v = process.env.RADAR_DEMO_CATALOG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Active catalog: empty unless RADAR_DEMO_CATALOG=1. */
export const CATALOG_MODULES: CatalogModule[] = demoCatalogEnabled()
  ? DEMO_CATALOG_MODULES
  : [];
