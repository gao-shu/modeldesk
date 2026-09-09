import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  acquireGatewaySlot,
  resetGatewayRateLimitState,
} from "./rate-limit.ts";

describe("acquireGatewaySlot", () => {
  beforeEach(() => {
    resetGatewayRateLimitState();
    process.env.MODELDESK_GATEWAY_MAX_CONCURRENT = "2";
    process.env.MODELDESK_GATEWAY_RPM = "0";
  });

  it("limits concurrent slots", () => {
    const a = acquireGatewaySlot();
    const b = acquireGatewaySlot();
    const c = acquireGatewaySlot();
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(c.ok, false);
    if (a.ok) a.release();
    const d = acquireGatewaySlot();
    assert.equal(d.ok, true);
    if (b.ok) b.release();
    if (d.ok) d.release();
  });

  it("limits requests per minute when RPM set", () => {
    process.env.MODELDESK_GATEWAY_MAX_CONCURRENT = "0";
    process.env.MODELDESK_GATEWAY_RPM = "2";
    resetGatewayRateLimitState();
    const a = acquireGatewaySlot("rpm-test");
    const b = acquireGatewaySlot("rpm-test");
    const c = acquireGatewaySlot("rpm-test");
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(c.ok, false);
    if (c.ok === false) assert.equal(c.status, 429);
    if (a.ok) a.release();
    if (b.ok) b.release();
  });
});
