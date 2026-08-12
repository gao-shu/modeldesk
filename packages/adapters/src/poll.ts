/**
 * Shared async-job polling helpers: backoff on 429/503 so providers
 * (Agnes, Zhipu, relays, …) don't fail hard on status-query rate limits.
 */

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("Aborted"));
      },
      { once: true },
    );
  });
}

/** Parse Retry-After as seconds or HTTP-date → ms delay. */
export function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const asSec = Number(raw);
  if (Number.isFinite(asSec) && asSec >= 0) return Math.ceil(asSec * 1000);
  const asDate = Date.parse(raw);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

export function isRateLimitStatus(status: number): boolean {
  return status === 429 || status === 503;
}

export function isRateLimitBody(text: string): boolean {
  return /rate\s*limit|too many requests|query rate limit|exceeded/i.test(text);
}

/** Next wait after a rate-limit hit (exponential + optional Retry-After). */
export function nextPollDelayMs(input: {
  currentMs: number;
  baseMs: number;
  maxMs: number;
  retryAfterHeaderMs?: number | null;
}): number {
  const fromHeader = input.retryAfterHeaderMs;
  if (fromHeader != null && fromHeader > 0) {
    return Math.min(input.maxMs, Math.max(input.baseMs, fromHeader));
  }
  const jitter = Math.floor(Math.random() * 400);
  return Math.min(input.maxMs, Math.floor(input.currentMs * 1.7) + jitter);
}

export type DefaultPollTiming = {
  /** Delay before the first status check after submit. */
  initialDelayMs: number;
  /** Steady-state interval while status is queued / running. */
  intervalMs: number;
  /** Cap for exponential backoff after 429/503. */
  maxIntervalMs: number;
};

/**
 * Provider-aware defaults. Agnes documents status query rate limits;
 * aggressive 2s polling trips 429 quickly.
 */
export function defaultVideoPollTiming(opts: {
  apiFormat?: string | null;
  agnes?: boolean;
  zhipu?: boolean;
}): DefaultPollTiming {
  const format = (opts.apiFormat ?? "").toLowerCase();
  if (opts.agnes || format === "video.agnes") {
    return {
      initialDelayMs: 5_000,
      intervalMs: 8_000,
      maxIntervalMs: 45_000,
    };
  }
  if (opts.zhipu || format === "video.zhipu-cogvideox") {
    return {
      initialDelayMs: 3_000,
      intervalMs: 4_000,
      maxIntervalMs: 30_000,
    };
  }
  if (format === "video.volcengine-seedance" || format === "video.volcengine-wan") {
    return {
      initialDelayMs: 4_000,
      intervalMs: 5_000,
      maxIntervalMs: 30_000,
    };
  }
  if (
    format === "video.kling" ||
    format === "video.minimax-hailuo" ||
    format === "video.vidu"
  ) {
    return {
      initialDelayMs: 5_000,
      intervalMs: 8_000,
      maxIntervalMs: 45_000,
    };
  }
  return {
    initialDelayMs: 2_000,
    intervalMs: 3_000,
    maxIntervalMs: 30_000,
  };
}
