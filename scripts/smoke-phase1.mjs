/**
 * Phase 1 connectivity smoke: radar health + web shell + proxy.
 * Prerequisites: `pnpm dev` (or both processes) already running.
 */
const web = (process.env.WEB_BASE || "http://127.0.0.1:3300").replace(/\/$/, "");
const radar = (process.env.API_BASE || process.env.RADAR_API_BASE || "http://127.0.0.1:9800").replace(
  /\/$/,
  "",
);

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

const radarHealth = await getJson(`${radar}/health`);
ok(
  "radar.health",
  radarHealth.res.ok && radarHealth.json?.status === "ok",
  `status=${radarHealth.res.status}`,
);

const webHome = await getJson(`${web}/`);
ok(
  "web.home",
  webHome.res.ok && webHome.text.includes("ModelDesk"),
  `status=${webHome.res.status}`,
);

const webDiscover = await getJson(`${web}/discover`);
ok("web.discover", webDiscover.res.ok, `status=${webDiscover.res.status}`);

const webVerify = await getJson(`${web}/verify`);
ok("web.verify", webVerify.res.ok, `status=${webVerify.res.status}`);

const proxy = await getJson(`${web}/proxy/radar/health`);
ok(
  "web.proxy.radar.health",
  proxy.res.ok && proxy.json?.status === "ok",
  `status=${proxy.res.status}`,
);

const providers = await getJson(`${web}/proxy/radar/api/v1/providers?pageSize=1`);
ok(
  "web.proxy.providers",
  providers.res.ok && (providers.json?.data?.items?.length ?? 0) >= 1,
  `total≈${providers.json?.data?.pagination?.total}`,
);

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error("Hint: run `pnpm seed` then `pnpm dev`, wait until both Ready/listening.");
  process.exit(1);
}
