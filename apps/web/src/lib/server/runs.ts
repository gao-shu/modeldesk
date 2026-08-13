import { randomUUID } from "node:crypto";
import { getDb, nowIso } from "./db";
import { parseJsonObject } from "./json";
import { hasRunAbort } from "./run-abort";

export type EvalRunRow = {
  id: string;
  suite_id: string | null;
  mode: string;
  status: string;
  config_snapshot: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type EvalJobRow = {
  id: string;
  run_id: string;
  model_id: string;
  case_id: string | null;
  status: string;
  request_json: string;
  response_json: string | null;
  error: string | null;
  latency_ms: number | null;
  ttft_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  finished_at: string | null;
};

export type EvalRunPublic = {
  id: string;
  mode: string;
  status: string;
  config: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type EvalJobPublic = {
  id: string;
  runId: string;
  modelId: string;
  caseId: string | null;
  status: string;
  request: Record<string, unknown>;
  response: Record<string, unknown> | null;
  error: string | null;
  latencyMs: number | null;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
  finishedAt: string | null;
};

export type VotePublic = {
  id: string;
  runId: string;
  winner: string;
  notes: string | null;
  createdAt: string;
};

export function toPublicRun(row: EvalRunRow): EvalRunPublic {
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    config: parseJsonObject(row.config_snapshot),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

export function toPublicJob(row: EvalJobRow): EvalJobPublic {
  return {
    id: row.id,
    runId: row.run_id,
    modelId: row.model_id,
    caseId: row.case_id,
    status: row.status,
    request: parseJsonObject(row.request_json),
    response: row.response_json ? parseJsonObject(row.response_json) : null,
    error: row.error,
    latencyMs: row.latency_ms,
    ttftMs: row.ttft_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export function getRun(id: string): EvalRunRow | null {
  const row = getDb().prepare(`SELECT * FROM eval_runs WHERE id = ?`).get(id) as
    | EvalRunRow
    | undefined;
  return row ?? null;
}

export function getJob(id: string): EvalJobRow | null {
  const row = getDb().prepare(`SELECT * FROM eval_jobs WHERE id = ?`).get(id) as
    | EvalJobRow
    | undefined;
  return row ?? null;
}

export function createSingleRun(input: {
  modelId: string;
  prompt: string;
  temperature?: number | null;
  maxTokens?: number | null;
  params?: Record<string, unknown> | null;
  modelSnapshot?: Record<string, unknown>;
  suiteId?: string | null;
  caseId?: string | null;
  modality?: string;
}): { run: EvalRunPublic; job: EvalJobPublic } {
  const db = getDb();
  const runId = randomUUID();
  const jobId = randomUUID();
  const ts = nowIso();

  const config = {
    prompt: input.prompt,
    temperature: input.temperature ?? null,
    maxTokens: input.maxTokens ?? null,
    params: input.params ?? null,
    modality: input.modality ?? null,
    model: input.modelSnapshot ?? { id: input.modelId },
  };

  const request = {
    prompt: input.prompt,
    temperature: input.temperature ?? null,
    maxTokens: input.maxTokens ?? null,
    params: input.params ?? null,
  };

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO eval_runs (
        id, suite_id, mode, status, config_snapshot, started_at, finished_at, created_at
      ) VALUES (?, ?, 'single', 'running', ?, ?, NULL, ?)`,
    ).run(runId, input.suiteId ?? null, JSON.stringify(config), ts, ts);

    db.prepare(
      `INSERT INTO eval_run_models (run_id, model_id, slot) VALUES (?, ?, 0)`,
    ).run(runId, input.modelId);

    db.prepare(
      `INSERT INTO eval_jobs (
        id, run_id, model_id, case_id, status, request_json, response_json,
        error, latency_ms, ttft_ms, input_tokens, output_tokens, created_at, finished_at
      ) VALUES (?, ?, ?, ?, 'running', ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL)`,
    ).run(
      jobId,
      runId,
      input.modelId,
      input.caseId ?? null,
      JSON.stringify(request),
      ts,
    );
  });
  tx();

  return {
    run: toPublicRun(getRun(runId)!),
    job: toPublicJob(getJob(jobId)!),
  };
}

export type CompareSideInput = {
  modelId: string;
  modelSnapshot?: Record<string, unknown>;
};

export function createCompareRun(input: {
  prompt: string;
  temperature?: number | null;
  maxTokens?: number | null;
  params?: Record<string, unknown> | null;
  sides: [CompareSideInput, CompareSideInput];
  suiteId?: string | null;
  caseId?: string | null;
  modality?: string;
}): { run: EvalRunPublic; jobs: [EvalJobPublic, EvalJobPublic] } {
  const db = getDb();
  const runId = randomUUID();
  const jobIds = [randomUUID(), randomUUID()] as const;
  const ts = nowIso();

  const config = {
    prompt: input.prompt,
    temperature: input.temperature ?? null,
    maxTokens: input.maxTokens ?? null,
    params: input.params ?? null,
    modality: input.modality ?? null,
    models: input.sides.map((s, slot) => ({
      slot,
      ...(s.modelSnapshot ?? { id: s.modelId }),
    })),
  };

  const request = {
    prompt: input.prompt,
    temperature: input.temperature ?? null,
    maxTokens: input.maxTokens ?? null,
    params: input.params ?? null,
  };

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO eval_runs (
        id, suite_id, mode, status, config_snapshot, started_at, finished_at, created_at
      ) VALUES (?, ?, 'compare', 'running', ?, ?, NULL, ?)`,
    ).run(runId, input.suiteId ?? null, JSON.stringify(config), ts, ts);

    input.sides.forEach((side, slot) => {
      db.prepare(
        `INSERT INTO eval_run_models (run_id, model_id, slot) VALUES (?, ?, ?)`,
      ).run(runId, side.modelId, slot);
      db.prepare(
        `INSERT INTO eval_jobs (
          id, run_id, model_id, case_id, status, request_json, response_json,
          error, latency_ms, ttft_ms, input_tokens, output_tokens, created_at, finished_at
        ) VALUES (?, ?, ?, ?, 'running', ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL)`,
      ).run(
        jobIds[slot],
        runId,
        side.modelId,
        input.caseId ?? null,
        JSON.stringify(request),
        ts,
      );
    });
  });
  tx();

  return {
    run: toPublicRun(getRun(runId)!),
    jobs: [toPublicJob(getJob(jobIds[0])!), toPublicJob(getJob(jobIds[1])!)],
  };
}

export function listJobsForRun(runId: string): EvalJobPublic[] {
  const rows = getDb()
    .prepare(
      `SELECT j.* FROM eval_jobs j
       LEFT JOIN eval_run_models rm
         ON rm.run_id = j.run_id AND rm.model_id = j.model_id
       WHERE j.run_id = ?
       ORDER BY COALESCE(rm.slot, 0) ASC, j.created_at ASC`,
    )
    .all(runId) as EvalJobRow[];
  return rows.map(toPublicJob);
}

export function countRunsByMode(
  mode: "single" | "compare",
  status?: string,
  modality?: string,
  modelId?: string,
): number {
  const params: unknown[] = [mode];
  let where = "WHERE mode = ?";
  if (status) {
    where += " AND status = ?";
    params.push(status);
  }
  if (modality) {
    where += ` AND json_extract(config_snapshot, '$.modality') = ?`;
    params.push(modality);
  }
  if (modelId) {
    where += ` AND EXISTS (
      SELECT 1 FROM eval_jobs j
      WHERE j.run_id = eval_runs.id AND j.model_id = ?
    )`;
    params.push(modelId);
  }
  const row = getDb()
    .prepare(`SELECT COUNT(*) AS n FROM eval_runs ${where}`)
    .get(...params) as { n: number };
  return row?.n ?? 0;
}

let orphansCleanedThisProcess = false;

/** Recent progress heartbeat — skip orphan cancel while worker still ticking. */
const HEARTBEAT_FRESH_MS = 180_000;
/** Brand-new jobs may not have registered abort yet. */
const ORPHAN_STARTUP_GRACE_MS = 45_000;

function heartbeatAgeMs(responseJson: string | null | undefined): number | null {
  if (!responseJson) return null;
  const hb = parseJsonObject(responseJson)._heartbeatAt;
  if (typeof hb !== "string" || !hb.trim()) return null;
  const ms = Date.parse(hb);
  return Number.isFinite(ms) ? Date.now() - ms : null;
}

function hasFreshHeartbeat(responseJson: string | null | undefined): boolean {
  const age = heartbeatAgeMs(responseJson);
  return age != null && age >= 0 && age < HEARTBEAT_FRESH_MS;
}

/** Persist that an in-flight job is still making progress (poll / SSE). */
export function touchJobHeartbeat(jobId: string): void {
  mergeJobResponse(jobId, { _heartbeatAt: nowIso() });
}

/** Once per process: clear DB rows left running after a crash/restart. */
function ensureOrphansCleaned(): void {
  if (!orphansCleanedThisProcess) {
    orphansCleanedThisProcess = true;
    cancelOrphanedInFlightRuns();
  }
  // Also reclaim jobs whose SSE died mid-process or exceeded max age.
  sweepStaleInFlightRuns();
}

/**
 * Mark jobs still "running" in DB but with no live worker, or older than max age.
 * Prevents history from sticking on「进行中」after disconnect / hang.
 */
export function sweepStaleInFlightRuns(options?: {
  /** Fail jobs older than this (default 25 min; video wait is 10 min + buffer). */
  maxAgeMs?: number;
  /**
   * Cancel jobs with no abort controller / heartbeat after this grace
   * (default 3 min — long enough for video poll intervals + brief HMR).
   */
  orphanGraceMs?: number;
}): { swept: number } {
  const maxAgeMs = options?.maxAgeMs ?? 25 * 60 * 1000;
  const orphanGraceMs = options?.orphanGraceMs ?? 3 * 60_000;
  const now = Date.now();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id as jobId, run_id as runId, created_at as createdAt, response_json as responseJson
       FROM eval_jobs
       WHERE status IN ('running', 'queued')`,
    )
    .all() as Array<{
    jobId: string;
    runId: string;
    createdAt: string;
    responseJson: string | null;
  }>;

  let swept = 0;
  for (const row of rows) {
    const createdMs = Date.parse(row.createdAt);
    const age = Number.isFinite(createdMs) ? now - createdMs : maxAgeMs;
    const alive = hasRunAbort(row.runId);
    const freshHb = hasFreshHeartbeat(row.responseJson);
    const staleByAge = age >= maxAgeMs && !alive && !freshHb;
    const orphaned =
      !alive && !freshHb && age >= orphanGraceMs && age >= ORPHAN_STARTUP_GRACE_MS;
    if (!staleByAge && !orphaned) continue;

    if (staleByAge) {
      finishJobFailure({
        runId: row.runId,
        jobId: row.jobId,
        error: "任务超时未完成",
        latencyMs: age,
      });
    } else {
      finishJobCancelled({
        runId: row.runId,
        jobId: row.jobId,
        reason: "连接中断，任务已终止",
        latencyMs: age,
      });
    }
    swept += 1;
  }
  return { swept };
}

export function listRecentSingleRuns(
  limit = 15,
  offset = 0,
  status?: string,
  modality?: string,
  modelId?: string,
): Array<{
  run: EvalRunPublic;
  job: EvalJobPublic | null;
}> {
  ensureOrphansCleaned();
  const params: unknown[] = [];
  let where = "WHERE mode = 'single'";
  if (status) {
    where += " AND status = ?";
    params.push(status);
  }
  if (modality) {
    where += ` AND json_extract(config_snapshot, '$.modality') = ?`;
    params.push(modality);
  }
  if (modelId) {
    where += ` AND EXISTS (
      SELECT 1 FROM eval_jobs j
      WHERE j.run_id = eval_runs.id AND j.model_id = ?
    )`;
    params.push(modelId);
  }
  params.push(limit, offset);
  const rows = getDb()
    .prepare(
      `SELECT * FROM eval_runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params) as EvalRunRow[];

  return rows.map((run) => {
    const job = getDb()
      .prepare(
        `SELECT * FROM eval_jobs WHERE run_id = ? ORDER BY created_at ASC LIMIT 1`,
      )
      .get(run.id) as EvalJobRow | undefined;
    return {
      run: toPublicRun(run),
      job: job ? toPublicJob(job) : null,
    };
  });
}

export type ActiveRunProgress = {
  status: string | null;
  detail: string | null;
  at: string | null;
};

/** Slim in-flight row for status polling (not the history list). */
export type ActiveRunSummary = {
  runId: string;
  jobId: string;
  modelId: string;
  modality: string;
  prompt: string;
  /** Job status (`running` | `queued`). */
  status: string;
  runStatus: string;
  progress: ActiveRunProgress | null;
  error: string | null;
  params: Record<string, unknown> | null;
  updatedAt: string;
};

function progressFromResponse(
  response: Record<string, unknown>,
): ActiveRunProgress | null {
  const raw = response._progress;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const p = raw as Record<string, unknown>;
  return {
    status: typeof p.status === "string" ? p.status : null,
    detail: p.detail != null ? String(p.detail) : null,
    at: typeof p.at === "string" ? p.at : null,
  };
}

/**
 * In-flight single runs only — lightweight fields for client status sync.
 * Calls orphan sweep so history does not stick on「进行中」after crash.
 */
export function listActiveRuns(limit = 50): ActiveRunSummary[] {
  ensureOrphansCleaned();
  const cap = Math.min(Math.max(limit, 1), 100);
  const rows = getDb()
    .prepare(
      `SELECT
         r.id AS run_id,
         r.status AS run_status,
         r.config_snapshot AS config_snapshot,
         j.id AS job_id,
         j.model_id AS model_id,
         j.status AS job_status,
         j.error AS error,
         j.response_json AS response_json,
         j.created_at AS job_created_at
       FROM eval_jobs j
       INNER JOIN eval_runs r ON r.id = j.run_id
       WHERE r.mode = 'single'
         AND j.status IN ('running', 'queued')
       ORDER BY j.created_at DESC
       LIMIT ?`,
    )
    .all(cap) as Array<{
    run_id: string;
    run_status: string;
    config_snapshot: string;
    job_id: string;
    model_id: string;
    job_status: string;
    error: string | null;
    response_json: string | null;
    job_created_at: string;
  }>;

  return rows.map((row) => {
    const config = parseJsonObject(row.config_snapshot);
    const response = row.response_json
      ? parseJsonObject(row.response_json)
      : {};
    const progress = progressFromResponse(response);
    const params =
      config.params &&
      typeof config.params === "object" &&
      !Array.isArray(config.params)
        ? (config.params as Record<string, unknown>)
        : null;
    return {
      runId: row.run_id,
      jobId: row.job_id,
      modelId: row.model_id,
      modality:
        typeof config.modality === "string" ? config.modality : "text",
      prompt: typeof config.prompt === "string" ? config.prompt : "",
      status: row.job_status,
      runStatus: row.run_status,
      progress,
      error: row.error,
      params,
      updatedAt: progress?.at ?? row.job_created_at,
    };
  });
}

/** Single run + primary job (for by-id status / detail). */
export function getRunWithJob(runId: string): {
  run: EvalRunPublic;
  job: EvalJobPublic | null;
} | null {
  ensureOrphansCleaned();
  const run = getRun(runId);
  if (!run) return null;
  const job = getDb()
    .prepare(
      `SELECT * FROM eval_jobs WHERE run_id = ? ORDER BY created_at ASC LIMIT 1`,
    )
    .get(runId) as EvalJobRow | undefined;
  return {
    run: toPublicRun(run),
    job: job ? toPublicJob(job) : null,
  };
}

export function getVoteForRun(runId: string): VotePublic | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM votes WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(runId) as
    | {
        id: string;
        run_id: string;
        winner: string;
        notes: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    winner: row.winner,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function listRecentCompareRuns(
  limit = 15,
  offset = 0,
  modality?: string,
): Array<{
  run: EvalRunPublic;
  jobs: EvalJobPublic[];
  vote: VotePublic | null;
}> {
  ensureOrphansCleaned();
  const params: unknown[] = [];
  let where = "WHERE mode = 'compare'";
  if (modality) {
    where += ` AND json_extract(config_snapshot, '$.modality') = ?`;
    params.push(modality);
  }
  params.push(limit, offset);
  const rows = getDb()
    .prepare(
      `SELECT * FROM eval_runs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params) as EvalRunRow[];

  return rows.map((run) => ({
    run: toPublicRun(run),
    jobs: listJobsForRun(run.id),
    vote: getVoteForRun(run.id),
  }));
}

/** When all jobs for a run are terminal, set run status (supports multi-job compare). */
function finalizeRunStatus(runId: string, ts: string): void {
  const db = getDb();
  const jobs = db
    .prepare(`SELECT status FROM eval_jobs WHERE run_id = ?`)
    .all(runId) as Array<{ status: string }>;
  if (jobs.length === 0) return;
  if (jobs.some((j) => j.status === "running" || j.status === "queued")) {
    return;
  }
  const succeeded = jobs.filter((j) => j.status === "succeeded").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const cancelled = jobs.filter((j) => j.status === "cancelled").length;
  let status = "failed";
  if (cancelled === jobs.length) status = "cancelled";
  else if (succeeded === jobs.length) status = "succeeded";
  else if (succeeded > 0) status = "partial";
  else if (cancelled > 0 && failed === 0) status = "cancelled";
  db.prepare(
    `UPDATE eval_runs SET status = ?, finished_at = ? WHERE id = ?`,
  ).run(status, ts, runId);
}

export function finishJobSuccess(input: {
  runId: string;
  jobId: string;
  content?: string;
  artifactId?: string | null;
  remoteUrl?: string | null;
  latencyMs: number;
  ttftMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  extraResponse?: Record<string, unknown>;
}): void {
  const ts = nowIso();
  const db = getDb();
  const response = {
    content: input.content ?? "",
    artifactId: input.artifactId ?? null,
    remoteUrl: input.remoteUrl ?? null,
    ...(input.extraResponse ?? {}),
  };
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE eval_jobs SET
        status = 'succeeded',
        response_json = ?,
        error = NULL,
        latency_ms = ?,
        ttft_ms = ?,
        input_tokens = ?,
        output_tokens = ?,
        finished_at = ?
      WHERE id = ?`,
    ).run(
      JSON.stringify(response),
      input.latencyMs,
      input.ttftMs,
      input.inputTokens,
      input.outputTokens,
      ts,
      input.jobId,
    );
    finalizeRunStatus(input.runId, ts);
  });
  tx();
}

export function finishJobFailure(input: {
  runId: string;
  jobId: string;
  error: string;
  latencyMs: number | null;
  ttftMs?: number | null;
  partialContent?: string;
  extraResponse?: Record<string, unknown>;
}): void {
  const ts = nowIso();
  const db = getDb();
  const tx = db.transaction(() => {
    const response: Record<string, unknown> = {
      ...(input.partialContent ? { content: input.partialContent } : {}),
      ...(input.extraResponse ?? {}),
    };
    db.prepare(
      `UPDATE eval_jobs SET
        status = 'failed',
        response_json = ?,
        error = ?,
        latency_ms = ?,
        ttft_ms = ?,
        finished_at = ?
      WHERE id = ?`,
    ).run(
      Object.keys(response).length > 0 ? JSON.stringify(response) : null,
      input.error,
      input.latencyMs,
      input.ttftMs ?? null,
      ts,
      input.jobId,
    );
    finalizeRunStatus(input.runId, ts);
  });
  tx();
}

/** Merge fields into job.response_json without changing status (e.g. persist _httpLog early). */
export function mergeJobResponse(
  jobId: string,
  patch: Record<string, unknown>,
): void {
  if (!patch || Object.keys(patch).length === 0) return;
  const db = getDb();
  const row = db
    .prepare(`SELECT response_json FROM eval_jobs WHERE id = ?`)
    .get(jobId) as { response_json: string | null } | undefined;
  if (!row) return;
  const current = row.response_json ? parseJsonObject(row.response_json) : {};
  const next = { ...current, ...patch };
  db.prepare(`UPDATE eval_jobs SET response_json = ? WHERE id = ?`).run(
    JSON.stringify(next),
    jobId,
  );
}

/** Mark a single job cancelled (e.g. AbortSignal). Merges extraResponse even if already terminal. */
export function finishJobCancelled(input: {
  runId: string;
  jobId: string;
  latencyMs?: number | null;
  partialContent?: string;
  reason?: string;
  extraResponse?: Record<string, unknown>;
}): void {
  const existing = getDb()
    .prepare(`SELECT status, response_json FROM eval_jobs WHERE id = ?`)
    .get(input.jobId) as
    | { status: string; response_json: string | null }
    | undefined;
  const alreadyTerminal =
    existing &&
    existing.status !== "running" &&
    existing.status !== "queued";

  const ts = nowIso();
  const db = getDb();
  const prev = existing?.response_json
    ? parseJsonObject(existing.response_json)
    : {};
  const response: Record<string, unknown> = {
    ...prev,
    ...(input.partialContent ? { content: input.partialContent } : {}),
    ...(input.extraResponse ?? {}),
  };

  if (alreadyTerminal) {
    // Cancel API may have flipped status first — still persist log / partials.
    if (Object.keys(response).length > 0) {
      db.prepare(`UPDATE eval_jobs SET response_json = ? WHERE id = ?`).run(
        JSON.stringify(response),
        input.jobId,
      );
    }
    finalizeRunStatus(input.runId, ts);
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE eval_jobs SET
        status = 'cancelled',
        response_json = ?,
        error = ?,
        latency_ms = ?,
        finished_at = ?
      WHERE id = ?`,
    ).run(
      Object.keys(response).length > 0 ? JSON.stringify(response) : null,
      input.reason ?? "已取消",
      input.latencyMs ?? null,
      ts,
      input.jobId,
    );
    finalizeRunStatus(input.runId, ts);
  });
  tx();
}

/**
 * After process restart, in-memory work is gone but DB may still say running.
 * Mark those orphans cancelled so history does not stick on「进行中」.
 * Skips runs still alive in this process (abort registry) or with a fresh
 * progress heartbeat (long video polls / Next HMR must not false-cancel).
 */
export function cancelOrphanedInFlightRuns(
  reason = "服务重启，任务中断",
): { cancelledRuns: number; cancelledJobs: number } {
  const ts = nowIso();
  const db = getDb();
  let cancelledRuns = 0;
  let cancelledJobs = 0;

  const jobs = db
    .prepare(
      `SELECT id, run_id as runId, created_at as createdAt, response_json as responseJson
       FROM eval_jobs
       WHERE status IN ('running', 'queued')`,
    )
    .all() as Array<{
    id: string;
    runId: string;
    createdAt: string;
    responseJson: string | null;
  }>;

  const cancelJobIds: string[] = [];
  const touchedRunIds = new Set<string>();

  for (const job of jobs) {
    if (hasRunAbort(job.runId)) continue;
    if (hasFreshHeartbeat(job.responseJson)) continue;
    const createdMs = Date.parse(job.createdAt);
    const age = Number.isFinite(createdMs) ? Date.now() - createdMs : ORPHAN_STARTUP_GRACE_MS;
    if (age < ORPHAN_STARTUP_GRACE_MS) continue;
    cancelJobIds.push(job.id);
    touchedRunIds.add(job.runId);
  }

  if (cancelJobIds.length === 0 && touchedRunIds.size === 0) {
    // Still finalize any run rows stuck without jobs — rare
    const runIds = db
      .prepare(
        `SELECT id FROM eval_runs WHERE status IN ('running', 'queued')`,
      )
      .all() as Array<{ id: string }>;
    for (const { id } of runIds) {
      if (hasRunAbort(id)) continue;
      const hasLiveJob = db
        .prepare(
          `SELECT 1 AS ok FROM eval_jobs
           WHERE run_id = ? AND status IN ('running', 'queued') LIMIT 1`,
        )
        .get(id) as { ok: number } | undefined;
      if (hasLiveJob) continue;
      finalizeRunStatus(id, ts);
      const run = db
        .prepare(`SELECT status FROM eval_runs WHERE id = ?`)
        .get(id) as { status: string } | undefined;
      if (run?.status === "running" || run?.status === "queued") {
        db.prepare(
          `UPDATE eval_runs SET status = 'cancelled', finished_at = ? WHERE id = ?`,
        ).run(ts, id);
        cancelledRuns += 1;
      }
    }
    return { cancelledRuns, cancelledJobs };
  }

  const tx = db.transaction(() => {
    const stmt = db.prepare(
      `UPDATE eval_jobs SET
        status = 'cancelled',
        error = ?,
        finished_at = ?
      WHERE id = ? AND status IN ('running', 'queued')`,
    );
    for (const jobId of cancelJobIds) {
      const result = stmt.run(reason, ts, jobId);
      cancelledJobs += result.changes;
    }

    for (const id of touchedRunIds) {
      finalizeRunStatus(id, ts);
      const run = db
        .prepare(`SELECT status FROM eval_runs WHERE id = ?`)
        .get(id) as { status: string } | undefined;
      if (run?.status === "running" || run?.status === "queued") {
        db.prepare(
          `UPDATE eval_runs SET status = 'cancelled', finished_at = ? WHERE id = ?`,
        ).run(ts, id);
      }
      cancelledRuns += 1;
    }
  });
  tx();
  return { cancelledRuns, cancelledJobs };
}

/** Mark still-running/queued jobs for a run as cancelled. */
export function cancelRunJobs(
  runId: string,
  reason = "已取消",
): { cancelledJobs: number } {
  const ts = nowIso();
  const db = getDb();
  let cancelledJobs = 0;
  const tx = db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE eval_jobs SET
          status = 'cancelled',
          error = ?,
          finished_at = ?
        WHERE run_id = ? AND status IN ('running', 'queued')`,
      )
      .run(reason, ts, runId);
    cancelledJobs = result.changes;
    finalizeRunStatus(runId, ts);
    // If no jobs were updated but run still running, force run cancelled
    const run = db
      .prepare(`SELECT status FROM eval_runs WHERE id = ?`)
      .get(runId) as { status: string } | undefined;
    if (run?.status === "running") {
      db.prepare(
        `UPDATE eval_runs SET status = 'cancelled', finished_at = ? WHERE id = ?`,
      ).run(ts, runId);
    }
  });
  tx();
  return { cancelledJobs };
}

/** Upsert latest vote for a compare run. winner: A | B | tie */
export function saveVote(input: {
  runId: string;
  winner: "A" | "B" | "tie";
  notes?: string | null;
}): VotePublic {
  const run = getRun(input.runId);
  if (!run) throw new Error("Run not found");
  if (run.mode !== "compare") throw new Error("Votes only for compare runs");

  const existing = getDb()
    .prepare(`SELECT id FROM votes WHERE run_id = ? LIMIT 1`)
    .get(input.runId) as { id: string } | undefined;

  const ts = nowIso();
  if (existing) {
    getDb()
      .prepare(
        `UPDATE votes SET winner = ?, notes = ?, created_at = ? WHERE id = ?`,
      )
      .run(input.winner, input.notes ?? null, ts, existing.id);
    return getVoteForRun(input.runId)!;
  }

  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO votes (id, run_id, case_id, winner, notes, created_at)
       VALUES (?, ?, NULL, ?, ?, ?)`,
    )
    .run(id, input.runId, input.winner, input.notes ?? null, ts);
  return getVoteForRun(input.runId)!;
}

/** Rough cost from pricing_json: { inputPerMTok, outputPerMTok } in USD. */
export function estimateCostUsd(input: {
  pricing: Record<string, unknown>;
  inputTokens: number | null;
  outputTokens: number | null;
}): number | null {
  const inRate =
    typeof input.pricing.inputPerMTok === "number"
      ? input.pricing.inputPerMTok
      : typeof input.pricing.input_per_mtok === "number"
        ? input.pricing.input_per_mtok
        : null;
  const outRate =
    typeof input.pricing.outputPerMTok === "number"
      ? input.pricing.outputPerMTok
      : typeof input.pricing.output_per_mtok === "number"
        ? input.pricing.output_per_mtok
        : null;
  if (
    inRate == null ||
    outRate == null ||
    input.inputTokens == null ||
    input.outputTokens == null
  ) {
    return null;
  }
  return (
    (input.inputTokens / 1_000_000) * inRate +
    (input.outputTokens / 1_000_000) * outRate
  );
}
