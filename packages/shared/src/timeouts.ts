/** Default wait budget for upstream video generation (submit + poll). */
export const VIDEO_WAIT_TIMEOUT_MS = 1_800_000; // 30 minutes

/**
 * Sweep in-flight jobs older than this when no worker/heartbeat.
 * Keep above {@link VIDEO_WAIT_TIMEOUT_MS} so slow platforms are not cancelled early.
 */
export const VIDEO_ORPHAN_MAX_AGE_MS = 40 * 60 * 1000; // 40 minutes
