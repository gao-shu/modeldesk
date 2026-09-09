/**
 * ModelDesk config health check (no secrets printed).
 * Usage: pnpm doctor
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function env(name) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function resolveDataDir() {
  const fromEnv = env("MODELDESK_DATA_DIR");
  if (fromEnv) return { dataDir: path.resolve(fromEnv), source: "MODELDESK_DATA_DIR" };

  const control = path.join(root, "data-location.json");
  if (fs.existsSync(control)) {
    try {
      const j = JSON.parse(fs.readFileSync(control, "utf8"));
      if (j?.dataDir && typeof j.dataDir === "string") {
        return { dataDir: path.resolve(j.dataDir), source: "data-location.json" };
      }
    } catch {
      /* ignore */
    }
  }

  const repoData = path.join(root, "data");
  if (fs.existsSync(repoData)) {
    return { dataDir: repoData, source: "repo ./data" };
  }
  return { dataDir: repoData, source: "default ./data (missing)" };
}

function secretSource(dataDir) {
  if (env("ENCRYPTION_SECRET")) return "ENCRYPTION_SECRET env";
  const file = path.join(dataDir, ".encryption-secret");
  if (fs.existsSync(file)) return ".encryption-secret file";
  return "missing";
}

function readAliases(dataDir) {
  const file = path.join(dataDir, "gateway-aliases.json");
  if (!fs.existsSync(file)) {
    return { file, exists: false, aliases: {} };
  }
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      file,
      exists: true,
      aliases: j && typeof j === "object" ? j : {},
    };
  } catch (e) {
    return { file, exists: true, error: String(e?.message || e) };
  }
}

const { dataDir, source } = resolveDataDir();
const aliases = readAliases(dataDir);
const stable = ["llm-default", "image-default", "video-default", "audio-default"];
const bound = stable.filter((k) => aliases.aliases?.[k]);

const report = {
  ok: true,
  dataDir,
  dataDirSource: source,
  dataDirExists: fs.existsSync(dataDir),
  encryptionSecret: secretSource(dataDir),
  gatewayTokenConfigured: Boolean(
    env("MODELDESK_GATEWAY_TOKEN") || env("MODELDESK_GATEWAY_TOKENS_FILE"),
  ),
  gatewayRequireToken: env("MODELDESK_GATEWAY_REQUIRE_TOKEN") === "1",
  gatewayAllowOpen: env("MODELDESK_GATEWAY_ALLOW_OPEN") === "1",
  aliasesFile: aliases.file,
  aliasesExists: aliases.exists,
  aliasesBound: bound,
  aliasesUnbound: stable.filter((k) => !bound.includes(k)),
  dbExists: fs.existsSync(path.join(dataDir, "modeldesk.db")),
  hints: [],
};

if (!report.dataDirExists) {
  report.ok = false;
  report.hints.push("Create data dir or set MODELDESK_DATA_DIR");
}
if (report.encryptionSecret === "missing") {
  report.hints.push(
    "No encryption secret yet — open Settings in Web/Desktop to create one before storing API keys",
  );
}
if (!report.dbExists) {
  report.hints.push("No modeldesk.db yet — start Web once and add a model");
}
if (aliases.error) {
  report.ok = false;
  report.hints.push(`aliases JSON invalid: ${aliases.error}`);
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
