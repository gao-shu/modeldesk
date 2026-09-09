import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";

/**
 * Optional local caller tokens (not multi-tenant auth).
 * - MODELDESK_GATEWAY_TOKEN: single value or comma-separated list
 * - MODELDESK_GATEWAY_TOKENS_FILE: one token per line (# comments ok)
 */
export function loadGatewayTokens(): Set<string> {
  const tokens = new Set<string>();
  const fromEnv = process.env.MODELDESK_GATEWAY_TOKEN?.trim();
  if (fromEnv) {
    for (const part of fromEnv.split(",")) {
      const t = part.trim();
      if (t) tokens.add(t);
    }
  }
  const file = process.env.MODELDESK_GATEWAY_TOKENS_FILE?.trim();
  if (file) {
    try {
      if (fs.existsSync(file)) {
        for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
          const t = line.trim();
          if (!t || t.startsWith("#")) continue;
          tokens.add(t);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return tokens;
}

/** Strip port from Host header; keep `[::1]` form. */
export function hostnameFromHostHeader(host: string | null | undefined): string {
  const raw = (host ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.startsWith("[")) {
    const end = raw.indexOf("]");
    return end >= 0 ? raw.slice(0, end + 1) : raw;
  }
  const colon = raw.lastIndexOf(":");
  if (colon > 0 && !raw.includes("::")) {
    return raw.slice(0, colon);
  }
  return raw;
}

export function isLoopbackHostname(host: string | null | undefined): boolean {
  const h = hostnameFromHostHeader(host);
  if (!h) return false;
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h === "::1" || h === "[::1]") return true;
  return false;
}

export function tokenMatches(candidate: string, tokens: Set<string>): boolean {
  if (!candidate || tokens.size === 0) return false;
  const a = Buffer.from(candidate);
  for (const t of tokens) {
    const b = Buffer.from(t);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

function presentedToken(authorization: string | null): string | null {
  const h = (authorization ?? "").trim();
  if (!h) return null;
  if (h.toLowerCase().startsWith("bearer ")) {
    const t = h.slice(7).trim();
    return t || null;
  }
  return h;
}

export type GatewayAuthResult =
  | { ok: true }
  | { ok: false; reason: string; status?: number };

/**
 * Local gateway auth policy (not multi-tenant):
 * - ALLOW_OPEN=1 → allow anyone (trusted LAN only)
 * - REQUIRE_TOKEN=1 with no tokens configured → reject
 * - tokens configured → Bearer / raw token must match (timing-safe)
 * - no tokens → loopback Host only
 */
export function checkGatewayAuth(
  authorization: string | null,
  tokens: Set<string>,
  hostname: string | null | undefined,
): GatewayAuthResult {
  if (process.env.MODELDESK_GATEWAY_ALLOW_OPEN === "1") {
    return { ok: true };
  }
  if (
    process.env.MODELDESK_GATEWAY_REQUIRE_TOKEN === "1" &&
    tokens.size === 0
  ) {
    return {
      ok: false,
      reason:
        "MODELDESK_GATEWAY_REQUIRE_TOKEN=1 but no MODELDESK_GATEWAY_TOKEN configured",
      status: 401,
    };
  }

  const presented = presentedToken(authorization);
  if (tokens.size > 0) {
    if (presented && tokenMatches(presented, tokens)) return { ok: true };
    return { ok: false, reason: "Unauthorized", status: 401 };
  }

  if (isLoopbackHostname(hostname)) return { ok: true };
  return {
    ok: false,
    reason:
      "Gateway is open only on loopback without tokens; set MODELDESK_GATEWAY_TOKEN or MODELDESK_GATEWAY_ALLOW_OPEN=1",
    status: 401,
  };
}

/** @deprecated prefer checkGatewayAuth — kept for older imports */
export function checkAuthHeader(
  authorization: string | null,
  tokens: Set<string>,
): boolean {
  if (tokens.size === 0) return true;
  const presented = presentedToken(authorization);
  return Boolean(presented && tokenMatches(presented, tokens));
}
