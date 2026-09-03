import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isoToUnixSeconds,
  mapJobStatusToVideoStatus,
  progressFromJobState,
} from "./video-task.ts";

describe("video-task status mapping", () => {
  it("maps job status to OpenAI-ish video status", () => {
    assert.equal(mapJobStatusToVideoStatus("queued"), "queued");
    assert.equal(mapJobStatusToVideoStatus("running"), "in_progress");
    assert.equal(mapJobStatusToVideoStatus("succeeded"), "completed");
    assert.equal(mapJobStatusToVideoStatus("failed"), "failed");
    assert.equal(mapJobStatusToVideoStatus("cancelled"), "failed");
  });

  it("derives progress from job + _progress", () => {
    assert.equal(
      progressFromJobState({ jobStatus: "queued", response: null }),
      0,
    );
    assert.equal(
      progressFromJobState({ jobStatus: "succeeded", response: null }),
      100,
    );
    assert.equal(
      progressFromJobState({ jobStatus: "failed", response: null }),
      0,
    );
    assert.equal(
      progressFromJobState({
        jobStatus: "running",
        response: { _progress: { progress: 42 } },
      }),
      42,
    );
    assert.equal(
      progressFromJobState({
        jobStatus: "running",
        response: { _progress: { detail: "rendering 67%" } },
      }),
      67,
    );
    assert.equal(
      progressFromJobState({
        jobStatus: "running",
        response: { _progress: { status: "queued" } },
      }),
      0,
    );
    assert.equal(
      progressFromJobState({ jobStatus: "running", response: null }),
      0,
    );
  });

  it("parses created_at from ISO", () => {
    assert.equal(isoToUnixSeconds("1970-01-01T00:00:01.000Z"), 1);
    assert.ok(isoToUnixSeconds(null) > 0);
  });
});
