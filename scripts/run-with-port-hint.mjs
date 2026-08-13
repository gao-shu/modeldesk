/**
 * Run a child command; if stderr/stdout looks like EADDRINUSE, print Chinese port hint.
 *
 * Usage:
 *   node scripts/run-with-port-hint.mjs --service Web --port 3300 --env-hint MODELDESK_WEB_PORT -- <cmd> [args...]
 */
import { spawn } from "node:child_process";
import {
  formatPortInUseMessage,
  looksLikePortInUse,
} from "./port-hint.mjs";

function parseArgs(argv) {
  let service = "服务";
  let port = 0;
  let host = "127.0.0.1";
  let envHint = "PORT";
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--") {
      i += 1;
      break;
    }
    if (a === "--service" && argv[i + 1]) {
      service = argv[++i];
      i += 1;
      continue;
    }
    if (a === "--port" && argv[i + 1]) {
      port = Number(argv[++i]);
      i += 1;
      continue;
    }
    if (a === "--host" && argv[i + 1]) {
      host = argv[++i];
      i += 1;
      continue;
    }
    if (a === "--env-hint" && argv[i + 1]) {
      envHint = argv[++i];
      i += 1;
      continue;
    }
    break;
  }
  const cmd = argv[i];
  const args = argv.slice(i + 1);
  if (!cmd) {
    console.error(
      "Usage: node scripts/run-with-port-hint.mjs --service Web --port 3300 --env-hint VAR -- <cmd> [args...]",
    );
    process.exit(2);
  }
  return { service, port, host, envHint, cmd, args };
}

const opts = parseArgs(process.argv.slice(2));
let hinted = false;

function maybeHint(chunk) {
  if (hinted || !looksLikePortInUse(chunk.toString())) return;
  hinted = true;
  const port = opts.port > 0 ? opts.port : 0;
  console.error(
    `\n${formatPortInUseMessage({
      service: opts.service,
      port: port || 0,
      host: opts.host,
      envVar: opts.envHint,
    })}\n`,
  );
}

const child = spawn(opts.cmd, opts.args, {
  stdio: ["inherit", "pipe", "pipe"],
  shell: process.platform === "win32",
  env: process.env,
});

child.stdout?.on("data", (buf) => {
  process.stdout.write(buf);
  maybeHint(buf);
});
child.stderr?.on("data", (buf) => {
  process.stderr.write(buf);
  maybeHint(buf);
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
