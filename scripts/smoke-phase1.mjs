/**
 * Phase 1 connectivity smoke: web shell + models page.
 * Prerequisites: `pnpm dev` already running.
 */
const web = (process.env.WEB_BASE || "http://127.0.0.1:3300").replace(/\/$/, "");

const checks = [];
function ok(name, cond, detail = "") {
  checks.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

async function getJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { res, text, json };
}

const webHome = await getJson(`${web}/`);
ok(
  "web.home",
  webHome.res.ok && webHome.text.includes("ModelDesk"),
  `status=${webHome.res.status}`,
);

const webModels = await getJson(`${web}/models`);
ok("web.models", webModels.res.ok, `status=${webModels.res.status}`);

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Hint: run `pnpm dev`, wait until Next is Ready.");
  process.exit(1);
}
