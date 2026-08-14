#!/usr/bin/env node
/**
 * Rename Tauri installers to ToonFlow-style names, write sha256, and
 * build a GitHub/Gitee release body (download guide + install notes).
 *
 * Usage:
 *   node scripts/prepare-release-assets.mjs --tag v0.2.1 --dir ./release-assets
 *
 * Writes:
 *   - renamed assets in --dir
 *   - SHA256SUMS.txt
 *   - RELEASE_BODY.md
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const tag = arg("--tag", process.env.GITEE_TAG || process.env.TAG || "");
const dir = path.resolve(arg("--dir", "release-assets"));
const notesExtra = arg("--notes", "");

if (!tag || !/^v\d/.test(tag)) {
  console.error("Need --tag like v0.2.1");
  process.exit(1);
}
if (!existsSync(dir)) {
  console.error(`Missing dir: ${dir}`);
  process.exit(1);
}

const version = tag.replace(/^v/, "");

/** @typedef {{ key: string; file: string; os: string; arch: string; hint: string; emoji: string }} Slot */

/** @type {Slot[]} */
const SLOTS = [
  {
    key: "win-x64",
    file: `ModelDesk-${version}-win-x64-setup.exe`,
    os: "Windows",
    arch: "x64",
    hint: "推荐，适用于大多数 Windows 电脑",
    emoji: "🪟",
  },
  {
    key: "mac-arm64",
    file: `ModelDesk-${version}-mac-arm64.dmg`,
    os: "macOS",
    arch: "Apple Silicon",
    hint: "适用于 M1/M2/M3/M4 芯片的 Mac",
    emoji: "🍎",
  },
  {
    key: "mac-x64",
    file: `ModelDesk-${version}-mac-x64.dmg`,
    os: "macOS",
    arch: "Intel",
    hint: "适用于 Intel 芯片的 Mac",
    emoji: "🍎",
  },
];

/**
 * Map a Tauri/bundled filename to a slot key.
 * @param {string} name
 */
function classify(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".exe") || n.endsWith(".msi")) {
    if (n.includes("arm64") || n.includes("aarch64")) return null; // not built yet
    return "win-x64";
  }
  if (n.endsWith(".dmg")) {
    if (n.includes("aarch64") || n.includes("arm64")) return "mac-arm64";
    if (n.includes("x64") || n.includes("x86_64")) return "mac-x64";
    // single-arch CI sometimes omits arch in name — prefer arm64 on apple runners is handled by matrix rename below
    return null;
  }
  return null;
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function formatBytes(n) {
  const mb = n / (1024 * 1024);
  if (mb >= 10) return `${mb.toFixed(0)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

const entries = readdirSync(dir)
  .filter((n) => !n.startsWith(".") && n !== "RELEASE_BODY.md" && n !== "SHA256SUMS.txt")
  .map((n) => path.join(dir, n))
  .filter((p) => statSync(p).isFile());

/** @type {Map<string, string>} */
const byKey = new Map();

// Prefer explicit matrix artifact folder names if present (modeldesk-windows-x64/...)
for (const filePath of entries) {
  const base = path.basename(filePath);
  let key = classify(base);

  // Uploaded as flat merge-multiple; also accept already-renamed files
  for (const slot of SLOTS) {
    if (base === slot.file) key = slot.key;
  }

  if (!key) {
    console.warn(`Skip unrecognized asset: ${base}`);
    continue;
  }
  if (byKey.has(key)) {
    console.warn(`Duplicate for ${key}: keep ${path.basename(byKey.get(key))}, skip ${base}`);
    continue;
  }
  byKey.set(key, filePath);
}

const staging = path.join(dir, "_renamed");
mkdirSync(staging, { recursive: true });

/** @type {Array<Slot & { abs: string; hash: string; size: number }>} */
const published = [];

for (const slot of SLOTS) {
  const src = byKey.get(slot.key);
  if (!src) continue;
  const dest = path.join(staging, slot.file);
  copyFileSync(src, dest);
  const hash = sha256File(dest);
  const size = statSync(dest).size;
  published.push({ ...slot, abs: dest, hash, size });
  console.log(`Prepared ${slot.file} (${formatBytes(size)}) sha256=${hash}`);
}

if (published.length === 0) {
  console.error("No assets classified for release");
  process.exit(1);
}

// Replace dir contents with renamed files + checksums
for (const filePath of entries) {
  try {
    unlinkSync(filePath);
  } catch {
    /* ignore */
  }
}
for (const item of published) {
  renameSync(item.abs, path.join(dir, item.file));
}
rmSync(staging, { recursive: true, force: true });

const sums = published
  .map((p) => `${p.hash}  ${p.file}`)
  .join("\n");
writeFileSync(path.join(dir, "SHA256SUMS.txt"), `${sums}\n`, "utf8");

const tableRows = published
  .map(
    (p) =>
      `| ${p.emoji} ${p.os} | ${p.arch} | \`${p.file}\` | ${p.hint} |`,
  )
  .join("\n");

const hashBlock = published
  .map((p) => `- \`${p.file}\`  \n  sha256:\`${p.hash}\` · ${formatBytes(p.size)}`)
  .join("\n");

let changelogSnippet = "";
const changelogPath = path.resolve("CHANGELOG.md");
if (existsSync(changelogPath)) {
  const raw = readFileSync(changelogPath, "utf8");
  const marker = `## [${version}]`;
  const start = raw.indexOf(marker);
  if (start >= 0) {
    const afterHeading = raw.indexOf("\n", start);
    const from = afterHeading >= 0 ? afterHeading + 1 : start + marker.length;
    const next = raw.indexOf("\n## [", from);
    changelogSnippet = raw.slice(from, next >= 0 ? next : undefined).trim();
  }
}

let autoNotes = "";
if (notesExtra && existsSync(notesExtra)) {
  autoNotes = readFileSync(notesExtra, "utf8").trim();
}

const hasWin = published.some((p) => p.key === "win-x64");
const hasMac = published.some((p) => p.key.startsWith("mac-"));

const body = `## ${tag}

### 📦 下载指南

| 操作系统 | 架构 | 文件 | 说明 |
|----------|------|------|------|
${tableRows}

> 💡 **不确定选哪个？** Windows 用户通常选 \`win-x64-setup.exe\`；Mac 用户查看「关于本机」：M 系列芯片选 \`mac-arm64.dmg\`，Intel 选 \`mac-x64.dmg\`。

### 🚀 安装说明

${hasWin ? `- **Windows**：下载 \`.exe\`，双击运行安装向导。如遇 DLL 缺失，请安装 [VC++ 运行库](https://learn.microsoft.com/zh-cn/cpp/windows/latest-supported-vc-redist)。\n` : ""}${hasMac ? `- **macOS**：下载 \`.dmg\`，打开后将应用拖入「应用程序」。首次打开如遇安全提示，前往「系统设置 → 隐私与安全性」允许运行（当前构建默认未做 Apple 公证）。\n` : ""}- 数据默认在本机（Windows：\`%LOCALAPPDATA%\\\\ModelDesk\\\`）。密钥与生成结果不会上传到云端。
- 新手：[5 分钟跑通第一张图](https://github.com/gao-shu/modeldesk/blob/main/docs/quickstart-first-image.md) · [操作手册](https://github.com/gao-shu/modeldesk/blob/main/docs/user-guide.md)

### 🔐 校验（SHA-256）

${hashBlock}

完整清单见附件 \`SHA256SUMS.txt\`。

${changelogSnippet ? `### 📝 本版变更（CHANGELOG）\n\n${changelogSnippet}\n` : ""}${autoNotes ? `\n### What's Changed\n\n${autoNotes}\n` : ""}
---

国内镜像（若已同步）：[Gitee Releases](https://gitee.com/gaoshuteacher/modeldesk/releases)
`;

const bodyPath = path.resolve("RELEASE_BODY.md");
writeFileSync(bodyPath, body.trim() + "\n", "utf8");
// Also keep a copy beside assets for local inspection (not uploaded if filtered).
writeFileSync(path.join(dir, "RELEASE_BODY.md"), body.trim() + "\n", "utf8");
console.log(`Wrote ${bodyPath}`);
console.log(`Assets ready: ${published.map((p) => p.file).join(", ")}`);
