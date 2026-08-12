/**
 * Volcengine Ark model ID canonicalization.
 * UI / DB store official dated IDs; short aliases remain for legacy configs
 * and are resolved here (and in adapters).
 */

const SEEDANCE_ALIASES: Readonly<Record<string, string>> = {
  "1": "doubao-seedance-1-0-pro-fast-251015",
  "1.0": "doubao-seedance-1-0-pro-250528",
  "1.0-pro": "doubao-seedance-1-0-pro-250528",
  "1.0-fast": "doubao-seedance-1-0-pro-fast-251015",
  "seedance-1.0": "doubao-seedance-1-0-pro-250528",
  "seedance-1.0-pro": "doubao-seedance-1-0-pro-250528",
  "seedance-1.0-fast": "doubao-seedance-1-0-pro-fast-251015",
  "1.0-lite-t2v": "doubao-seedance-1-0-lite-t2v-250428",
  "1.0-lite-i2v": "doubao-seedance-1-0-lite-i2v-250428",
  "1.5": "doubao-seedance-1-5-pro-251215",
  "1.5-pro": "doubao-seedance-1-5-pro-251215",
  "seedance-1.5": "doubao-seedance-1-5-pro-251215",
  "seedance-1.5-pro": "doubao-seedance-1-5-pro-251215",
  "doubao-seedance-1.5-pro": "doubao-seedance-1-5-pro-251215",
  "2": "doubao-seedance-2-0-260128",
  "2.0": "doubao-seedance-2-0-260128",
  "seedance-2": "doubao-seedance-2-0-260128",
  "seedance-2.0": "doubao-seedance-2-0-260128",
  "doubao-seedance-2.0": "doubao-seedance-2-0-260128",
  "2-fast": "doubao-seedance-2-0-fast-260128",
  "2.0-fast": "doubao-seedance-2-0-fast-260128",
  "doubao-seedance-2.0-fast": "doubao-seedance-2-0-fast-260128",
  "2-mini": "doubao-seedance-2-0-mini-260615",
  "2.0-mini": "doubao-seedance-2-0-mini-260615",
  "doubao-seedance-2.0-mini": "doubao-seedance-2-0-mini-260615",
  "2.5": "doubao-seedance-2-5-260628",
  "seedance-2.5": "doubao-seedance-2-5-260628",
  "doubao-seedance-2.5": "doubao-seedance-2-5-260628",
  "doubao-seedance-2-5": "doubao-seedance-2-5-260628",
};

const SEEDREAM_ALIASES: Readonly<Record<string, string>> = {
  "5": "doubao-seedream-5-0-260128",
  "5.0": "doubao-seedream-5-0-260128",
  "seedream-5": "doubao-seedream-5-0-260128",
  "seedream-5.0": "doubao-seedream-5-0-260128",
  "doubao-seedream-5": "doubao-seedream-5-0-260128",
  "doubao-seedream-5.0": "doubao-seedream-5-0-260128",
  "doubao-seedream-5-0": "doubao-seedream-5-0-260128",
  "doubao-seedream-5.0-lite": "doubao-seedream-5-0-260128",
  "5-pro": "doubao-seedream-5-0-pro-260628",
  "5.0-pro": "doubao-seedream-5-0-pro-260628",
  "seedream-5-pro": "doubao-seedream-5-0-pro-260628",
  "seedream-5.0-pro": "doubao-seedream-5-0-pro-260628",
  "4.5": "doubao-seedream-4-5-251128",
  "seedream-4.5": "doubao-seedream-4-5-251128",
  "seedream-4-5": "doubao-seedream-4-5-251128",
  "doubao-seedream-4.5": "doubao-seedream-4-5-251128",
  "doubao-seedream-4-5": "doubao-seedream-4-5-251128",
  "4.0": "doubao-seedream-4-0-250828",
  "4": "doubao-seedream-4-0-250828",
  "seedream-4": "doubao-seedream-4-0-250828",
  "seedream-4.0": "doubao-seedream-4-0-250828",
  "seedream-4-0": "doubao-seedream-4-0-250828",
  "doubao-seedream-4.0": "doubao-seedream-4-0-250828",
  "doubao-seedream-4-0": "doubao-seedream-4-0-250828",
  "doubao-seedream-4": "doubao-seedream-4-0-250828",
};

const WAN_ALIASES: Readonly<Record<string, string>> = {
  t2v: "wan2-1-14b-t2v-250225",
  "wan-t2v": "wan2-1-14b-t2v-250225",
  i2v: "wan2-1-14b-i2v-250225",
  "wan-i2v": "wan2-1-14b-i2v-250225",
};

export function canonicalizeSeedanceModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return trimmed;
  return SEEDANCE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function canonicalizeSeedreamModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return trimmed;
  const key = trimmed.toLowerCase().replace(/_/g, "-");
  return SEEDREAM_ALIASES[key] ?? trimmed;
}

export function canonicalizeWanModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) return trimmed;
  return WAN_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

/** Resolve short / legacy aliases to official dated Model IDs for known formats. */
export function canonicalizeApiModelId(
  apiFormatId: string | null | undefined,
  modelId: string,
): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  const fmt = (apiFormatId ?? "").trim().toLowerCase();
  if (fmt === "video.volcengine-seedance") {
    return canonicalizeSeedanceModelId(trimmed);
  }
  if (fmt === "image.volcengine-seedream") {
    return canonicalizeSeedreamModelId(trimmed);
  }
  if (fmt === "video.volcengine-wan") {
    return canonicalizeWanModelId(trimmed);
  }
  return trimmed;
}
