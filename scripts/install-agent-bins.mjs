/**
 * Install ModelDesk agent entrypoints for external callers:
 *   modeldesk | modeldesk-mcp | modeldesk-gateway
 *
 * Writes shims into the OS ModelDesk bin dir (same product root as Desktop data).
 * Pass `--add-path` to prepend the bin dir to the user PATH / shell profile.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const addPath = process.argv.includes("--add-path");

const BINS = [
  { name: "modeldesk", entry: path.join(root, "apps/cli/bin/modeldesk.mjs") },
  {
    name: "modeldesk-mcp",
    entry: path.join(root, "apps/mcp/bin/modeldesk-mcp.mjs"),
  },
  {
    name: "modeldesk-gateway",
    entry: path.join(root, "apps/gateway/bin/modeldesk-gateway.mjs"),
  },
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

function writeShim(binDir, name, entryAbs) {
  const node = process.execPath;
  if (process.platform === "win32") {
    const cmdPath = path.join(binDir, `${name}.cmd`);
    const ps1Path = path.join(binDir, `${name}.ps1`);
    fs.writeFileSync(
      cmdPath,
      `@echo off\r\n"${node}" "${entryAbs}" %*\r\n`,
      "utf8",
    );
    fs.writeFileSync(ps1Path, `& "${node}" "${entryAbs}" @args\r\n`, "utf8");
    return cmdPath;
  }
  const shPath = path.join(binDir, name);
  fs.writeFileSync(
    shPath,
    `#!/usr/bin/env bash\nexec "${node}" "${entryAbs}" "$@"\n`,
    { encoding: "utf8", mode: 0o755 },
  );
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
Write-Output 'Open a new terminal for PATH to take effect.'
`;
    const r = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { encoding: "utf8" },
    );
    if (r.stdout?.trim()) console.log(r.stdout.trim());
    if (r.status !== 0) {
      console.error(r.stderr?.trim() || "failed to update User PATH");
      process.exit(r.status ?? 1);
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
    console.log(`Add to your shell profile:\n  ${line}`);
    return;
  }
  const prev = fs.readFileSync(target, "utf8");
  if (prev.includes(binDir) && prev.includes("ModelDesk")) {
    console.log(`PATH already referenced in ${target}`);
    return;
  }
  fs.appendFileSync(target, `\n${line}\n`, "utf8");
  console.log(`Appended PATH export to ${target}`);
  console.log("Reload the shell (or `source` that file) for PATH to take effect.");
}

const binDir = process.env.MODELDESK_BIN_DIR?.trim() || defaultBinDir();
fs.mkdirSync(binDir, { recursive: true });

console.log("ModelDesk - installing agent bins...");
console.log(`  bin dir: ${binDir}\n`);

for (const b of BINS) {
  if (!fs.existsSync(b.entry)) {
    console.error(`missing entry: ${b.entry}`);
    process.exit(1);
  }
  const shim = writeShim(binDir, b.name, b.entry);
  console.log(`  OK ${b.name}  ->  ${shim}`);
}

if (addPath) {
  console.log("");
  ensureUserPath(binDir);
} else {
  const pathHint =
    process.platform === "win32"
      ? `Current session:\n  $env:Path = "${binDir};" + $env:Path\n\nOr re-run with --add-path to update User PATH permanently.`
      : `Current session:\n  export PATH="${binDir}:$PATH"\n\nOr re-run with --add-path to append to your shell profile.`;
  console.log(`\nAdd the bin dir to PATH if needed:\n\n${pathHint}`);
}

console.log(`
Then:

  modeldesk --help
  modeldesk list
  modeldesk-mcp
  modeldesk-gateway

Set MODELDESK_DATA_DIR to the path in Web → Settings so agents share keys.
Docs: docs/external-access.md
`);
