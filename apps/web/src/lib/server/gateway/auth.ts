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

export function checkAuthHeader(
  authorization: string | null,
  tokens: Set<string>,
): boolean {
  if (tokens.size === 0) return true;
  const h = (authorization ?? "").trim();
  if (h.toLowerCase().startsWith("bearer ")) {
    const t = h.slice(7).trim();
    if (tokens.has(t)) return true;
  }
  if (tokens.has(h)) return true;
  return false;
}
