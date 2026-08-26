import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../apps/web/package.json",
  ),
);
const Database = require("better-sqlite3");

const db = new Database("E:/test/modeldesk/data/modeldesk.db", {
  readonly: true,
});
const modelId = process.argv[2] || "e06bb7ed-eb8c-4d9d-b9cf-1bc422ca438a";
const rows = db
  .prepare(
    `SELECT id, status, response_json, error, created_at
     FROM eval_jobs
     WHERE model_id = ?
     ORDER BY created_at DESC
     LIMIT 5`,
  )
  .all(modelId);

for (const row of rows) {
  let parsed = null;
  try {
    parsed = row.response_json ? JSON.parse(row.response_json) : null;
  } catch {
    parsed = { raw: String(row.response_json).slice(0, 500) };
  }
  console.log(
    JSON.stringify(
      {
        id: row.id,
        status: row.status,
        error: row.error,
        created_at: row.created_at,
        httpLog: parsed?._httpLog ?? null,
        responseKeys: parsed ? Object.keys(parsed) : [],
      },
      null,
      2,
    ),
  );
}
