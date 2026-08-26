/**
 * Assemble apps/desktop/runtime for Tauri bundle:
 *   runtime/
 *     sidecar.mjs
 *     desktop-data-dir.mjs
 *     web/          Next standalone
 *     agents/       CLI / MCP / Gateway bundles (+ install-bins.mjs)
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const RUNTIME = path.join(REPO, "apps", "desktop", "src-tauri", "runtime");
const isWin = process.platform === "win32";
const pnpm = isWin ? "pnpm.cmd" : "pnpm";

if (process.env.SKIP_DESKTOP_PREPARE === "1") {
  console.log("[build-runtime] SKIP_DESKTOP_PREPARE=1 — using existing runtime");
  process.exit(0);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    console.log(`[build-runtime] $ ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, {
      cwd: REPO,
      stdio: "inherit",
      shell: isWin,
      ...opts,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
  });
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  // Fully materialize trees (Windows junctions in Next standalone / pnpm).
  copyTreeMaterialized(src, dest);
}

/** Copy sharp platform packages into standalone node_modules roots. */
function ensureSharpRuntimeDeps(webRoot) {
  const nmRoots = [
    path.join(webRoot, "node_modules"),
    path.join(webRoot, "apps", "web", "node_modules"),
    path.join(webRoot, "apps", "web", ".next", "node_modules"),
  ];
  // Turbopack externalizes sharp as `.next/node_modules/sharp-<hash>`; Node then
  // resolves `@img/*` / `detect-libc` from THAT package folder, not the sibling.
  const nextNm = path.join(webRoot, "apps", "web", ".next", "node_modules");
  if (fs.existsSync(nextNm)) {
    for (const ent of fs.readdirSync(nextNm, { withFileTypes: true })) {
      if (ent.isDirectory() && ent.name.startsWith("sharp-")) {
        nmRoots.push(path.join(nextNm, ent.name, "node_modules"));
      }
    }
  }
  const pnpmRoot = path.join(REPO, "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmRoot)) return;

  let copied = 0;
  for (const ent of fs.readdirSync(pnpmRoot, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const name = ent.name;
    const isImg = name.startsWith("@img+");
    const isDetect = name.startsWith("detect-libc@");
    if (!isImg && !isDetect) continue;
    const pkgDir = path.join(
      pnpmRoot,
      name,
      "node_modules",
      isImg ? "@img" : "detect-libc",
    );
    if (!fs.existsSync(pkgDir)) continue;
    for (const root of nmRoots) {
      // Create target roots as needed (including .next/node_modules).
      fs.mkdirSync(root, { recursive: true });
      if (isImg) {
        const destImg = path.join(root, "@img");
        fs.mkdirSync(destImg, { recursive: true });
        for (const sub of fs.readdirSync(pkgDir)) {
          const from = path.join(pkgDir, sub);
          const to = path.join(destImg, sub);
          if (!fs.existsSync(from)) continue;
          copyTreeMaterialized(from, to);
          copied += 1;
        }
      } else {
        const to = path.join(root, "detect-libc");
        copyTreeMaterialized(pkgDir, to);
        copied += 1;
      }
    }
  }
  if (copied) {
    console.log(`[build-runtime] ensured sharp runtime deps (${copied} copies)`);
  }
}

/**
 * Turbopack externalizes cloud SDKs under `.next/node_modules/*`.
 * cos-nodejs-sdk-v5 → request → har-validator → ajv needs `fast-uri`, but
 * standalone tracing does not hoist it onto NODE_PATH → API routes 500 with
 * plain "Internal Server Error" (frontend: JSON parse on that text).
 */
function ensureObjectStorageTransitiveDeps(webRoot) {
  const pnpmRoot = path.join(REPO, "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmRoot)) return;

  const hoistedRoots = [
    path.join(webRoot, "node_modules", ".pnpm", "node_modules"),
    path.join(webRoot, "apps", "web", "node_modules", ".pnpm", "node_modules"),
  ];

  /** pnpm folder prefix → package folder name under node_modules */
  const transitive = [{ prefix: "fast-uri@", name: "fast-uri" }];

  let copied = 0;
  for (const { prefix, name } of transitive) {
    const folder = fs
      .readdirSync(pnpmRoot, { withFileTypes: true })
      .find((ent) => ent.isDirectory() && ent.name.startsWith(prefix));
    if (!folder) {
      console.warn(`[build-runtime] missing ${prefix} in repo pnpm store`);
      continue;
    }
    const src = path.join(pnpmRoot, folder.name, "node_modules", name);
    if (!fs.existsSync(src)) continue;
    for (const root of hoistedRoots) {
      fs.mkdirSync(root, { recursive: true });
      copyTreeMaterialized(src, path.join(root, name));
      copied += 1;
    }
  }
  if (copied) {
    console.log(
      `[build-runtime] ensured object-storage transitive deps (${copied} copies)`,
    );
  }
}

/** Fail the desktop build before engine.zip if COS / models API cannot load. */
function verifyObjectStorageRuntimeDeps(webRoot, nodeBin) {
  const fastUriPkg = path.join(
    webRoot,
    "node_modules",
    ".pnpm",
    "node_modules",
    "fast-uri",
    "package.json",
  );
  if (!fs.existsSync(fastUriPkg)) {
    throw new Error(
      `[build-runtime] engine guard: fast-uri missing (${fastUriPkg})`,
    );
  }

  const pnpmNested = path.join(webRoot, "node_modules", ".pnpm", "node_modules");
  const nodePathParts = [
    pnpmNested,
    path.join(webRoot, "node_modules"),
  ].filter((p) => fs.existsSync(p));

  const modelsRoute = path.join(
    webRoot,
    "apps",
    "web",
    ".next",
    "server",
    "app",
    "api",
    "models",
    "route.js",
  );
  if (!fs.existsSync(modelsRoute)) {
    throw new Error(`[build-runtime] engine guard: missing ${modelsRoute}`);
  }

  const probe = `
require('module').Module._initPaths();
require('cos-nodejs-sdk-v5');
require(${JSON.stringify(modelsRoute)});
console.log('object-storage runtime ok');
`;
  const res = spawnSync(nodeBin, ["-e", probe], {
    cwd: path.join(webRoot, "apps", "web"),
    env: {
      ...process.env,
      NODE_PATH: nodePathParts.join(path.delimiter),
    },
    encoding: "utf8",
  });
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || "").trim();
    throw new Error(
      `[build-runtime] engine guard failed (models route / COS): ${detail}`,
    );
  }
  console.log("[build-runtime] verified object-storage runtime deps");
}

function copyTreeMaterialized(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    let st;
    try {
      st = fs.lstatSync(s);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      let real;
      try {
        real = fs.realpathSync(s);
      } catch {
        continue;
      }
      const rst = fs.statSync(real);
      if (rst.isDirectory()) copyTreeMaterialized(real, d);
      else {
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(real, d);
      }
      continue;
    }
    if (ent.isDirectory()) {
      // Windows directory junction: readdir lists as directory; detect via readlink
      try {
        const target = fs.readlinkSync(s);
        const real = path.isAbsolute(target)
          ? target
          : path.resolve(path.dirname(s), target);
        if (fs.existsSync(real) && fs.statSync(real).isDirectory()) {
          copyTreeMaterialized(real, d);
          continue;
        }
      } catch {
        /* normal dir */
      }
      copyTreeMaterialized(s, d);
      continue;
    }
    fs.copyFileSync(s, d);
  }
}

async function main() {
  console.log("[build-runtime] repo", REPO);
  rmrf(RUNTIME);
  fs.mkdirSync(RUNTIME, { recursive: true });

  // 1) Build web (standalone)
  await run(pnpm, ["--filter", "@modeldesk/web", "build"]);

  // 2) Next standalone → runtime/web
  const standalone = path.join(REPO, "apps", "web", ".next", "standalone");
  if (!fs.existsSync(standalone)) {
    throw new Error(`missing ${standalone} — ensure next.config output:standalone`);
  }
  copyDir(standalone, path.join(RUNTIME, "web"));
  const staticSrc = path.join(REPO, "apps", "web", ".next", "static");
  const staticDest = path.join(RUNTIME, "web", "apps", "web", ".next", "static");
  if (fs.existsSync(staticSrc)) copyDir(staticSrc, staticDest);
  const publicSrc = path.join(REPO, "apps", "web", "public");
  const publicDest = path.join(RUNTIME, "web", "apps", "web", "public");
  if (fs.existsSync(publicSrc)) copyDir(publicSrc, publicDest);
  // Do not hoist-copy .pnpm/node_modules (doubles size). Sidecar sets NODE_PATH instead.
  // sharp needs @img/* (+ detect-libc); standalone tracing often omits them → gallery/thumbs 500.
  const webRoot = path.join(RUNTIME, "web");
  ensureSharpRuntimeDeps(webRoot);
  ensureObjectStorageTransitiveDeps(webRoot);

  // 3) Agent entries (CLI / MCP / Gateway) — bundled + local better-sqlite3
  const agentsDir = path.join(RUNTIME, "agents");
  rmrf(agentsDir);
  await run(process.execPath, [
    path.join(REPO, "scripts", "bundle-desktop-agents.mjs"),
    agentsDir,
  ]);
  for (const name of ["cli.mjs", "mcp.mjs", "gateway.mjs", "install-bins.mjs"]) {
    if (!fs.existsSync(path.join(agentsDir, name))) {
      throw new Error(`agent bundle missing ${name}`);
    }
  }
  const agentsPkg = {
    name: "modeldesk-agents-runtime",
    private: true,
    type: "module",
    dependencies: {
      "better-sqlite3":
        JSON.parse(
          fs.readFileSync(
            path.join(REPO, "apps", "cli", "package.json"),
            "utf8",
          ),
        ).dependencies["better-sqlite3"] || "^12.11.1",
    },
  };
  fs.writeFileSync(
    path.join(agentsDir, "package.json"),
    `${JSON.stringify(agentsPkg, null, 2)}\n`,
  );
  await run("npm", ["install", "--omit=dev"], { cwd: agentsDir });

  // 4) Sidecar scripts (+ env / port-hint helpers imported by sidecar)
  copyFile(
    path.join(REPO, "scripts", "desktop-sidecar.mjs"),
    path.join(RUNTIME, "sidecar.mjs"),
  );
  copyFile(
    path.join(REPO, "scripts", "desktop-data-dir.mjs"),
    path.join(RUNTIME, "desktop-data-dir.mjs"),
  );
  copyFile(
    path.join(REPO, "scripts", "env.mjs"),
    path.join(RUNTIME, "env.mjs"),
  );
  copyFile(
    path.join(REPO, "scripts", "port-hint.mjs"),
    path.join(RUNTIME, "port-hint.mjs"),
  );

  // 5) Portable Node so installers need not have Node on PATH
  await fetchPortableNode(path.join(RUNTIME, "node"));

  fs.writeFileSync(
    path.join(RUNTIME, "READY.txt"),
    `built ${new Date().toISOString()}\n`,
  );

  // NSIS cannot pack locked sqlite or junctions back into the monorepo
  sanitizeRuntime(RUNTIME);
  // Drop dev-only weight before zip (maps/types/docs/tests/dup natives). Keeps node.exe + runtime deps.
  const pruned = pruneRuntimeForPackaging(RUNTIME);
  console.log(
    `[build-runtime] pack prune: ${pruned.files} files, ${pruned.dirs} dirs (~${pruned.mb.toFixed(1)} MB raw)`,
  );

  const bundledNode = path.join(RUNTIME, "node", isWin ? "node.exe" : "node");
  verifyObjectStorageRuntimeDeps(
    path.join(RUNTIME, "web"),
    fs.existsSync(bundledNode) ? bundledNode : process.execPath,
  );

  // Single archive for NSIS (deep pnpm paths exceed Windows MAX_PATH in makensis)
  const resourcesDir = path.join(REPO, "apps", "desktop", "src-tauri", "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });
  const engineZip = path.join(resourcesDir, "engine.zip");
  rmrf(engineZip);
  // Windows bsdtar treats `D:` in absolute paths as a remote host (`host:path`).
  // Use paths relative to REPO so the archive args never contain a drive letter.
  const engineZipRel = path.relative(REPO, engineZip);
  const runtimeRel = path.relative(REPO, RUNTIME);
  await run("tar", ["-a", "-cf", engineZipRel, "-C", runtimeRel, "."]);
  if (!fs.existsSync(engineZip)) {
    throw new Error("failed to create engine.zip");
  }
  const zipMb = (fs.statSync(engineZip).size / (1024 * 1024)).toFixed(1);
  console.log(`[build-runtime] engine.zip ${zipMb} MB →`, engineZip);

  // Keep a tiny runtime/ so `tauri conf` / cargo check still resolve the folder if needed
  const keep = ["READY.txt"];
  for (const name of fs.readdirSync(RUNTIME)) {
    if (keep.includes(name)) continue;
    rmrf(path.join(RUNTIME, name));
  }
  fs.writeFileSync(
    path.join(RUNTIME, "PLACEHOLDER.txt"),
    "Engine ships as resources/engine.zip (extracted on first launch).\n",
  );

  console.log("[build-runtime] OK →", RUNTIME);
}

/** Drop DB files and local data dirs. */
function sanitizeRuntime(root) {
  // Explicit: drop local DBs only (do not delete npm package `data/` folders)
  for (const rel of [path.join("web", "data")]) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) {
      try {
        // Prefer rmdir for junctions (does not delete target)
        fs.rmdirSync(p);
        console.log("[build-runtime] rmdir", p);
      } catch {
        try {
          fs.rmSync(p, { recursive: true, force: true });
          console.log("[build-runtime] removed", p);
        } catch (err) {
          console.warn("[build-runtime] failed remove", p, err.message);
        }
      }
    }
  }

  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
        continue;
      }
      const lower = ent.name.toLowerCase();
      if (
        lower.endsWith(".sqlite") ||
        lower.endsWith(".sqlite-shm") ||
        lower.endsWith(".sqlite-wal") ||
        lower.endsWith(".db") ||
        lower.endsWith(".db-shm") ||
        lower.endsWith(".db-wal")
      ) {
        try {
          fs.unlinkSync(p);
          console.log("[build-runtime] pruned", p);
        } catch (err) {
          console.warn("[build-runtime] could not prune", p, err.message);
        }
      }
    }
  };

  walk(root);
}

const PRUNE_DIR_NAMES = new Set([
  "test",
  "tests",
  "__tests__",
  "__mocks__",
  "fixtures",
  "examples",
  "example",
  "docs",
  "doc",
]);

const PRUNE_BASENAMES = new Set([
  "readme",
  "readme.md",
  "readme.markdown",
  "changelog",
  "changelog.md",
  "history.md",
  "contributing.md",
  "security.md",
  "license",
  "license.md",
  "license.txt",
  "licence",
  "licence.md",
  "licence.txt",
]);

/**
 * Exclude pack-time dead weight. Never removes node.exe / runtime .node binaries.
 * @returns {{ files: number, dirs: number, mb: number }}
 */
function pruneRuntimeForPackaging(root) {
  let files = 0;
  let dirs = 0;
  let bytes = 0;

  const unlink = (p) => {
    try {
      const st = fs.lstatSync(p);
      if (st.isFile()) bytes += st.size;
      fs.rmSync(p, { recursive: true, force: true });
      if (st.isDirectory() || st.isSymbolicLink()) dirs += 1;
      else files += 1;
    } catch {
      /* ignore */
    }
  };

  // Portable Node: keep only the binary the sidecar launches.
  const nodeDir = path.join(root, "node");
  if (fs.existsSync(nodeDir)) {
    const keepName = isWin ? "node.exe" : "node";
    for (const name of fs.readdirSync(nodeDir)) {
      if (name === keepName) continue;
      unlink(path.join(nodeDir, name));
    }
  }

  // Next standalone: do not ship app source / lint / local env.
  const webApp = path.join(root, "web", "apps", "web");
  if (fs.existsSync(webApp)) {
    for (const name of [
      "src",
      "eslint.config.mjs",
      "eslint.config.js",
      ".gitignore",
      "tsconfig.tsbuildinfo",
      ".env",
      ".env.local",
      ".env.development",
      ".env.development.local",
    ]) {
      const p = path.join(webApp, name);
      if (fs.existsSync(p)) unlink(p);
    }
  }

  // Prefer a single sharp major; drop older pnpm store copies when a newer one exists.
  dedupeSharpPnpm(path.join(root, "web"), unlink);

  const shouldPruneDir = (name, relPosix) => {
    if (!PRUNE_DIR_NAMES.has(name)) return false;
    // Only under dependency trees — never strip app route folders named oddly.
    return (
      relPosix.includes("/node_modules/") ||
      relPosix.startsWith("node_modules/") ||
      relPosix.includes("/.pnpm/")
    );
  };

  const shouldPruneFile = (name, relPosix) => {
    const lower = name.toLowerCase();
    if (lower.endsWith(".map")) return true;
    if (lower.endsWith(".d.ts")) return true;
    if (lower.endsWith(".tsbuildinfo")) return true;
    if (PRUNE_BASENAMES.has(lower)) return true;
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) return true;
    // Native addon sources (runtime uses prebuilt .node / dll).
    if (
      (lower.endsWith(".c") ||
        lower.endsWith(".cc") ||
        lower.endsWith(".cpp") ||
        lower.endsWith(".h") ||
        lower.endsWith(".hpp")) &&
      (relPosix.includes("/node_modules/") || relPosix.includes("/.pnpm/"))
    ) {
      return true;
    }
    return false;
  };

  const walk = (dir, relPosix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      const childRel = relPosix ? `${relPosix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (shouldPruneDir(ent.name, childRel)) {
          unlink(p);
          continue;
        }
        walk(p, childRel);
        // Drop empty dirs left after file prunes
        try {
          if (fs.readdirSync(p).length === 0) unlink(p);
        } catch {
          /* ignore */
        }
        continue;
      }
      if (shouldPruneFile(ent.name, childRel)) unlink(p);
    }
  };

  walk(root, "");
  return { files, dirs, mb: bytes / (1024 * 1024) };
}

/** Remove older sharp@* pnpm folders when a newer sharp@* remains. */
function dedupeSharpPnpm(webRoot, unlink) {
  const pnpmDir = path.join(webRoot, "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmDir)) return;

  const sharpDirs = fs
    .readdirSync(pnpmDir)
    .filter((name) => name.startsWith("sharp@"))
    .map((name) => {
      const ver = name.slice("sharp@".length).split("_")[0];
      return { name, ver, abs: path.join(pnpmDir, name) };
    })
    .filter((x) => fs.existsSync(x.abs));

  if (sharpDirs.length <= 1) return;

  const rank = (ver) =>
    ver.split(".").map((n) => Number.parseInt(n, 10) || 0);
  sharpDirs.sort((a, b) => {
    const aa = rank(a.ver);
    const bb = rank(b.ver);
    for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
      const d = (bb[i] || 0) - (aa[i] || 0);
      if (d) return d;
    }
    return 0;
  });

  const keep = sharpDirs[0];
  for (const drop of sharpDirs.slice(1)) {
    console.log(
      `[build-runtime] drop duplicate sharp ${drop.ver} (keep ${keep.ver})`,
    );
    unlink(drop.abs);
  }
}

/**
 * Resolve Node dist platform id (nodejs.org naming).
 * Override with MODELDESK_NODE_PLATFORM=win-x64|darwin-arm64|darwin-x64
 * (needed when cross-compiling, e.g. arm mac → x64 app).
 */
function resolveNodePlatform() {
  const fromEnv = process.env.MODELDESK_NODE_PLATFORM?.trim();
  if (fromEnv) return fromEnv;
  if (process.platform === "win32") return "win-x64";
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "linux-arm64" : "linux-x64";
  }
  throw new Error(
    `unsupported platform for portable Node: ${process.platform}/${process.arch}`,
  );
}

async function fetchPortableNode(destDir) {
  // Must match the Node that compiled native addons (better-sqlite3 / sharp)
  // during this prepare — otherwise ERR_DLOPEN_FAILED (NODE_MODULE_VERSION).
  const version =
    process.env.MODELDESK_NODE_VERSION?.trim() ||
    process.version ||
    "v20.19.0";
  const platform = resolveNodePlatform();
  const isWindowsDist = platform.startsWith("win-");
  const archiveName = isWindowsDist
    ? `node-${version}-${platform}.zip`
    : `node-${version}-${platform}.tar.gz`;
  const url =
    process.env.MODELDESK_NODE_URL ||
    `https://nodejs.org/dist/${version}/${archiveName}`;
  const cacheDir = path.join(REPO, ".cache", "node-dist");
  fs.mkdirSync(cacheDir, { recursive: true });
  const archivePath = path.join(cacheDir, archiveName);

  if (!fs.existsSync(archivePath)) {
    console.log(`[build-runtime] downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download Node failed: ${res.status} ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(archivePath, buf);
  } else {
    console.log(`[build-runtime] using cached ${archivePath}`);
  }

  const extractDir = path.join(cacheDir, `extract-${version}-${platform}`);
  rmrf(extractDir);
  fs.mkdirSync(extractDir, { recursive: true });

  if (isWindowsDist) {
    if (isWin) {
      await run("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
      ]);
    } else {
      await run("unzip", ["-q", archivePath, "-d", extractDir]);
    }
  } else {
    await run("tar", ["-xzf", archivePath, "-C", extractDir]);
  }

  const extracted = path.join(extractDir, `node-${version}-${platform}`);
  rmrf(destDir);
  fs.mkdirSync(destDir, { recursive: true });

  if (isWindowsDist) {
    const exe = path.join(extracted, "node.exe");
    if (!fs.existsSync(exe)) {
      throw new Error(`node.exe missing after extract: ${extracted}`);
    }
    // Sidecar only needs the binary (npm/npx/corepack are not used at runtime).
    fs.copyFileSync(exe, path.join(destDir, "node.exe"));
  } else {
    const bin = path.join(extracted, "bin", "node");
    if (!fs.existsSync(bin)) {
      throw new Error(`bin/node missing after extract: ${extracted}`);
    }
    // Sidecar looks for engine/node/node (see desktop lib.rs)
    fs.copyFileSync(bin, path.join(destDir, "node"));
    fs.chmodSync(path.join(destDir, "node"), 0o755);
  }
  console.log("[build-runtime] portable Node", platform, "(binary only) →", destDir);
}

main().catch((err) => {
  console.error("[build-runtime] fatal:", err);
  process.exit(1);
});
