import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { closeDb } from "./db";
import {
  ensureDataDirs,
  getControlDir,
  getDataDir,
  getDataLocationPath,
  getDefaultDataDir,
  normalizeAbsDir,
  readConfiguredDataDir,
  writeConfiguredDataDir,
} from "./paths";

const execFileAsync = promisify(execFile);

const MIGRATE_NAMES = [
  "modeldesk.db",
  "modeldesk.db-wal",
  "modeldesk.db-shm",
  ".encryption-secret",
  "artifacts",
] as const;

function samePath(a: string, b: string): boolean {
  const na = path.normalize(a);
  const nb = path.normalize(b);
  if (process.platform === "win32") {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return na === nb;
}

function isSubPath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return Boolean(rel) && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function copyEntry(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true, force: true });
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

export function migrateDataDir(fromDir: string, toDir: string): string[] {
  if (samePath(fromDir, toDir)) {
    throw new Error("新旧数据目录相同，无需迁移");
  }
  // Migration only copies named entries (db / artifacts / …), not the whole
  // tree — so parent→child like D:\softwork → D:\softwork\ModelDesk-data is OK.
  // Still forbid landing *inside* a source entry (e.g. …\artifacts\foo).
  for (const name of MIGRATE_NAMES) {
    const src = path.join(fromDir, name);
    if (!fs.existsSync(src)) continue;
    if (samePath(src, toDir) || isSubPath(src, toDir)) {
      throw new Error(
        `目标目录不能位于将要迁移的「${name}」之内（请换到与 db、artifacts 平级的文件夹）`,
      );
    }
  }
  fs.mkdirSync(toDir, { recursive: true });
  const copied: string[] = [];
  for (const name of MIGRATE_NAMES) {
    const src = path.join(fromDir, name);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(toDir, name);
    // Skip if destination nests back into the live source tree mid-copy.
    if (samePath(src, dest) || isSubPath(src, dest)) {
      throw new Error(`无法将「${name}」迁移到其自身路径内`);
    }
    copyEntry(src, dest);
    copied.push(name);
  }
  return copied;
}

export async function openDataDirInOs(targetDir?: string): Promise<string> {
  const dir = targetDir ? normalizeAbsDir(targetDir) : ensureDataDirs();
  fs.mkdirSync(dir, { recursive: true });

  if (process.platform === "win32") {
    // explorer returns non-zero even on success sometimes — ignore
    await execFileAsync("explorer.exe", [dir]).catch(() => undefined);
  } else if (process.platform === "darwin") {
    await execFileAsync("open", [dir]);
  } else {
    await execFileAsync("xdg-open", [dir]);
  }
  return dir;
}

export type ChangeDataDirResult = {
  dataDir: string;
  defaultDataDir: string;
  previousDataDir: string;
  migrated: string[];
  restartRecommended: boolean;
  message: string;
};

export function changeDataDir(options: {
  dataDir?: string | null;
  migrate?: boolean;
  resetToDefault?: boolean;
}): ChangeDataDirResult {
  const previousDataDir = getDataDir();
  const defaultDataDir = getDefaultDataDir();
  const migrate = Boolean(options.migrate);
  const resetToDefault = Boolean(options.resetToDefault);

  let nextDir: string;
  if (resetToDefault) {
    nextDir = defaultDataDir;
  } else if (options.dataDir != null && String(options.dataDir).trim()) {
    nextDir = normalizeAbsDir(String(options.dataDir));
  } else {
    throw new Error("请填写新的数据目录路径");
  }

  if (samePath(previousDataDir, nextDir)) {
    // Still persist default/custom consistently
    if (resetToDefault || samePath(nextDir, defaultDataDir)) {
      writeConfiguredDataDir(null);
    } else {
      writeConfiguredDataDir(nextDir);
    }
    process.env.MODELDESK_DATA_DIR = nextDir;
    ensureDataDirs();
    return {
      dataDir: nextDir,
      defaultDataDir,
      previousDataDir,
      migrated: [],
      restartRecommended: false,
      message: "数据目录未变化",
    };
  }

  // Close SQLite before copy / switch (WAL)
  closeDb();

  let migrated: string[] = [];
  if (migrate) {
    migrated = migrateDataDir(previousDataDir, nextDir);
  }

  fs.mkdirSync(nextDir, { recursive: true });

  if (resetToDefault || samePath(nextDir, defaultDataDir)) {
    writeConfiguredDataDir(null);
  } else {
    writeConfiguredDataDir(nextDir);
  }

  process.env.MODELDESK_DATA_DIR = nextDir;

  ensureDataDirs();

  const restartRecommended = true;
  const message = migrate
    ? migrated.length
      ? `已切换数据目录，并迁移：${migrated.join("、")}。建议重启应用。`
      : "已切换数据目录（源目录无可迁移文件）。建议重启应用。"
    : "已切换数据目录（未迁移旧数据）。建议重启应用。";

  return {
    dataDir: nextDir,
    defaultDataDir,
    previousDataDir,
    migrated,
    restartRecommended,
    message,
  };
}

export function getDataDirMeta() {
  const dataDir = getDataDir();
  const defaultDataDir = getDefaultDataDir();
  const configured = readConfiguredDataDir();
  return {
    dataDir,
    defaultDataDir,
    configuredDataDir: configured,
    controlDir: getControlDir(),
    locationFile: getDataLocationPath(),
    usingCustomDir: Boolean(configured && !samePath(configured, defaultDataDir)),
    isDefault: samePath(dataDir, defaultDataDir),
  };
}
