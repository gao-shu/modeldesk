/**
 * ModelDesk CLI — list / run via shared run-core.
 *
 * After `pnpm install:bins`:
 *   modeldesk list
 *   modeldesk run text --model <id> --prompt "..."
 *
 * From monorepo (no global link):
 *   pnpm cli -- list
 */

import {
  listRunModelsForAgent,
  runAudio,
  runCoreResultToPublic,
  runImage,
  runMusic,
  runText,
  runVideo,
  type RunCoreAgentModality,
  type RunCoreOutcome,
} from "@/lib/server/run-core";
import { ensureDataDirs, getDataDir } from "@/lib/server/paths";

const VERSION = "0.1.0";

const AGENT_MODALITIES = new Set([
  "text",
  "image",
  "video",
  "audio",
  "music",
]);

function printHelp() {
  console.log(`ModelDesk CLI ${VERSION} - shared run-core (same DB / keys as Web · MCP)

Usage:
  modeldesk list [--modality text|image|video|audio|music]
  modeldesk run text  --model <registryId> --prompt <text> [--temperature n] [--max-tokens n]
  modeldesk run image|video|audio|music --model <registryId> --prompt <text> [--params <json>]
  modeldesk --version

Env:
  MODELDESK_DATA_DIR    Same data directory as Web / Desktop (recommended for agents)
  MODELDESK_REPO_ROOT   Monorepo root (set automatically by the modeldesk bin)

Install global bins (from monorepo):
  pnpm install:bins

Data dir: ${getDataDir()}
`);
}

function isMock(m: { provider: string; baseUrl: string | null }): boolean {
  return (
    m.provider === "mock" ||
    (m.baseUrl ?? "").toLowerCase().startsWith("mock://")
  );
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function printOutcome(outcome: RunCoreOutcome): never {
  if (outcome.kind === "prepare_error") {
    console.error(
      JSON.stringify(
        { ok: false, error: outcome.error, code: outcome.code },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  const pub = runCoreResultToPublic(outcome);
  console.log(JSON.stringify(pub, null, 2));
  process.exit(pub.ok ? 0 : 1);
}

async function cmdList(args: string[]) {
  const raw = flagValue(args, "--modality");
  const modality =
    raw && AGENT_MODALITIES.has(raw)
      ? (raw as RunCoreAgentModality)
      : undefined;
  const models = listRunModelsForAgent(modality).filter((m) => !isMock(m));
  console.log(
    JSON.stringify(
      {
        dataDir: getDataDir(),
        count: models.length,
        models: models.map((m) => ({
          id: m.id,
          name: m.name,
          modality: m.modality,
          provider: m.provider,
          modelId: m.modelId,
          hasApiKey: m.hasApiKey,
        })),
      },
      null,
      2,
    ),
  );
}

async function cmdRun(args: string[]) {
  const modality = args[0];
  if (!modality || !AGENT_MODALITIES.has(modality)) {
    console.error(
      'run requires modality "text" | "image" | "video" | "audio" | "music"',
    );
    process.exit(2);
  }
  const modelId = flagValue(args, "--model");
  const prompt = flagValue(args, "--prompt");
  if (!modelId || !prompt) {
    console.error("run requires --model and --prompt");
    process.exit(2);
  }

  if (modality === "text") {
    const temperatureRaw = flagValue(args, "--temperature");
    const maxTokensRaw = flagValue(args, "--max-tokens");
    const outcome = await runText({
      modelId,
      prompt,
      temperature: temperatureRaw != null ? Number(temperatureRaw) : null,
      maxTokens: maxTokensRaw != null ? Number(maxTokensRaw) : null,
    });
    printOutcome(outcome);
  }

  const paramsRaw = flagValue(args, "--params");
  let params: Record<string, unknown> | null = null;
  if (paramsRaw) {
    try {
      params = JSON.parse(paramsRaw) as Record<string, unknown>;
    } catch {
      console.error("--params must be valid JSON");
      process.exit(2);
    }
  }

  const runners = {
    image: runImage,
    video: runVideo,
    audio: runAudio,
    music: runMusic,
  } as const;
  const runFn = runners[modality as keyof typeof runners];
  const outcome = await runFn({ modelId, prompt, params });
  printOutcome(outcome);
}

async function main() {
  ensureDataDirs();
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length === 0 || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    printHelp();
    process.exit(0);
  }
  if (hasFlag(args, "--version") || hasFlag(args, "-V")) {
    console.log(VERSION);
    process.exit(0);
  }

  const cmd = args[0];
  if (cmd === "list") {
    await cmdList(args.slice(1));
    return;
  }
  if (cmd === "run") {
    await cmdRun(args.slice(1));
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
