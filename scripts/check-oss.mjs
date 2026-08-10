#!/usr/bin/env node
/**
 * Pre-publish hygiene scan (see SECURITY.md).
 * Exit 1 if tracked secrets / risky paths look committed.
 */
import { execSync } from "node:child_process";

function gitLines(cmd) {
  try {
    const out = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return out ? out.split(/\r?\n/).filter(Boolean) : [];
  } catch (err) {
    const out = String(err?.stdout ?? "").trim();
    return out ? out.split(/\r?\n/).filter(Boolean) : [];
  }
}

let failed = false;

function fail(msg) {
  console.error(`FAIL  ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`OK    ${msg}`);
}

const tracked = gitLines("git ls-files");
const secretish = tracked
  .filter((f) =>
    /(\.env($|\.)|\.db$|\.sqlite|\.encryption-secret|encryption-secret$|engine\.zip$)/i.test(
      f,
    ),
  )
  .filter((f) => !/\.example(\.|$)/i.test(f))
  .filter((f) => !/encryption-secret\.ts$/i.test(f));

if (secretish.length) {
  fail(`tracked secret-like paths:\n  ${secretish.join("\n  ")}`);
} else {
  ok("no tracked .env / *.db / encryption-secret / engine.zip (examples OK)");
}

const absHits = gitLines(
  'git grep -nE "E:\\\\\\\\|/Users/[^/]+/|/home/[^/]+/" -- ":!pnpm-lock.yaml" ":!**/*.png" ":!**/*.ico"',
);
if (absHits.length) {
  fail(
    `possible machine-local absolute paths in tracked text:\n${absHits.slice(0, 40).join("\n")}`,
  );
} else {
  ok("no obvious absolute home/drive paths in tracked text");
}

const rootJunk = tracked.filter(
  (f) =>
    /^(final-runs-ui|models-|runs-|dev-server\.)/i.test(f) ||
    /^tmp-query-db\.mjs$/i.test(f),
);
if (rootJunk.length) {
  fail(`tracked scratch/UI dumps at repo root:\n  ${rootJunk.join("\n  ")}`);
} else {
  ok("no tracked root screenshot/log scratch files");
}

if (failed) {
  console.error("\ncheck-oss: fix the FAIL items before a public push.");
  process.exit(1);
}
console.log("\ncheck-oss: clean enough for publish review.");
