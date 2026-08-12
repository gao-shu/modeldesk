import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mcpDir = path.join(root, "apps", "mcp");
const tsxCandidates = [
  path.join(mcpDir, "node_modules", "tsx", "dist", "cli.mjs"),
  path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
];
const tsxCli = tsxCandidates.find((p) => fs.existsSync(p));
if (!tsxCli) {
  console.error("tsx not found");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [tsxCli, "--tsconfig", "tsconfig.json", "src/index.ts"],
  {
    cwd: mcpDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  },
);

let out = "";
let err = "";
child.stdout.on("data", (d) => {
  out += d.toString("utf8");
});
child.stderr.on("data", (d) => {
  err += d.toString("utf8");
});

const lines = [
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0.0.1" },
    },
  }),
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
];

child.stdin.write(lines.join("\n") + "\n");

setTimeout(() => {
  child.kill();
  const toolList = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .find((m) => m && m.id === 2);

  const names =
    toolList?.result?.tools?.map((t) => t.name).sort() ?? [];
  const required = [
    "list_models",
    "list_active_runs",
    "cancel_run",
    "run_text",
    "run_image",
    "run_video",
    "run_audio",
    "run_music",
  ];
  const ok = required.every((n) => names.includes(n));

  console.log(
    JSON.stringify(
      { ok, names, missing: required.filter((n) => !names.includes(n)), stderrPreview: err.slice(0, 500) },
      null,
      2,
    ),
  );
  process.exit(ok ? 0 : 1);
}, 4000);
