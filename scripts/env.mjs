/**
 * Shared env helpers for desktop sidecar / packaging scripts (MODELDESK_* only).
 */

export function envTruthy(value) {
  if (!value) return false;
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Child-process env for desktop sidecar. */
export function withDesktopEnv(base, { dataDir } = {}) {
  const env = { ...base };
  env.MODELDESK_DESKTOP = "1";
  if (dataDir) env.MODELDESK_DATA_DIR = dataDir;
  return env;
}
