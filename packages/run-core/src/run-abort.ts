/**
 * In-flight run abort controllers — cancel API can stop upstream fetches.
 */

const controllers = new Map<string, AbortController>();

/** Register a cancelable signal for a run (linked to optional parent, e.g. request.signal). */
export function registerRunAbort(
  runId: string,
  parent?: AbortSignal | null,
): AbortSignal {
  clearRunAbort(runId);
  const ac = new AbortController();
  controllers.set(runId, ac);

  if (parent) {
    if (parent.aborted) {
      ac.abort(parent.reason);
    } else {
      parent.addEventListener(
        "abort",
        () => {
          ac.abort(parent.reason);
        },
        { once: true },
      );
    }
  }

  return ac.signal;
}

export function abortRun(runId: string, reason?: unknown): boolean {
  const ac = controllers.get(runId);
  if (!ac) return false;
  if (!ac.signal.aborted) {
    ac.abort(reason ?? new Error("Run cancelled"));
  }
  controllers.delete(runId);
  return true;
}

export function clearRunAbort(runId: string): void {
  controllers.delete(runId);
}

/** Whether this process still has a live abort controller for the run. */
export function hasRunAbort(runId: string): boolean {
  return controllers.has(runId);
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; code?: string; message?: string };
  if (e.name === "AbortError" || e.name === "TimeoutError") return true;
  if (e.code === "ABORT_ERR") return true;
  const msg = String(e.message ?? "").toLowerCase();
  return msg.includes("aborted") || msg.includes("abort");
}
