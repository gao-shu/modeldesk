# ModelDesk

**测试 · 对比 · 使用**

> 本机多模态 AI 配测台。
>
> 测试文本、图片、语音、视频模型；
> 使用相同输入并行对比 2～3 个模型；
> 查看模型输出、延迟、TTFT、Token 和错误信息；
> 选中模型后直接复制 curl / Python / Java 调用代码；
> 通过本地 OpenAI 兼容网关接入自己的应用。

[![Download Windows](https://img.shields.io/badge/Download-Windows%20installer-181717?style=for-the-badge&logo=github)](https://github.com/gao-shu/modeldesk/releases/download/v0.2.1/ModelDesk_0.2.1_x64-setup.exe)
[![All releases](https://img.shields.io/badge/Releases-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/gao-shu/modeldesk/releases)
[![Source (Gitee)](https://img.shields.io/badge/Source-Gitee-c71d23?style=for-the-badge)](https://gitee.com/gaoshuteacher/modeldesk)

[快速开始](#快速开始) · [演示](#演示) · [模型对比](#模型对比)

> **安装包说明：** GitHub 上当前可下载的 Windows 安装包为 **[v0.2.1](https://github.com/gao-shu/modeldesk/releases/tag/v0.2.1)**（`ModelDesk_0.2.1_x64-setup.exe`）。macOS 安装包（`.dmg`）见 **[v0.1.0](https://github.com/gao-shu/modeldesk/releases/tag/v0.1.0)**。仓库与 `package.json` 中的源码版本为 **0.2.3**（尚未发布带安装资源的 `v0.2.3` Release）。

```text
配置模型
   ↓
Playground 测试
   ↓
Compare 模型对比
   ↓
查看结果
   ↓
Use this model
   ↓
curl / Python / Java
   ↓
本地 OpenAI 兼容网关
   ↓
自己的应用
```

ModelDesk 的产品主线是：**配置 → 测试 → 对比 → 查看 → 使用 → 接入**。

更完整的产品边界说明见：[docs/PRODUCT.md](./docs/PRODUCT.md)。

---

## 为什么做 ModelDesk

厂商控制台适合测单个模型。若要对比多家接口，通常要在多个后台、多套 API Key、多种结果格式之间来回切换，最后还得手工改调用代码接到业务里。

ModelDesk 把这条链路收进一个本机配测台：

- 一处配置 Text / Image / Audio / Video 相关 API
- 同一输入并行对比 2～3 个模型
- 上游返回时展示延迟、TTFT、Token
- 点击 **Use this model**，复制 curl / Python / Java，打本地网关
- API Key 与生成产物默认留在本机

它不是聊天产品，而是面向开发者的本机工具：配置模型、测通、对比，再接到自己的程序。

---

## 可以做什么

### 1. 测试（Playground）

在 Playground 中分别测试 **Text / Image / Audio / Video**，一次测一个模型（例如 `/runs/text`、`/runs/image`）。

### 2. 对比（Compare）

在 Compare 页面（`/runs/compare`）用相同输入，并行运行 **同模态 2～3 个模型**。

### 3. 查看结果

分别查看各模型输出，以及延迟、TTFT、输入 / 输出 Token（上游提供时）和错误信息；某一路失败时，其他路结果仍会保留。

### 4. 使用当前模型（Use this model）

在 Compare 结果卡片上点击 **Use this model**，复制面向本地网关的 curl / Python / Java 示例。

### 5. 接入应用

将客户端指向：

```text
http://127.0.0.1:3300/v1
```

可用自己的应用、脚本、**Cursor / MCP** 或 CLI，共用已在 ModelDesk 中配置好的模型。

---

## 演示

> 当前演示视频正在准备中。
>
> 后续将展示完整流程：
>
> **测试 → 对比 → 查看 → 使用当前模型 → curl / Python / Java → 本地网关**
>
> 当前版本已经支持上述完整流程。

---

## 快速开始

### 1. 安装

从 Releases 下载 Windows 安装包。

当前可下载安装版本：**[v0.2.1](https://github.com/gao-shu/modeldesk/releases/tag/v0.2.1)**（[ModelDesk_0.2.1_x64-setup.exe](https://github.com/gao-shu/modeldesk/releases/download/v0.2.1/ModelDesk_0.2.1_x64-setup.exe)）。

也可浏览 [全部 GitHub Releases](https://github.com/gao-shu/modeldesk/releases)。macOS 构建见 [v0.1.0](https://github.com/gao-shu/modeldesk/releases/tag/v0.1.0)。源码镜像：[Gitee](https://gitee.com/gaoshuteacher/modeldesk)。

### 2. 配置模型

打开 ModelDesk，进入 **模型配置 / Models**，填写模型和 API Key 并保存。

首次启动可能需要 1～2 分钟解压引擎。

### 3. 测试模型

在 Playground（例如 **图片 / Image** 或 Text）中选择模型并发送请求，确认调用可用。

### 4. 对比模型

进入 Compare（`/runs/compare`）：

1. 至少配置两个同模态模型
2. 选择 Model A、Model B（可选第三个）
3. 输入同一内容
4. 点击 Run All
5. 查看各路结果（延迟 / TTFT / Token / 错误）

### 5. 使用模型

在结果卡片中点击 **Use this model**，复制 curl / Python / Java 调用代码。

### 6. 接入应用

通过本地 OpenAI 兼容网关调用模型：

```text
http://127.0.0.1:3300/v1
```

图文上手还可参考：[5 分钟跑通第一张图](./docs/quickstart-first-image.md) · [操作手册](./docs/user-guide.md)。

### 从源码运行

```bash
pnpm install
cp .env.example apps/web/.env.local
pnpm dev   # http://127.0.0.1:3300
```

需要 **Node.js 22** 与 **pnpm 9.15.0**（见根目录 `package.json`）。

网关嵌在 Web 界面同进程，访问 `:3300/v1` 无需另起服务。

---

## 模型对比

路径：**`/runs/compare`**（侧栏：**Compare**）。

使用相同输入，同时运行 2～3 个同模态模型。

可以并行查看不同模型的：

- 输出结果
- 延迟
- TTFT
- 输入 Token
- 输出 Token
- 错误信息

对比完成后，可以直接选择需要使用的模型。

本功能只做并排事实展示，**不做**自动评分、排名或 AI 裁判。

---

## 使用当前模型

对比完成后，可以直接选择当前模型。

ModelDesk 会生成可以直接复制使用的：

- curl
- Python
- Java

调用示例。

应用可以通过本地 OpenAI 兼容网关调用已经配置好的模型。

目标地址：

```text
http://127.0.0.1:3300/v1
```

系统设置 → **外部调用** 中也提供 Gateway 示例，以及编辑器用的 MCP JSON。

---

## 本地网关

ModelDesk 提供本地 **OpenAI 兼容网关**（OpenAI-compatible Gateway）。

应用不需要分别适配不同模型厂商的接口，而是可以通过统一的 `/v1` 接口访问 ModelDesk 中已经配置的模型。

默认地址：

```text
http://127.0.0.1:3300/v1
```

```text
ModelDesk
   ↓
Gateway (/v1)
   ↓
自己的应用 / 脚本 / Cursor / MCP
```

可选无头进程：`modeldesk-gateway`（端口 `:3310`，契约相同）。

别名与业务说明：[docs/gateway-business.md](./docs/gateway-business.md) · [docs/external-access.md](./docs/external-access.md)。

---

## MCP / Cursor

ModelDesk 提供 MCP 能力，可以让支持 MCP 的客户端访问 ModelDesk 的模型能力。

```text
Cursor → ModelDesk MCP → 已配置的模型 → 结果
```

1. 执行 `pnpm install:bins`（桌面端通常已写入 PATH）。
2. 打开系统设置 → **外部调用**，复制 MCP JSON 到 Cursor。
3. 可用工具包括：`list_models`、`run_text` / `run_image` / `run_video` / `run_audio`、`cancel_run`。

MCP 是模型调用入口，**不把 ModelDesk 定位成 Agent 编排平台**。

说明：[docs/external-access.md](./docs/external-access.md) · [apps/mcp/README.md](./apps/mcp/README.md)。

---

## 系统架构

```text
界面（Playground · Compare · Models）
        ↓
   packages/run-core
        ↓
 适配器（adapters）+ 模型注册表
        ↓
 加密后的 API Key / SQLite（数据目录）

界面 ──► OpenAI 兼容网关（:3300/v1）
              ↓
     自己的应用 / Cursor / MCP / CLI
```

| 入口 | 作用 |
|------|------|
| Desktop / Web | 本机界面：配置、Playground 测试、Compare 对比 |
| Gateway `/v1` | OpenAI 兼容 HTTP，供应用与脚本调用 |
| MCP / CLI | 从编辑器或命令行调用同一套模型配置 |
| adapters | 对接各厂商 / 协议 |
| 本地数据目录 | 存放配置、历史与产物；API / SSE 走本机服务 |

本仓库不另起一套云端架构；界面与 Gateway 默认同进程提供服务。

---

## 安全与本地优先

ModelDesk 默认优先使用本地数据。

- API Key **本地存储**，落盘加密
- 默认只监听 **localhost**，请勿把端口暴露到公网
- Key 由你自己提供；ModelDesk 不出售 Token
- 无登录、无多租户云同步
- 对象存储 / 社区中转仅在上游需要公网 URL 时按需开启

历史记录、产物与相关配置按当前项目的本地存储机制处理（Windows 数据目录：`%LOCALAPPDATA%\ModelDesk\`；开发默认：仓库 `data/`）。MCP / CLI / Gateway 须与界面共用同一 `MODELDESK_DATA_DIR`。

详见 [SECURITY.md](./SECURITY.md)。

---

## 文档

| 文档 | 说明 |
|------|------|
| [产品说明](./docs/PRODUCT.md) | 产品冻结（导航、Compare、Use、边界） |
| [快速开始（第一张图）](./docs/quickstart-first-image.md) | 约 5 分钟跑通图片实测 |
| [用户指南](./docs/user-guide.md) | 操作手册（含 Compare） |
| [Adapter 说明](./docs/adapters/README.md) | 厂商 / 协议对照 |
| [外部访问](./docs/external-access.md) | CLI · MCP · Gateway |
| [Gateway 业务说明](./docs/gateway-business.md) | 别名与业务验收 |
| [MCP 使用说明](./apps/mcp/README.md) | MCP 进程与工具 |
| [安全说明](./SECURITY.md) | 本机安全边界 |
| [发版说明](./docs/RELEASE.md) | 桌面发版命名 |
| [开源协议](./LICENSE) | MIT |

---

## 开发

```bash
pnpm install
pnpm dev                 # Web + Gateway，端口 :3300
pnpm smoke
pnpm check:oss           # 公开发布前检查
pnpm desktop:dev         # 需要 Rust / Tauri
pnpm install:bins -- --add-path
```

| 路径 | 说明 |
|------|------|
| `apps/web` | Next 界面，内嵌 `/v1` |
| `apps/desktop` | Tauri 桌面壳 |
| `apps/cli` · `mcp` · `gateway` | 共用同一套 run-core |
| `packages/*` | 共享核心、适配器、注册表 |

环境变量模板：[`.env.example`](./.env.example)，复制到 `apps/web/.env.local`。Docker（仅本机）：compose + [docs/deploy-baota.md](./docs/deploy-baota.md)。

---

## 参与贡献

[CONTRIBUTING.md](./CONTRIBUTING.md) · [CHANGELOG.md](./CHANGELOG.md) · [SECURITY.md](./SECURITY.md)

公开发布前请执行：`pnpm check:oss`。

## 开源协议

MIT — 见 [LICENSE](./LICENSE)。
