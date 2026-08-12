/**
 * Install Desktop agent command shims into %LOCALAPPDATA%\ModelDesk\bin
 * (or macOS/Linux app-support equivalent).
 *
 * Usage (packaged engine):
 *   node install-bins.mjs --engine-dir <engine> [--add-path]
 *
 * Shims set MODELDESK_DESKTOP=1 so data dir matches the Desktop UI
 * (%LOCALAPPDATA%\ModelDesk + data-location.json). Do NOT set MODELDESK_REPO_ROOT.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

const addPath = process.argv.includes("--add-path");
const engineDir = path.resolve(
  argValue("--engine-dir") || path.resolve(__dirname, ".."),
);

const ENTRIES = [
  { name: "modeldesk", script: "cli.mjs" },
  { name: "modeldesk-mcp", script: "mcp.mjs" },
  { name: "modeldesk-gateway", script: "gateway.mjs" },
];

function defaultBinDir() {
  if (process.platform === "win32") {
    const base =
      process.env.LOCALAPPDATA?.trim() ||
      path.join(process.env.USERPROFILE || "", "AppData", "Local");
    return path.join(base, "ModelDesk", "bin");
  }
  if (process.platform === "darwin") {
    return path.join(
      process.env.HOME || "",
      "Library",
      "Application Support",
      "ModelDesk",
      "bin",
    );
  }
  const xdg =
    process.env.XDG_DATA_HOME?.trim() ||
    path.join(process.env.HOME || "", ".local", "share");
  return path.join(xdg, "ModelDesk", "bin");
}

function resolveNodeExe(engine) {
  const win = path.join(engine, "node", "node.exe");
  const nix = path.join(engine, "node", "bin", "node");
  const plain = path.join(engine, "node", "node");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(nix)) return nix;
  if (fs.existsSync(plain)) return plain;
  return process.execPath;
}

function writeWinShim(binDir, name, nodeExe, scriptPath) {
  const cmdPath = path.join(binDir, `${name}.cmd`);
  const ps1Path = path.join(binDir, `${name}.ps1`);
  const cmd = [
    "@echo off",
    "set MODELDESK_DESKTOP=1",
    `"${nodeExe}" "${scriptPath}" %*`,
    "",
  ].join("\r\n");
  const ps1 = [
    "$env:MODELDESK_DESKTOP = '1'",
    `& '${nodeExe.replace(/'/g, "''")}' '${scriptPath.replace(/'/g, "''")}' @args`,
    "",
  ].join("\r\n");
  fs.writeFileSync(cmdPath, cmd, "utf8");
  fs.writeFileSync(ps1Path, ps1, "utf8");
  return cmdPath;
}

function writeUnixShim(binDir, name, nodeExe, scriptPath) {
  const shPath = path.join(binDir, name);
  const body = `#!/usr/bin/env bash
export MODELDESK_DESKTOP=1
exec ${JSON.stringify(nodeExe)} ${JSON.stringify(scriptPath)} "$@"
`;
  fs.writeFileSync(shPath, body, { encoding: "utf8", mode: 0o755 });
  return shPath;
}

function ensureUserPath(binDir) {
  if (process.platform === "win32") {
    const ps = `
$bin = '${binDir.replace(/'/g, "''")}';
$user = [Environment]::GetEnvironmentVariable('Path', 'User')
if ([string]::IsNullOrEmpty($user)) { $user = '' }
$parts = $user.Split(';') | Where-Object { $_ -and $_.Trim() -ne '' }
if ($parts -contains $bin) {
  Write-Output 'PATH already contains ModelDesk bin'
  exit 0
}
$next = if ($user) { "$bin;$user" } else { $bin }
[Environment]::SetEnvironmentVariable('Path', $next, 'User')
Write-Output "Added to User PATH: $bin"
`;
    const r = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { encoding: "utf8" },
    );
    if (r.stdout?.trim()) console.log(r.stdout.trim());
    if (r.status !== 0) {
      console.error(r.stderr?.trim() || "PATH update failed");
    }
    return;
  }
  const home = process.env.HOME || "";
  const line = `export PATH="${binDir}:$PATH"  # ModelDesk`;
  const candidates = [
    path.join(home, ".zshrc"),
    path.join(home, ".bashrc"),
    path.join(home, ".profile"),
  ].filter((p) => fs.existsSync(p));
  const target = candidates[0];
  if (!target) {
    console.log(`Add to PATH:\n  ${line}`);
    return;
  }
  const prev = fs.readFileSync(target, "utf8");
  if (prev.includes(binDir) && prev.includes("ModelDesk")) {
    console.log(`PATH already referenced in ${target}`);
    return;
  }
  fs.appendFileSync(target, `\n${line}\n`, "utf8");
  console.log(`Appended PATH export to ${target}`);
}

function main() {
  const agentsDir = path.join(engineDir, "agents");
  const nodeExe = resolveNodeExe(engineDir);
  const binDir = process.env.MODELDESK_BIN_DIR?.trim() || defaultBinDir();

  if (!fs.existsSync(path.join(agentsDir, "cli.mjs"))) {
    console.error(`[install-bins] missing ${path.join(agentsDir, "cli.mjs")}`);
    process.exit(1);
  }

  fs.mkdirSync(binDir, { recursive: true });
  console.log(`[install-bins] engine=${engineDir}`);
  console.log(`[install-bins] bin=${binDir}`);

  const installed = [];
  for (const e of ENTRIES) {
    const scriptPath = path.join(agentsDir, e.script);
    if (!fs.existsSync(scriptPath)) {
      console.error(`[install-bins] missing ${scriptPath}`);
      process.exit(1);
    }
    const shim =
      process.platform === "win32"
        ? writeWinShim(binDir, e.name, nodeExe, scriptPath)
        : writeUnixShim(binDir, e.name, nodeExe, scriptPath);
    console.log(`[install-bins] OK ${e.name} -> ${shim}`);
    installed.push(e.name);
  }

  // Marker for Settings / docs
  const marker = {
    engineDir,
    binDir,
    installed,
    installedAt: new Date().toISOString(),
  };
  const controlDir = path.dirname(binDir);
  fs.mkdirSync(controlDir, { recursive: true });
  fs.writeFileSync(
    path.join(controlDir, "agent-bins.json"),
    `${JSON.stringify(marker, null, 2)}\n`,
    "utf8",
  );

  if (addPath) {
    ensureUserPath(binDir);
  }

  console.log("[install-bins] done");
}

main();
