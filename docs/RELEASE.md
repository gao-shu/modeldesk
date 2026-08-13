# Desktop release（GitHub 构建 → Gitee 同步）

面向国内用户的推荐流程：**在 GitHub 打 Win / macOS 安装包**，再**自动同步到 Gitee Releases** 供下载。

## 一览

```text
git tag v0.1.0 → push
        ↓
GitHub Actions「Release desktop」
  ├─ Windows x64  → .exe (NSIS)   ← tag 推送默认只打 Windows
  ├─ macOS arm64  → .dmg          ← workflow_dispatch 选 macos / all
  └─ macOS x64    → .dmg
        ↓
GitHub Release（同 tag）
        ↓
（若配置了 Secrets）上传到 Gitee 同名 Release
```

手动重跑时可在 Actions → **Release desktop** → Run workflow 选择 `platforms`：`windows`（默认）/ `macos` / `all`。

## 第一次配置（约 10 分钟）

### 1. GitHub 仓库

1. 把本仓推到 GitHub（公开或私有均可；Actions 对公开仓免费额度通常够用）。
2. 确认已存在工作流文件：`.github/workflows/release-desktop.yml`。

### 2. Gitee 仓库（国内下载）

1. 在 Gitee 新建同名空仓库（或先镜像 GitHub）。
2. **至少推送一次包含该 tag 的代码**到 Gitee（Release 的 `target_commitish` 默认 `master`；若默认分支是 `main`，见下文变量）。
3. 打开 Gitee → 设置 → 私人令牌，新建令牌，勾选 **projects**（仓库）权限。
4. 回到 **GitHub** → Settings → Secrets and variables → Actions → New repository secret：

| Secret | 示例 | 说明 |
|--------|------|------|
| `GITEE_TOKEN` | `xxxxxxxx` | 上一步私人令牌 |
| `GITEE_OWNER` | `your-name` | Gitee 用户名或组织名 |
| `GITEE_REPO` | `modeldesk` | Gitee 仓库名 |

可选 **Variables**（不是 Secret）：

| Variable | 默认 | 说明 |
|----------|------|------|
| `GITEE_TARGET_COMMITISH` | `master` | Gitee 默认分支名；若是 `main` 请设为 `main` |

> 未配置 `GITEE_TOKEN` 时，工作流仍会完成 **GitHub Release**，Gitee 同步步骤会打印 skip 并成功退出——方便你先只跑通 GitHub。

### 3. 发一版

本地（或 GitHub 网页上创建 tag）：

```bash
# 建议与 package / tauri 版本一致
git tag v0.1.0
git push origin v0.1.0
```

也可在 GitHub → Actions → **Release desktop** → Run workflow，填入已有 tag（如 `v0.1.0`）。

约 30–90 分钟后检查：

- GitHub → Releases → `v0.1.0` 是否有 `.exe` / `.dmg`
- Gitee → 发行版 → 同名 tag 是否有相同附件

## 本地调试 Gitee 同步

构建产物放在某目录后：

```bash
export GITEE_TOKEN=...
export GITEE_OWNER=...
export GITEE_REPO=modeldesk
# export GITEE_TARGET_COMMITISH=main
node scripts/sync-gitee-release.mjs --tag v0.1.0 --dir ./path/to/installers
```

## 注意事项

1. **macOS 未签名**：未配置 Apple Developer 证书时，用户首次打开可能需「右键 → 打开」或在「隐私与安全性」里允许。签名/公证可以后再加。
2. **Gitee 附件大小**：免费仓对单个附件有上限（常见约百 MB 级）。若 `engine` 过大上传失败，可改传到国内对象存储，README 只放链接。
3. **双端源码**：建议 GitHub 为开发主仓；Gitee 作镜像 + 发行版下载页。可用 Gitee「从 GitHub 导入 / 镜像」减少手工 push。
4. **版本号**：tag 使用 `v` 前缀（`v0.1.0`）。预发布可用 `v0.2.0-beta.1`（工作流会标为 prerelease）。

## 相关文件

- `.github/workflows/release-desktop.yml` — 构建与发布
- `scripts/sync-gitee-release.mjs` — Gitee API 上传
- `scripts/build-desktop-runtime.mjs` — 打入安装包的 Web/Node 运行时
- `apps/desktop/src-tauri/tauri.conf.json` — `nsis` + `dmg`
