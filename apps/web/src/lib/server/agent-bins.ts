/**
 * Desktop agent command status (CLI / MCP / Gateway shims).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { envTruthy } from "./env";
import { getControlDir, getDataDir, getDefaultDesktopDataDir } from "./paths";

export type AgentBinsStatus = {
  binDir: string;
  installed: boolean;
  commands: string[];
  engineDir: string | null;
  markerPath: string;
  canInstall: boolean;
  desktopMode: boolean;
  /** Absolute launch path preferred by MCP hosts (may be .cmd / binary / node). */
  mcpCommand: string;
  mcpArgs: string[];
  mcpConfigExample: string;
  /** Codex ~/.codex/config.toml snippet */
  mcpCodexTomlExample: string;
};

type AgentBinsMarker = {
  engineDir?: string;
  binDir?: string;
  installed?: string[];
  installedAt?: string;
};

type McpLaunch = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

function defaultBinDir(): string {
  return path.join(getDefaultDesktopDataDir(), "bin");
}

function markerPath(): string {
  return path.join(getControlDir(), "agent-bins.json");
}

function readMarker(): AgentBinsMarker | null {
  try {
    const p = markerPath();
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as AgentBinsMarker;
  } catch {
    return null;
  }
}

function resolveEngineDir(): string | null {
  const fromEnv = process.env.MODELDESK_RUNTIME?.trim();
  if (fromEnv) {
    const agents = path.join(fromEnv, "agents", "cli.mjs");
    if (fs.existsSync(agents)) return path.normalize(fromEnv);
  }
  const marker = readMarker();
  if (
    marker?.engineDir &&
    fs.existsSync(path.join(marker.engineDir, "agents", "cli.mjs"))
  ) {
    return path.normalize(marker.engineDir);
  }
  return null;
}

function resolveNode(engineDir: string): string | null {
  const candidates = [
    path.join(engineDir, "node", "node.exe"),
    path.join(engineDir, "node", "bin", "node"),
    path.join(engineDir, "node", "node"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function binLooksInstalled(binDir: string): boolean {
  if (process.platform === "win32") {
    return fs.existsSync(path.join(binDir, "modeldesk.cmd"));
  }
  return fs.existsSync(path.join(binDir, "modeldesk"));
}

/** Prefer forward slashes in JSON examples (Windows hosts accept them). */
function pathForConfig(p: string): string {
  return path.normalize(p).replace(/\\/g, "/");
}

function mcpShimPath(binDir: string): string | null {
  if (process.platform === "win32") {
    const cmd = path.join(binDir, "modeldesk-mcp.cmd");
    if (fs.existsSync(cmd)) return cmd;
    return null;
  }
  const sh = path.join(binDir, "modeldesk-mcp");
  if (fs.existsSync(sh)) return sh;
  return null;
}

/**
 * Resolve a launch config that GUI MCP hosts can spawn without relying on PATH.
 * Prefer packaged node + mcp.mjs (most reliable on Windows); else absolute shim.
 */
function resolveMcpLaunch(binDir: string, _dataDir: string): McpLaunch {
  // Do not bake MODELDESK_DATA_DIR — MCP follows live Desk (:3300) by default.
  const env: Record<string, string> = {
    MODELDESK_DESKTOP: "1",
    MODELDESK_FOLLOW_DESK: "1",
  };

  const engineDir = resolveEngineDir();
  if (engineDir) {
    const node = resolveNode(engineDir);
    const mcpJs = path.join(engineDir, "agents", "mcp.mjs");
    if (node && fs.existsSync(mcpJs)) {
      return {
        command: pathForConfig(node),
        args: [pathForConfig(mcpJs)],
        env,
      };
    }
  }

  const shim = mcpShimPath(binDir);
  if (shim) {
    return {
      command: pathForConfig(shim),
      args: [],
      env,
    };
  }

  return {
    command: "modeldesk-mcp",
    args: [],
    env,
  };
}

function mcpConfigExampleJson(launch: McpLaunch): string {
  const server: Record<string, unknown> = {
    command: launch.command,
    env: launch.env,
  };
  if (launch.args.length > 0) {
    server.args = launch.args;
  }
  return JSON.stringify({ mcpServers: { modeldesk: server } }, null, 2);
}

function mcpCodexTomlExample(launch: McpLaunch): string {
  const lines = [
    "[mcp_servers.modeldesk]",
    `command = ${JSON.stringify(launch.command)}`,
  ];
  if (launch.args.length > 0) {
    lines.push(
      `args = [${launch.args.map((a) => JSON.stringify(a)).join(", ")}]`,
    );
  }
  lines.push("[mcp_servers.modeldesk.env]");
  for (const [k, v] of Object.entries(launch.env)) {
    lines.push(`${k} = ${JSON.stringify(v)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function getAgentBinsStatus(): AgentBinsStatus {
  const marker = readMarker();
  const binDir = marker?.binDir?.trim() || defaultBinDir();
  const engineDir = resolveEngineDir();
  const desktopMode = envTruthy(process.env.MODELDESK_DESKTOP);
  const installed = binLooksInstalled(binDir);
  const commands = ["modeldesk", "modeldesk-mcp", "modeldesk-gateway"];
  const launch = resolveMcpLaunch(binDir, getDataDir());

  return {
    binDir,
    installed,
    commands,
    engineDir,
    markerPath: markerPath(),
    canInstall: Boolean(engineDir && resolveNode(engineDir)),
    desktopMode,
    mcpCommand: launch.command,
    mcpArgs: launch.args,
    mcpConfigExample: mcpConfigExampleJson(launch),
    mcpCodexTomlExample: mcpCodexTomlExample(launch),
  };
}

export function installAgentBins(opts?: {
  addPath?: boolean;
}): Promise<AgentBinsStatus> {
  const engineDir = resolveEngineDir();
  if (!engineDir) {
    return Promise.reject(
      new Error(
        "未找到 Desktop engine（agents/）。请先用安装包安装或完成 desktop:prepare。",
      ),
    );
  }
  const node = resolveNode(engineDir);
  const installJs = path.join(engineDir, "agents", "install-bins.mjs");
  if (!node || !fs.existsSync(installJs)) {
    return Promise.reject(new Error("engine 内缺少 node 或 install-bins.mjs"));
  }

  const args = [installJs, "--engine-dir", engineDir];
  if (opts?.addPath !== false) args.push("--add-path");

  return new Promise((resolve, reject) => {
    const child = spawn(node, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let err = "";
    child.stderr?.on("data", (b) => {
      err += String(b);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `install-bins exited ${code}`));
        return;
      }
      resolve(getAgentBinsStatus());
    });
  });
}
