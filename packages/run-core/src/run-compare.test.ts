import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { closeDb } from "./db.ts";
import { createModel } from "./models.ts";
import {
  checkCompareModelsReady,
  runCompareModels,
} from "./run-core.ts";
import {
  createCompareRun,
  finishJobFailure,
  finishJobSuccess,
  getRun,
  listJobsForRun,
} from "./runs.ts";

function uniqueTempDir(label: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `modeldesk-compare-${label}-`));
}

describe("compare prepare validation", () => {
  let dataDir = "";
  let prevDataDir: string | undefined;

  before(() => {
    dataDir = uniqueTempDir("prep");
    prevDataDir = process.env.MODELDESK_DATA_DIR;
    process.env.MODELDESK_DATA_DIR = dataDir;
    closeDb();
    createModel({
      id: "cmp-text-a",
      name: "A",
      modality: "text",
      capability: "chat",
      provider: "mock",
      baseUrl: "mock://text",
      modelId: "mock-a",
    });
    createModel({
      id: "cmp-text-b",
      name: "B",
      modality: "text",
      capability: "chat",
      provider: "mock",
      baseUrl: "mock://text",
      modelId: "mock-b",
    });
    createModel({
      id: "cmp-text-c",
      name: "C",
      modality: "text",
      capability: "chat",
      provider: "mock",
      baseUrl: "mock://text",
      modelId: "mock-c",
    });
    createModel({
      id: "cmp-image-x",
      name: "Img",
      modality: "image",
      capability: "text2img",
      provider: "mock",
      baseUrl: "mock://image",
      modelId: "mock-img",
      defaults: { api_format: "image.mock" },
    });
  });

  after(() => {
    closeDb();
    if (prevDataDir === undefined) delete process.env.MODELDESK_DATA_DIR;
    else process.env.MODELDESK_DATA_DIR = prevDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("rejects fewer than 2 models", () => {
    const r = checkCompareModelsReady(["cmp-text-a"], "text");
    assert.equal(r.kind, "prepare_error");
    if (r.kind === "prepare_error") {
      assert.equal(r.code, "too_few_models");
    }
  });

  it("rejects more than 3 models", () => {
    const r = checkCompareModelsReady(
      ["cmp-text-a", "cmp-text-b", "cmp-text-c", "cmp-text-a"],
      "text",
    );
    assert.equal(r.kind, "prepare_error");
    if (r.kind === "prepare_error") {
      assert.equal(r.code, "too_many_models");
    }
  });

  it("rejects duplicate modelIds", () => {
    const r = checkCompareModelsReady(
      ["cmp-text-a", "cmp-text-a", "cmp-text-b"],
      "text",
    );
    assert.equal(r.kind, "prepare_error");
    if (r.kind === "prepare_error") {
      assert.equal(r.code, "duplicate_models");
    }
  });

  it("rejects invalid modelId", () => {
    const r = checkCompareModelsReady(
      ["cmp-text-a", "missing-model"],
      "text",
    );
    assert.equal(r.kind, "prepare_error");
    if (r.kind === "prepare_error") {
      assert.equal(r.code, "not_found");
    }
  });

  it("rejects mixed modality", () => {
    const r = checkCompareModelsReady(
      ["cmp-text-a", "cmp-image-x"],
      "text",
    );
    assert.equal(r.kind, "prepare_error");
    if (r.kind === "prepare_error") {
      assert.equal(r.code, "modality_mismatch");
    }
  });

  it("accepts 2 and 3 ready text models", () => {
    const two = checkCompareModelsReady(["cmp-text-a", "cmp-text-b"], "text");
    assert.ok("ok" in two && two.ok);
    const three = checkCompareModelsReady(
      ["cmp-text-a", "cmp-text-b", "cmp-text-c"],
      "text",
    );
    assert.ok("ok" in three && three.ok);
    if ("ok" in three) assert.equal(three.sides.length, 3);
  });
});

describe("createCompareRun + partial finalize", () => {
  let dataDir = "";
  let prevDataDir: string | undefined;

  before(() => {
    dataDir = uniqueTempDir("create");
    prevDataDir = process.env.MODELDESK_DATA_DIR;
    process.env.MODELDESK_DATA_DIR = dataDir;
    closeDb();
    for (const id of ["ca", "cb", "cc"] as const) {
      createModel({
        id,
        name: id,
        modality: "text",
        capability: "chat",
        provider: "mock",
        baseUrl: "mock://text",
        modelId: `mock-${id}`,
      });
    }
  });

  after(() => {
    closeDb();
    if (prevDataDir === undefined) delete process.env.MODELDESK_DATA_DIR;
    else process.env.MODELDESK_DATA_DIR = prevDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates 2 jobs", () => {
    const { run, jobs } = createCompareRun({
      prompt: "hi",
      modality: "text",
      sides: [{ modelId: "ca" }, { modelId: "cb" }],
    });
    assert.equal(run.mode, "compare");
    assert.equal(jobs.length, 2);
    assert.equal(listJobsForRun(run.id).length, 2);
  });

  it("rejects 1 or 4 sides and duplicates", () => {
    assert.throws(
      () =>
        createCompareRun({
          prompt: "hi",
          sides: [{ modelId: "ca" }],
        }),
      /2–3/,
    );
    assert.throws(
      () =>
        createCompareRun({
          prompt: "hi",
          sides: [
            { modelId: "ca" },
            { modelId: "cb" },
            { modelId: "cc" },
            { modelId: "ca" },
          ],
        }),
      /2–3/,
    );
    assert.throws(
      () =>
        createCompareRun({
          prompt: "hi",
          sides: [{ modelId: "ca" }, { modelId: "ca" }],
        }),
      /unique/,
    );
  });

  it("creates 3 jobs and finalizes as partial when one fails", () => {
    const { run, jobs } = createCompareRun({
      prompt: "hi",
      modality: "text",
      sides: [{ modelId: "ca" }, { modelId: "cb" }, { modelId: "cc" }],
    });
    assert.equal(jobs.length, 3);

    finishJobSuccess({
      runId: run.id,
      jobId: jobs[0]!.id,
      content: "ok-a",
      latencyMs: 10,
      ttftMs: 1,
      inputTokens: 1,
      outputTokens: 1,
    });
    finishJobFailure({
      runId: run.id,
      jobId: jobs[1]!.id,
      error: "boom",
      latencyMs: 5,
    });
    finishJobSuccess({
      runId: run.id,
      jobId: jobs[2]!.id,
      content: "ok-c",
      latencyMs: 12,
      ttftMs: 2,
      inputTokens: 1,
      outputTokens: 2,
    });

    const row = getRun(run.id);
    assert.ok(row);
    assert.equal(row!.status, "partial");
  });
});

describe("runCompareModels (mock execute)", () => {
  let dataDir = "";
  let prevDataDir: string | undefined;

  before(() => {
    dataDir = uniqueTempDir("exec");
    prevDataDir = process.env.MODELDESK_DATA_DIR;
    process.env.MODELDESK_DATA_DIR = dataDir;
    closeDb();
    for (const id of ["ra", "rb", "rc"] as const) {
      createModel({
        id,
        name: id,
        modality: "text",
        capability: "chat",
        provider: "mock",
        baseUrl: "mock://text",
        modelId: `mock-${id}`,
      });
    }
  });

  after(() => {
    closeDb();
    if (prevDataDir === undefined) delete process.env.MODELDESK_DATA_DIR;
    else process.env.MODELDESK_DATA_DIR = prevDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("2 models succeed via executeModelJob", async () => {
    const outcome = await runCompareModels({
      modelIds: ["ra", "rb"],
      prompt: "hello compare",
      expectModality: "text",
    });
    assert.equal(outcome.kind, "completed");
    if (outcome.kind !== "completed") return;
    assert.equal(outcome.sides.length, 2);
    assert.ok(outcome.sides.every((s) => s.result.ok));
    assert.equal(getRun(outcome.runId)?.status, "succeeded");
  });

  it("3 models succeed via executeModelJob", async () => {
    const outcome = await runCompareModels({
      modelIds: ["ra", "rb", "rc"],
      prompt: "hello three",
      expectModality: "text",
    });
    assert.equal(outcome.kind, "completed");
    if (outcome.kind !== "completed") return;
    assert.equal(outcome.sides.length, 3);
    assert.ok(outcome.sides.every((s) => s.result.ok));
    assert.equal(getRun(outcome.runId)?.status, "succeeded");
  });

  it("does not call runSingleModel path (compare mode persisted)", async () => {
    const outcome = await runCompareModels({
      modelIds: ["ra", "rb"],
      prompt: "mode check",
      expectModality: "text",
    });
    assert.equal(outcome.kind, "completed");
    if (outcome.kind !== "completed") return;
    assert.equal(getRun(outcome.runId)?.mode, "compare");
  });

  it("partial when one side fails at execute", async () => {
    const prevSecret = process.env.ENCRYPTION_SECRET;
    process.env.ENCRYPTION_SECRET =
      prevSecret?.trim() || "compare-test-encryption-secret-32b!";
    try {
      createModel({
        id: "rb-bad",
        name: "bad",
        modality: "text",
        capability: "chat",
        provider: "openai",
        baseUrl: "http://127.0.0.1:9",
        modelId: "nope",
        apiKey: "test-key",
      });
      const events: Array<{ event: string; data: Record<string, unknown> }> =
        [];
      const outcome = await runCompareModels({
        modelIds: ["ra", "rb-bad", "rc"],
        prompt: "partial check",
        expectModality: "text",
        onEvent: (event, data) => {
          if (data && typeof data === "object") {
            events.push({ event, data: data as Record<string, unknown> });
          }
        },
      });
      assert.equal(outcome.kind, "completed");
      if (outcome.kind !== "completed") return;
      assert.equal(outcome.sides.length, 3);
      const oks = outcome.sides.filter((s) => s.result.ok);
      const fails = outcome.sides.filter((s) => !s.result.ok);
      assert.equal(oks.length, 2);
      assert.equal(fails.length, 1);
      assert.equal(getRun(outcome.runId)?.status, "partial");
      assert.ok(events.some((e) => e.event === "done" && e.data.slot === "0"));
      assert.ok(events.some((e) => e.event === "error" && e.data.slot === "1"));
      assert.ok(events.some((e) => e.event === "done" && e.data.slot === "2"));
    } finally {
      if (prevSecret === undefined) delete process.env.ENCRYPTION_SECRET;
      else process.env.ENCRYPTION_SECRET = prevSecret;
    }
  });
});
