/**
 * Bundle CLI / MCP / Gateway for Desktop engine.zip (no tsx / monorepo at runtime).
 *
 * Usage: node scripts/bundle-desktop-agents.mjs [outdir]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const WEB_SRC = path.join(REPO, "apps", "web", "src");
const outdir =
  process.argv[2]?.trim() ||
  path.join(REPO, "apps", "desktop", "src-tauri", "runtime", "agents");

const ENTRIES = [
  { name: "cli", entry: path.join(REPO, "apps", "cli", "src", "index.ts") },
  { name: "mcp", entry: path.join(REPO, "apps", "mcp", "src", "index.ts") },
  {
    name: "gateway",
    entry: path.join(REPO, "apps", "gateway", "src", "index.ts"),
  },
];

const EXTERNAL = [
  "better-sqlite3",
  "proxy-agent",
  "sharp",
  "@img/*",
  "cpu-features",
];

const BANNER =
  "import { createRequire as __mdCreateRequire } from 'node:module';\n" +
  "const require = __mdCreateRequire(import.meta.url);\n";

function aliasPlugin() {
  return {
    name: "modeldesk-at-alias",
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        const rel = args.path.slice(2);
        const candidates = [
          path.join(WEB_SRC, rel),
          path.join(WEB_SRC, `${rel}.ts`),
          path.join(WEB_SRC, `${rel}.tsx`),
          path.join(WEB_SRC, `${rel}.js`),
          path.join(WEB_SRC, rel, "index.ts"),
        ];
        for (const c of candidates) {
          if (fs.existsSync(c) && fs.statSync(c).isFile()) {
            return { path: c };
          }
        }
        return { path: path.join(WEB_SRC, `${rel}.ts`) };
      });
    },
  };
}

async function loadEsbuild() {
  try {
    return await import("esbuild");
  } catch {
    /* install into a temp folder once */
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "md-esbuild-"));
  console.log("[bundle-agents] installing esbuild into", tmp);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  spawnSync(npm, ["init", "-y"], {
    cwd: tmp,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  const r = spawnSync(
    npm,
    ["install", "esbuild@0.25.0", "--no-fund", "--no-audit"],
    {
      cwd: tmp,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (r.status !== 0) {
    throw new Error("failed to install esbuild");
  }
  const mainJs = path.join(tmp, "node_modules", "esbuild", "lib", "main.js");
  if (!fs.existsSync(mainJs)) {
    throw new Error(`esbuild main missing at ${mainJs}`);
  }
  return import(pathToFileURL(mainJs).href);
}

async function main() {
  fs.mkdirSync(outdir, { recursive: true });
  const esbuild = await loadEsbuild();

  for (const item of ENTRIES) {
    if (!fs.existsSync(item.entry)) {
      throw new Error(`missing entry ${item.entry}`);
    }
    const outfile = path.join(outdir, `${item.name}.mjs`);
    console.log(`[bundle-agents] ${item.name} → ${outfile}`);

    const result = await esbuild.build({
      entryPoints: [item.entry],
      bundle: true,
      platform: "node",
      format: "esm",
      outfile,
      packages: "bundle",
      external: EXTERNAL,
      plugins: [aliasPlugin()],
      logLevel: "warning",
    });
    if (result.errors?.length) {
      throw new Error(`esbuild errors for ${item.name}`);
    }

    const body = fs.readFileSync(outfile, "utf8");
    if (!body.includes("__mdCreateRequire")) {
      fs.writeFileSync(outfile, BANNER + body);
    }
  }

  fs.copyFileSync(
    path.join(REPO, "scripts", "install-desktop-agent-bins.mjs"),
    path.join(outdir, "install-bins.mjs"),
  );

  console.log("[bundle-agents] OK →", outdir);
}

main().catch((err) => {
  console.error("[bundle-agents]", err);
  process.exit(1);
});
