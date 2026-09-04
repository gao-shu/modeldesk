import fs from "node:fs";
import path from "node:path";
import type { RunCoreAgentModality } from "@/lib/server/run-core";
import { getDataDir } from "@/lib/server/paths";

/** Stable alias → modality. Ids themselves never change. */
export const STABLE_ALIASES = {
  "llm-default": "text",
  "image-default": "image",
  "video-default": "video",
  "audio-default": "audio",
} as const satisfies Record<string, RunCoreAgentModality>;

export type StableAlias = keyof typeof STABLE_ALIASES;

export type AliasMap = Partial<Record<StableAlias, string>>;

const ENV_KEYS: Record<StableAlias, string> = {
  "llm-default": "MODELDESK_ALIAS_LLM_DEFAULT",
  "image-default": "MODELDESK_ALIAS_IMAGE_DEFAULT",
  "video-default": "MODELDESK_ALIAS_VIDEO_DEFAULT",
  "audio-default": "MODELDESK_ALIAS_AUDIO_DEFAULT",
};

export function isStableAlias(value: string): value is StableAlias {
  return Object.prototype.hasOwnProperty.call(STABLE_ALIASES, value);
}

export function aliasesFilePath(): string {
  return path.join(getDataDir(), "gateway-aliases.json");
}

/** Aliases stored in `{dataDir}/gateway-aliases.json` (no env merge). */
export function loadStoredAliases(): AliasMap {
  try {
    const p = aliasesFilePath();
    if (!fs.existsSync(p)) return {};
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: AliasMap = {};
    for (const key of Object.keys(STABLE_ALIASES) as StableAlias[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) out[key] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** Effective aliases: file + env overrides (env wins). */
export function loadAliases(): AliasMap {
  const fromFile = loadStoredAliases();
  const out: AliasMap = { ...fromFile };
  for (const alias of Object.keys(STABLE_ALIASES) as StableAlias[]) {
    const envVal = process.env[ENV_KEYS[alias]]?.trim();
    if (envVal) out[alias] = envVal;
  }
  return out;
}

/** Persist file aliases (env still wins at resolve time). */
export function saveAliases(next: AliasMap): AliasMap {
  const cleaned: AliasMap = {};
  for (const alias of Object.keys(STABLE_ALIASES) as StableAlias[]) {
    const v = next[alias]?.trim();
    if (v) cleaned[alias] = v;
  }
  const p = aliasesFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8");
  return loadAliases();
}

export function modalityForAlias(alias: StableAlias): RunCoreAgentModality {
  return STABLE_ALIASES[alias];
}
