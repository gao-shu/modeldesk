import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkGatewayAuth,
  isLoopbackHostname,
  tokenMatches,
} from "./auth.ts";

describe("isLoopbackHostname", () => {
  it("accepts common loopback forms", () => {
    assert.equal(isLoopbackHostname("127.0.0.1"), true);
    assert.equal(isLoopbackHostname("localhost"), true);
    assert.equal(isLoopbackHostname("::1"), true);
    assert.equal(isLoopbackHostname("[::1]"), true);
  });
  it("rejects lan / public hosts", () => {
    assert.equal(isLoopbackHostname("0.0.0.0"), false);
    assert.equal(isLoopbackHostname("192.168.1.2"), false);
    assert.equal(isLoopbackHostname("example.com"), false);
  });
});

describe("tokenMatches", () => {
  it("matches configured token", () => {
    assert.equal(tokenMatches("secret", new Set(["secret"])), true);
    assert.equal(tokenMatches("nope", new Set(["secret"])), false);
  });
});

describe("checkGatewayAuth", () => {
  const prev = { ...process.env };

  function restoreEnv() {
    for (const key of Object.keys(process.env)) {
      if (!(key in prev)) delete process.env[key];
    }
    Object.assign(process.env, prev);
  }

  it("allows loopback when no tokens", () => {
    delete process.env.MODELDESK_GATEWAY_REQUIRE_TOKEN;
    delete process.env.MODELDESK_GATEWAY_ALLOW_OPEN;
    const r = checkGatewayAuth(null, new Set(), "127.0.0.1");
    assert.equal(r.ok, true);
  });

  it("rejects non-loopback when no tokens", () => {
    delete process.env.MODELDESK_GATEWAY_REQUIRE_TOKEN;
    delete process.env.MODELDESK_GATEWAY_ALLOW_OPEN;
    const r = checkGatewayAuth(null, new Set(), "10.0.0.5");
    assert.equal(r.ok, false);
  });

  it("accepts bearer when tokens configured", () => {
    const tokens = new Set(["abc"]);
    assert.equal(
      checkGatewayAuth("Bearer abc", tokens, "10.0.0.5").ok,
      true,
    );
    assert.equal(
      checkGatewayAuth("Bearer wrong", tokens, "10.0.0.5").ok,
      false,
    );
  });

  it("respects ALLOW_OPEN", () => {
    process.env.MODELDESK_GATEWAY_ALLOW_OPEN = "1";
    try {
      assert.equal(checkGatewayAuth(null, new Set(), "10.0.0.5").ok, true);
    } finally {
      restoreEnv();
    }
  });

  it("rejects when REQUIRE_TOKEN=1 and no tokens configured", () => {
    process.env.MODELDESK_GATEWAY_REQUIRE_TOKEN = "1";
    delete process.env.MODELDESK_GATEWAY_ALLOW_OPEN;
    try {
      const r = checkGatewayAuth(null, new Set(), "127.0.0.1");
      assert.equal(r.ok, false);
      if (!r.ok) {
        assert.match(r.reason, /REQUIRE_TOKEN/);
      }
    } finally {
      restoreEnv();
    }
  });
});
