/**
 * In-process gateway concurrency + RPM guards (single Node process).
 * Env:
 * - MODELDESK_GATEWAY_MAX_CONCURRENT (default 16; 0 = off)
 * - MODELDESK_GATEWAY_RPM (default 180; 0 = off)
 */

export type GatewaySlotOk = { ok: true; release: () => void };
export type GatewaySlotDenied = { ok: false; status: number; reason: string };
export type GatewaySlotResult = GatewaySlotOk | GatewaySlotDenied;

let concurrent = 0;
const rpmHits = new Map<string, number[]>();

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

export function resetGatewayRateLimitState(): void {
  concurrent = 0;
  rpmHits.clear();
}

export function acquireGatewaySlot(
  bucketKey = "default",
): GatewaySlotResult {
  const maxConcurrent = envInt("MODELDESK_GATEWAY_MAX_CONCURRENT", 16);
  const rpm = envInt("MODELDESK_GATEWAY_RPM", 180);
  const now = Date.now();

  if (rpm > 0) {
    const prev = rpmHits.get(bucketKey) ?? [];
    const recent = prev.filter((t) => now - t < 60_000);
    if (recent.length >= rpm) {
      rpmHits.set(bucketKey, recent);
      return {
        ok: false,
        status: 429,
        reason: `Gateway RPM limit (${rpm}/min)`,
      };
    }
  }

  if (maxConcurrent > 0 && concurrent >= maxConcurrent) {
    return {
      ok: false,
      status: 503,
      reason: `Gateway concurrent limit (${maxConcurrent})`,
    };
  }

  if (rpm > 0) {
    const prev = rpmHits.get(bucketKey) ?? [];
    const recent = prev.filter((t) => now - t < 60_000);
    recent.push(now);
    rpmHits.set(bucketKey, recent);
  }

  if (maxConcurrent > 0) concurrent += 1;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      if (maxConcurrent > 0) concurrent = Math.max(0, concurrent - 1);
    },
  };
}
