# ModelDesk

**本地、单用户的多模态 API 工作台。**  
把自己的 Key 配好，在同一处跑通文 / 图 / 音 / 视 / 乐，结果留在本机——不用在各家控制台之间来回跳。

```text
配置模型 → 按模态实测 → 历史可回看 → 产物可下载
```

| 下载 | 地址 |
|------|------|
| **Windows 安装包**（推荐国内） | [Gitee · v0.1.0](https://gitee.com/gaoshuteacher/modeldesk/releases/tag/v0.1.0) |
| **Win / macOS 全量包** | [GitHub · v0.1.0](https://github.com/gao-shu/modeldesk/releases/tag/v0.1.0) |
| **Gitee 源码** | [gaoshuteacher/modeldesk](https://gitee.com/gaoshuteacher/modeldesk) |

> Gitee 单附件约有 **100MB** 上限，发行版目前放 **Windows `.exe`**；macOS `.dmg` 请从 GitHub 下载。

**新手：** [5 分钟跑通第一张图](./docs/quickstart-first-image.md)

## 界面预览

**图片实测** · 提示词预设「人物一致性」· 参数 / 结果 / 耗时 Token / 历史同屏

![图片实测 · 人物一致性](./docs/screenshots/hero-image-run.png)

**视频实测** · 智谱 CogVideoX · 时长 / 分辨率 / 帧率 / 有声 · 本机可播可下

![视频实测](./docs/screenshots/hero-video-run.png)

**生成结果** · 按模态筛选 · 视频缩略图 · 一键下载

![生成结果 · 视频](./docs/screenshots/gallery-video.png)

**模型配置** · Key 磁盘加密 · 分类型筛选 · 连通性测试一键摸底

![模型配置](./docs/screenshots/models.png)

↓ 下载安装包，本地配 Key 即可开测 → [Gitee（Win）](https://gitee.com/gaoshuteacher/modeldesk/releases/tag/v0.1.0) · [GitHub（全量）](https://github.com/gao-shu/modeldesk/releases/tag/v0.1.0)

> **定位说明**  
> - 本地单机工具，无需登录  
> - 默认只监听 `127.0.0.1`，**请勿**把端口暴露到公网（无鉴权 ≈ 别人能花你的 Key）  
> - 安全说明见 [SECURITY.md](./SECURITY.md)

---

## 核心能力

| 你得到什么 | 说明 |
|------------|------|
| **统一模型台账** | 一次登记协议、地址与 Key（磁盘加密），切换即可测，不必在各家控制台之间找配置 |
| **五模态实测** | 文 / 图 / 音 / 视 / 乐分台；提示词、参数、结果与历史同屏 |
| **可复盘的运行** | 记录耗时与成败；媒体留在本机；可选对象存储（仅当上游需要公网 URL） |
| **连通性摸底** | 对已配置接口做延迟 / 可用性抽检 |
| **桌面一站式** | Win / macOS 安装包，托盘常驻，自带引擎，不必先装 Node |
| **同一套对外入口** | CLI · MCP（Cursor 等）· OpenAI 兼容网关，与界面共用数据目录 |
| **适配器可对照** | 社区中转按需选用；厂商协议见 [docs/adapters](./docs/adapters/README.md) |

**一句话：** 配置一次，界面测、脚本跑、Agent 调，数据都在你自己的机器上。

**后续方向：** 接入本机已启动服务（如 ComfyUI / 本地 OpenAI 兼容口）· 同提示词多模型对比 · 提示词库与测试包 · Agent 工具面加深。

---

## 普通用户：装桌面端（推荐）

完整步骤见 **[5 分钟跑通第一张图](./docs/quickstart-first-image.md)**。摘要：

1. 打开 [GitHub](https://github.com/gao-shu/modeldesk/releases/tag/v0.1.0) 或 [Gitee](https://gitee.com/gaoshuteacher/modeldesk/releases/tag/v0.1.0) 发行版，下载对应系统安装包。  
2. 安装并启动 **ModelDesk**（首次解压引擎可能需 1～2 分钟）。  
3. 打开 **模型配置**，填入自己的 API Key 并保存。  
4. 进入 **图片** 实测跑一次；在 **生成结果 / 历史** 查看。  
5. 需要给 Cursor / 脚本用时：打开 **系统设置 → 外部调用**，一键复制 MCP 配置或修复命令行入口。

Windows 数据目录默认：`%LOCALAPPDATA%\ModelDesk\`（可在设置里改）。磁盘涨了可在 **系统设置 → 磁盘占用** 清理产物。

开发者从源码打包桌面端见下文「桌面端开发」。

---

## 开发者：本机跑 Web

**环境：** Node.js **22**（见 `.nvmrc` / `.node-version`；`engines` 为 `^22.0.0`），pnpm **9.15.0**（仓库已锁定）。

```bash
cd modeldesk
pnpm install
pnpm seed
cp .env.example apps/web/.env.local   # 按需设置 ENCRYPTION_SECRET 等
pnpm dev                              # Web + Radar，默认本机回环
```

| 服务 | 地址 |
|------|------|
| Web | http://127.0.0.1:3300 |
| Radar | http://127.0.0.1:9800 |
| 同源代理 | http://127.0.0.1:3300/proxy/radar/* |

Windows 上若端口被 Hyper-V 占用，可改 `PORT` / `MODELDESK_WEB_PORT`。

### 常用命令

| 命令 | 作用 |
|------|------|
| `pnpm dev` | 同时启 Web + Radar |
| `pnpm build` | 构建 Web |
| `pnpm seed` | 导入演示目录数据 |
| `pnpm smoke` | 冒烟检查 |
| `pnpm check:oss` | 开源发布前卫生扫描 |
| `pnpm install:bins` | 安装 `modeldesk` / `modeldesk-mcp` / `modeldesk-gateway`（可加 `-- --add-path`） |
| `pnpm desktop:dev` / `pnpm desktop:build` | 桌面开发 / 打安装包 |

---

## 对外调用（CLI / MCP / 网关）

界面配好模型后，脚本与 Agent **复用同一注册表与运行内核**，不是另一套产品。

| 入口 | 场景 | 命令 |
|------|------|------|
| 桌面 / Web | 主产品 | — |
| **CLI** | 脚本、CI | `modeldesk` |
| **MCP** | Cursor、Claude 等 | `modeldesk-mcp` |
| **Gateway** | OpenAI 兼容 HTTP（本机） | `modeldesk-gateway` → `http://127.0.0.1:3310` |

```bash
# 桌面安装后一般已写入 PATH；源码环境：
pnpm install:bins -- --add-path

modeldesk list
modeldesk run text --model <注册表ID> --prompt "你好"

modeldesk-gateway   # 仅本机 127.0.0.1
```

完整说明：[docs/external-access.md](./docs/external-access.md)。  
**务必让 Agent 的 `MODELDESK_DATA_DIR` 与界面「设置」里的数据目录一致。**

---

## Docker（本机）

```bash
cp .env.docker.example .env.docker   # 修改 ENCRYPTION_SECRET，勿提交
docker compose --env-file .env.docker up --build -d
```

默认宿主机：Web `http://127.0.0.1:3020`，Radar `http://127.0.0.1:9800`。  
容器内可绑 `0.0.0.0`，**不要**把端口映射到公网。

---

## 环境变量（摘要）

模板：[`.env.example`](./.env.example)、[`apps/radar-api/.env.example`](./apps/radar-api/.env.example)。

| 变量 | 用途 |
|------|------|
| `ENCRYPTION_SECRET` | 加密 SQLite 中的 Key / 对象存储凭据 |
| `MODELDESK_DATA_DIR` | 数据根目录（库、产物、加密密钥文件） |
| `RADAR_API_BASE` | Web → Radar 地址（默认 `http://127.0.0.1:9800`） |
| `HOST` | Radar 绑定（默认 `127.0.0.1`；Docker 用 `0.0.0.0`） |

---

## 仓库结构

```text
modeldesk/
├── apps/web/          # Next 界面与 run-core
├── apps/radar-api/    # 探测 / 目录服务
├── apps/desktop/      # Tauri 桌面壳
├── apps/cli · mcp · gateway
├── packages/          # 适配器、模型注册、共享类型等
├── docs/adapters/     # 厂商协议对照
├── docs/external-access.md
└── docs/RELEASE.md    # 桌面发版（GitHub → 可选同步 Gitee）
```

---

## 桌面端开发

需本机 Rust 与 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)（Windows 需 WebView2）。

```bash
pnpm install
pnpm desktop:dev
# 或
pnpm desktop:build
# → apps/desktop/src-tauri/target/release/bundle/nsis/ModelDesk_0.1.0_x64-setup.exe
```

请勿提交 `engine.zip` / `runtime/`（已 gitignore）。发版流程见 [docs/RELEASE.md](./docs/RELEASE.md)。

---

## 参与贡献

- [CONTRIBUTING.md](./CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) · [CHANGELOG.md](./CHANGELOG.md)  
- 公开推送前请执行：`pnpm check:oss`，并阅读 [SECURITY.md](./SECURITY.md)

---

## 许可证

MIT — 见 [LICENSE](./LICENSE)。

