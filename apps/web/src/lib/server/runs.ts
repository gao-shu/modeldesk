import { randomUUID } from "node:crypto";
import { getDb, nowIso } from "./db";
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

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

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
  /** Fail jobs older than this (default 12 min; image timeout is 5 min). */
  maxAgeMs?: number;
  /** Cancel jobs with no abort controller after this grace (default 45s). */
  orphanGraceMs?: number;
}): { swept: number } {
  const maxAgeMs = options?.maxAgeMs ?? 12 * 60 * 1000;
  const orphanGraceMs = options?.orphanGraceMs ?? 45_000;
  const now = Date.now();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id as jobId, run_id as runId, created_at as createdAt
       FROM eval_jobs
       WHERE status IN ('running', 'queued')`,
    )
    .all() as Array<{ jobId: string; runId: string; createdAt: string }>;

  let swept = 0;
  for (const row of rows) {
    const createdMs = Date.parse(row.createdAt);
    const age = Number.isFinite(createdMs) ? now - createdMs : maxAgeMs;
    const alive = hasRunAbort(row.runId);
    const staleByAge = age >= maxAgeMs;
    const orphaned = !alive && age >= orphanGraceMs;
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
 */
export function cancelOrphanedInFlightRuns(
  reason = "服务重启，任务中断",
): { cancelledRuns: number; cancelledJobs: number } {
  const ts = nowIso();
  const db = getDb();
  let cancelledRuns = 0;
  let cancelledJobs = 0;
  const tx = db.transaction(() => {
    const jobResult = db
      .prepare(
        `UPDATE eval_jobs SET
          status = 'cancelled',
          error = ?,
          finished_at = ?
        WHERE status IN ('running', 'queued')`,
      )
      .run(reason, ts);
    cancelledJobs = jobResult.changes;

    const runIds = db
      .prepare(
        `SELECT id FROM eval_runs WHERE status IN ('running', 'queued')`,
      )
      .all() as Array<{ id: string }>;
    for (const { id } of runIds) {
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
