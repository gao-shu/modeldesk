/**
 * Optional headless ModelDesk Gateway (:3310).
 * Default path for personal use: Web / Desktop on :3300 (same /v1 contract).
 *
 * Env: MODELDESK_GATEWAY_HOST / PORT / TOKEN / TOKENS_FILE / MODELDESK_DATA_DIR
 */

import http from "node:http";
import { Readable } from "node:stream";
import { ensureDataDirs, getDataDir } from "@modeldesk/run-core";
import {
  aliasesFilePath,
  handleGatewayRequest,
  loadGatewayTokens,
} from "@modeldesk/run-core/gateway";

const HOST = (process.env.MODELDESK_GATEWAY_HOST ?? "127.0.0.1").trim();
const PORT = Number(process.env.MODELDESK_GATEWAY_PORT ?? "3310") || 3310;

function log(...args: unknown[]) {
  console.error("[modeldesk-gateway]", ...args);
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function toWebRequest(
  req: http.IncomingMessage,
): Promise<Request> {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await readBody(req) : undefined;
  const init: RequestInit = { method, headers };
  if (body && body.byteLength > 0) {
    init.body = body;
  }
  return new Request(url, init);
}

async function writeWebResponse(
  res: http.ServerResponse,
  response: Response,
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const nodeStream = Readable.fromWeb(
    response.body as import("node:stream/web").ReadableStream,
  );
  await new Promise<void>((resolve, reject) => {
    nodeStream.pipe(res);
    nodeStream.on("error", reject);
    res.on("finish", resolve);
    res.on("error", reject);
  });
}

async function main() {
  if (HOST !== "127.0.0.1" && HOST !== "localhost" && HOST !== "::1") {
    log(
      `WARNING: binding to ${HOST}. Prefer 127.0.0.1 — this gateway can spend your API keys.`,
    );
  }

  ensureDataDirs();
  const tokens = loadGatewayTokens();
  const requireToken = process.env.MODELDESK_GATEWAY_REQUIRE_TOKEN === "1";
  const allowOpen = process.env.MODELDESK_GATEWAY_ALLOW_OPEN === "1";
  log("dataDir", getDataDir());
  log("aliasesFile", aliasesFilePath());
  if (tokens.size > 0) {
    log(`auth on (${tokens.size} token(s))`);
  } else if (allowOpen) {
    log("auth off (ALLOW_OPEN=1 — any Host)");
  } else if (requireToken) {
    log("auth REQUIRE_TOKEN=1 but no tokens configured — all requests will 401");
  } else {
    log("auth off (loopback Host only; set MODELDESK_GATEWAY_TOKEN for LAN)");
  }
  log(
    `listening http://${HOST}:${PORT} (optional headless; default API is Web :3300 /v1)`,
  );

  const server = http.createServer((req, res) => {
    void (async () => {
      const request = await toWebRequest(req);
      const response = await handleGatewayRequest(request);
      await writeWebResponse(res, response);
    })().catch((err) => {
      log("handler error", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        const raw = JSON.stringify({
          error: {
            message: err instanceof Error ? err.message : "Internal error",
            type: "server_error",
            param: null,
            code: null,
          },
        });
        res.writeHead(500, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(raw),
        });
        res.end(raw);
      } else {
        try {
          res.end();
        } catch {
          /* ignore */
        }
      }
    });
  });

  server.listen(PORT, HOST);
}

main().catch((err) => {
  console.error(
    "[modeldesk-gateway] fatal",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
