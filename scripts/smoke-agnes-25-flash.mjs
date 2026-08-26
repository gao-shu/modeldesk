/**
 * Agnes Video 2.5 Flash smoke — run from packages/adapters:
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/smoke-agnes-25-flash.mjs
 *
 * (Root entry kept as a pointer; Windows ESM + workspace imports resolve
 *  reliably when cwd is packages/adapters.)
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adapters = path.join(root, "packages", "adapters");
const tsxCli = path.join(adapters, "node_modules", "tsx", "dist", "cli.mjs");
const script = path.join(adapters, "scripts", "smoke-agnes-25-flash.mjs");

const r = spawnSync(process.execPath, [tsxCli, script], {
  cwd: adapters,
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
