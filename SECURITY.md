# 安全策略 — ModelDesk

## 产品边界（固定）

ModelDesk 是**本地、单用户**工作台：

- 在你自己的机器上配置 **你的** API Key，发起多模态调用  
- **无需登录**；默认绑定 **`HOST=127.0.0.1`**（仅本机回环）  
- Docker 容器内需设 `HOST=0.0.0.0`，但仍**不要**把端口映射到公网  

另见 [README.md](./README.md) 顶部说明。

## 威胁模型

密钥经加密后存放在本机 SQLite，并用**你的**凭据请求上游模型 API。

本项目**不是**：多租户 SaaS、面向公网的网关、登录 / SSO 产品。

## 请勿暴露到公网

若在宿主机把 Web 绑到 `0.0.0.0`，或在无反向代理与访问控制的情况下把 Docker 端口映射出去：

- 能访问这些端口的人，可能列出模型，并用本机已存 Key 触发**付费**上游调用  
- **没有登录**：本机或网络可达 ≈ 等同于拥有完整应用权限  

**建议：** 只在 `http://127.0.0.1:3300` 打开界面。

## MCP / Agent 接入

启用 MCP 后，使用与 Web **同一套**加密密钥库与运行路径。

- 优先由本机可信宿主以 **stdio** 拉起（如本机 Cursor）  
- **不要**在未加访问控制的情况下，把 MCP 的 HTTP/SSE 端点挂到局域网或公网（默认不提供公网暴露方案）  
- 把 MCP 当作界面同等看待：**本地进程可达 ≈ 能花掉已配置的 API Key**  
- 日志与工具返回中**不得**回显完整 API Key  

MVP 工具面：`list_models` / `run_text|image|video|audio` / `cancel_run`。说明见 [docs/external-access.md](./docs/external-access.md)、[apps/mcp/README.md](./apps/mcp/README.md)。

请确保 MCP 进程与 Web 使用**相同的** `MODELDESK_DATA_DIR`（加密密钥优先用 `{dataDir}/.encryption-secret`），否则 Agent 看不到你在界面里配好的模型与 Key。

## CLI 与 Gateway API

`modeldesk` / `modeldesk-gateway`（经 `pnpm install:bins` 安装）是同一 run-core 与密钥库的薄封装。源码环境也可用 `pnpm cli` / `pnpm gateway`。

- **默认** Gateway API 挂在 Web/桌面 **`127.0.0.1:3300/v1`**（与 UI 同进程）  
- 可选无头 `modeldesk-gateway` 默认 **`127.0.0.1:3310`**。勿把绑定改成公网网卡，除非你接受「端口可达就能花 Key」  
- 可选 `MODELDESK_GATEWAY_TOKEN`（Bearer）仅为本地共享口令，**不是**多租户鉴权  
- 详见 [docs/external-access.md](./docs/external-access.md)、[apps/cli/README.md](./apps/cli/README.md)、[apps/gateway/README.md](./apps/gateway/README.md)

## 密钥与敏感文件

- 使用 `ENCRYPTION_SECRET`（或设置页生成），**切勿**提交 `.env`、`.encryption-secret`、`*.db`  
- 更换 `ENCRYPTION_SECRET` 后，库内既有密文将无法解密  
- 演示 seed 仅使用占位 / 假 Key；不要把生产 Key 写进 seed 脚本  
- 桌面构建产物（`engine.zip`、`apps/desktop/src-tauri/runtime/`、`resources/`）不要进 Git  

## 公开发布前

在仓库根目录执行：

```bash
pnpm check:oss
# 等同：node scripts/check-oss.mjs
```

并人工确认：

- [ ] 仅跟踪 `.env.example` / `.env.*.example`，没有真实 `.env` / `.env.local` / `.env.docker`  
- [ ] 树中无 `*.db` / `*.sqlite` / `.encryption-secret` / `engine.zip`  
- [ ] seed / smoke 夹具仅为假 Key（如 `sk-test…`、`change-me…`）  
- [ ] README 产品边界说明与本文一致  
- [ ] 根目录未提交界面截图垃圾文件（如 `models-*.png`、`runs-*.png`）  

## 漏洞反馈

若发现本仓库的安全问题，请通过**私密**安全公告或联系维护者报告——在修复可用前，请勿在公开 Issue 中披露利用细节。
