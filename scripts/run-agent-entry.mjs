/**
 * Shared launcher for ModelDesk agent entrypoints (CLI / MCP / Gateway).
 * Resolves tsx + monorepo root, then runs the package TypeScript entry.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

function findTsxCli(packageRoot) {
  const require = createRequire(path.join(packageRoot, "package.json"));
  try {
    return require.resolve("tsx/cli");
  } catch {
    /* continue */
  }
  const candidates = [
    path.join(packageRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(packageRoot, "..", "..", "node_modules", "tsx", "dist", "cli.mjs"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function findMonorepoRoot(packageRoot) {
  let cur = packageRoot;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(cur, "pnpm-workspace.yaml"))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/**
 * @param {{ packageRoot: string, entryRel?: string }} opts
 */
export function runAgentEntry(opts) {
  const packageRoot = opts.packageRoot;
  const entryRel = opts.entryRel ?? "src/index.ts";
  const entry = path.join(packageRoot, entryRel);
  const tsconfig = path.join(packageRoot, "tsconfig.json");
  const tsxCli = findTsxCli(packageRoot);

  if (!tsxCli) {
    console.error(
      "[modeldesk] tsx not found. Run `pnpm install` at the monorepo root first.",
    );
    process.exit(1);
  }
  if (!fs.existsSync(entry)) {
    console.error(`[modeldesk] entry not found: ${entry}`);
    process.exit(1);
  }

  const repoRoot = findMonorepoRoot(packageRoot);
  const env = { ...process.env };
  if (repoRoot && !env.MODELDESK_REPO_ROOT?.trim()) {
    env.MODELDESK_REPO_ROOT = repoRoot;
  }

  const child = spawn(
    process.execPath,
    [tsxCli, "--tsconfig", tsconfig, entry, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env,
      // Prefer package cwd so relative imports / tooling stay stable;
      // data dir still resolves via MODELDESK_REPO_ROOT / MODELDESK_DATA_DIR.
      cwd: packageRoot,
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
