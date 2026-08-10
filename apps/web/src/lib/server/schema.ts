export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  modality TEXT NOT NULL,
  capability TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT,
  api_key_enc TEXT,
  model_id TEXT NOT NULL,
  defaults_json TEXT NOT NULL DEFAULT '{}',
  pricing_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_suites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capability TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1',
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_cases (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  category TEXT,
  prompt TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  expected_json TEXT NOT NULL DEFAULT '{}',
  scoring_json TEXT NOT NULL DEFAULT '{}',
  weight REAL NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (suite_id) REFERENCES eval_suites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  suite_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  config_snapshot TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_run_models (
  run_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  slot INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, model_id),
  FOREIGN KEY (run_id) REFERENCES eval_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES models(id)
);

CREATE TABLE IF NOT EXISTS eval_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  case_id TEXT,
  status TEXT NOT NULL,
  request_json TEXT NOT NULL DEFAULT '{}',
  response_json TEXT,
  error TEXT,
  latency_ms INTEGER,
  ttft_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY (run_id) REFERENCES eval_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES models(id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  type TEXT NOT NULL,
  uri TEXT NOT NULL,
  mime TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES eval_jobs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value REAL,
  source TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES eval_jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS votes (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_id TEXT,
  winner TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES eval_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS object_storage_configs (
  provider TEXT PRIMARY KEY,
  bucket TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  access_key_enc TEXT,
  secret_key_enc TEXT,
  public_base_url TEXT NOT NULL DEFAULT '',
  force_path_style INTEGER NOT NULL DEFAULT 0,
  skip_acl INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_suite ON eval_cases(suite_id);
CREATE INDEX IF NOT EXISTS idx_eval_jobs_run ON eval_jobs(run_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_job ON artifacts(job_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_models_modality ON models(modality);
`;
