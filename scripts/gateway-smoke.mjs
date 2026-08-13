import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gwDir = path.join(root, "apps", "gateway");
const tsxCandidates = [
  path.join(gwDir, "node_modules", "tsx", "dist", "cli.mjs"),
  path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
];
const tsxCli = tsxCandidates.find((p) => fs.existsSync(p));
if (!tsxCli) {
  console.error("tsx not found");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [tsxCli, "--tsconfig", "tsconfig.json", "src/index.ts"],
  { cwd: gwDir, stdio: ["ignore", "ignore", "pipe"], env: process.env },
);

let err = "";
child.stderr.on("data", (d) => {
  err += d.toString("utf8");
});

await new Promise((r) => setTimeout(r, 2500));

try {
  const health = await fetch("http://127.0.0.1:3310/healthz").then((r) =>
    r.json(),
  );
  const models = await fetch("http://127.0.0.1:3310/v1/models").then((r) =>
    r.json(),
  );
  const aliases = await fetch("http://127.0.0.1:3310/v1/aliases").then((r) =>
    r.json(),
  );
  const openapi = await fetch("http://127.0.0.1:3310/openapi.yaml");
  const openapiText = await openapi.text();
  const hasAliases =
    Array.isArray(aliases?.aliases) && aliases.aliases.length >= 5;
  const registryRow = (models?.data ?? []).find(
    (m) => m && m.owned_by !== "modeldesk-alias" && typeof m.modality === "string",
  );
  const hasApiKeyField =
    !registryRow || typeof registryRow.hasApiKey === "boolean";
  const ok =
    health?.ok === true &&
    Array.isArray(models?.data) &&
    hasAliases &&
    hasApiKeyField &&
    openapi.ok &&
    openapiText.includes("ModelDesk Gateway");
  console.log(
    JSON.stringify(
      {
        ok,
        health,
        modelCount: models?.data?.length ?? 0,
        aliasCount: aliases?.aliases?.length ?? 0,
        hasApiKeyField,
        openapiBytes: openapiText.length,
        stderrPreview: err.slice(0, 300),
      },
      null,
      2,
    ),
  );
  child.kill();
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(
    JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stderrPreview: err.slice(0, 500),
    }),
  );
  child.kill();
  process.exit(1);
}
