/**
 * Create/update a Gitee Release for the same tag and upload local artifacts.
 *
 * Required env:
 *   GITEE_TOKEN   — personal access token (projects scope)
 *   GITEE_OWNER   — e.g. my-org or username
 *   GITEE_REPO    — e.g. modeldesk
 *
 * Usage:
 *   node scripts/sync-gitee-release.mjs --tag v0.1.0 --file path/a.exe --file path/b.dmg
 *   node scripts/sync-gitee-release.mjs --tag v0.1.0 --dir path/to/artifacts
 *
 * Optional:
 *   GITEE_TARGET_COMMITISH=master   (default: master)
 *   GITEE_RELEASE_BODY=...          (release notes; default short text)
 */
import fs from "node:fs";
import path from "node:path";

const API = "https://gitee.com/api/v5";

function parseArgs(argv) {
  const out = { tag: "", files: [], dirs: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tag") out.tag = argv[++i] || "";
    else if (a === "--file") out.files.push(argv[++i] || "");
    else if (a === "--dir") out.dirs.push(argv[++i] || "");
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

const SKIP_UPLOAD = new Set(["RELEASE_BODY.md", ".gitkeep"]);

function collectFiles(files, dirs) {
  const list = [];
  for (const f of files) {
    if (!f) continue;
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) {
      throw new Error(`not a file: ${f}`);
    }
    list.push(path.resolve(f));
  }
  for (const d of dirs) {
    if (!d || !fs.existsSync(d)) continue;
    for (const name of fs.readdirSync(d)) {
      if (SKIP_UPLOAD.has(name)) continue;
      const p = path.join(d, name);
      if (fs.statSync(p).isFile()) list.push(path.resolve(p));
    }
  }
  // de-dupe by basename (keep first)
  const seen = new Set();
  return list.filter((p) => {
    const base = path.basename(p);
    if (SKIP_UPLOAD.has(base)) return false;
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });
}

function resolveReleaseBody(dirs) {
  const envBody = process.env.GITEE_RELEASE_BODY?.trim();
  if (envBody) return envBody;
  const candidates = [
    path.resolve("RELEASE_BODY.md"),
    ...dirs.map((d) => path.join(path.resolve(d), "RELEASE_BODY.md")),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return fs.readFileSync(p, "utf8").trim();
    }
  }
  return "";
}

async function gitee(pathname, { method = "GET", form, search } = {}) {
  const token = process.env.GITEE_TOKEN?.trim();
  if (!token) throw new Error("GITEE_TOKEN is required");

  const url = new URL(`${API}${pathname}`);
  url.searchParams.set("access_token", token);
  if (search) {
    for (const [k, v] of Object.entries(search)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }

  const init = { method, headers: { Accept: "application/json" } };
  if (form) {
    init.body = form;
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg =
      data?.message ||
      data?.error ||
      text ||
      `${res.status} ${res.statusText}`;
    throw new Error(`Gitee API ${method} ${pathname}: ${msg}`);
  }
  return data;
}

async function findReleaseByTag(owner, repo, tag) {
  try {
    return await gitee(`/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  } catch (err) {
    if (String(err.message).includes("404") || String(err.message).includes("Not Found")) {
      return null;
    }
    // Gitee sometimes returns Chinese "没有" — treat unknown as miss only on 404-ish
    if (/404|不存在|没找到|not\s*found/i.test(String(err.message))) return null;
    throw err;
  }
}

async function createRelease(owner, repo, tag, body) {
  const form = new URLSearchParams();
  form.set("tag_name", tag);
  form.set("name", `ModelDesk ${tag}`);
  form.set("body", body);
  form.set(
    "target_commitish",
    process.env.GITEE_TARGET_COMMITISH?.trim() || "master",
  );
  form.set("prerelease", "false");
  // Gitee expects form-urlencoded for create release
  const token = process.env.GITEE_TOKEN.trim();
  const url = new URL(`${API}/repos/${owner}/${repo}/releases`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      `create release failed: ${data?.message || text || res.status}`,
    );
  }
  return data;
}

async function updateReleaseBody(owner, repo, releaseId, body) {
  const token = process.env.GITEE_TOKEN.trim();
  const form = new URLSearchParams();
  form.set("body", body);
  const url = new URL(`${API}/repos/${owner}/${repo}/releases/${releaseId}`);
  url.searchParams.set("access_token", token);
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn("[gitee] update release body failed:", text);
  }
}

async function listAttachFiles(owner, repo, releaseId) {
  try {
    const data = await gitee(
      `/repos/${owner}/${repo}/releases/${releaseId}/attach_files`,
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function deleteAttachFile(owner, repo, releaseId, attachId) {
  const token = process.env.GITEE_TOKEN.trim();
  const url = new URL(
    `${API}/repos/${owner}/${repo}/releases/${releaseId}/attach_files/${attachId}`,
  );
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { method: "DELETE", headers: { Accept: "application/json" } });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    console.warn(`[gitee] delete attach ${attachId} failed:`, text);
  }
}

async function uploadAttach(owner, repo, releaseId, filePath) {
  const token = process.env.GITEE_TOKEN.trim();
  const url = new URL(
    `${API}/repos/${owner}/${repo}/releases/${releaseId}/attach_files`,
  );
  url.searchParams.set("access_token", token);

  const blob = new Blob([fs.readFileSync(filePath)]);
  const form = new FormData();
  form.append("file", blob, path.basename(filePath));

  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `upload ${path.basename(filePath)} failed: ${data?.message || text || res.status}`,
    );
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/sync-gitee-release.mjs --tag v0.1.0 --dir ./artifacts`);
    process.exit(0);
  }

  if (!process.env.GITEE_TOKEN?.trim()) {
    console.log("[gitee] GITEE_TOKEN not set — skip sync (GitHub-only release is fine)");
    process.exit(0);
  }

  const owner = process.env.GITEE_OWNER?.trim();
  const repo = process.env.GITEE_REPO?.trim();
  if (!owner || !repo) {
    throw new Error("GITEE_OWNER and GITEE_REPO are required when GITEE_TOKEN is set");
  }

  const tag = args.tag || process.env.GITEE_TAG?.trim() || process.env.GITHUB_REF_NAME?.trim();
  if (!tag) throw new Error("--tag or GITEE_TAG / GITHUB_REF_NAME required");

  const files = collectFiles(args.files, args.dirs);
  if (!files.length) throw new Error("no artifact files to upload");

  const body =
    resolveReleaseBody(args.dirs) ||
    [
      `ModelDesk ${tag}`,
      "",
      "安装包由 GitHub Actions 构建后自动同步。",
      "",
      `- Windows: \`.exe\` (NSIS)`,
      `- macOS: \`.dmg\` (Apple Silicon / Intel 见文件名)`,
      "",
      "源码与 Issue 以 GitHub 为准；国内用户优先从此处下载安装包。",
    ].join("\n");

  console.log(`[gitee] ${owner}/${repo} tag=${tag} files=${files.length}`);

  let release = await findReleaseByTag(owner, repo, tag);
  if (!release) {
    console.log("[gitee] creating release…");
    release = await createRelease(owner, repo, tag, body);
  } else {
    console.log("[gitee] release exists id=", release.id);
    await updateReleaseBody(owner, repo, release.id, body);
  }

  const releaseId = release.id;
  const existing = await listAttachFiles(owner, repo, releaseId);
  const byName = new Map(
    existing.map((a) => [a.name || a.file_name || a.path, a]),
  );

  for (const file of files) {
    const base = path.basename(file);
    const prev = byName.get(base);
    if (prev?.id) {
      console.log(`[gitee] replace existing attach ${base} (#${prev.id})`);
      await deleteAttachFile(owner, repo, releaseId, prev.id);
    }
    const mb = (fs.statSync(file).size / (1024 * 1024)).toFixed(1);
    console.log(`[gitee] uploading ${base} (${mb} MB)…`);
    await uploadAttach(owner, repo, releaseId, file);
    console.log(`[gitee] uploaded ${base}`);
  }

  console.log(
    `[gitee] done → https://gitee.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tag)}`,
  );
}

main().catch((err) => {
  console.error("[gitee] fatal:", err.message || err);
  process.exit(1);
});
