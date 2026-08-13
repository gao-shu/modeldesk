# ModelDesk · Phase 1（公开摘要 · 历史）

> Phase 1 已完成；后续 backlog 见 [docs/PHASE2.md](./docs/PHASE2.md)。  
> 本仓是**本机单用户** AI 接口台，安全边界见 [SECURITY.md](./SECURITY.md)。  
> **现状以 [README.md](./README.md) 为准**；本文仅作 Phase 1 决策摘要，目录/路由已按当前树修订。

---

## 1. 定位

**一句话：** 配置多模态 API → 连通性摸底 → 文 / 图 / 音 / 视 / 乐实测（本机）。

| 做 | 不做 |
|----|------|
| monorepo：Next Web + 可选桌面 / CLI / MCP / 网关 | 登录 / 多租户 / 计费 |
| 模型配置、冒烟测试、产物库、设置 | 公网多用户托管 |
| 本机 SQLite + 可选对象存储 | 自建卖 Token 中转 |

---

## 2. 技术选型

| 项 | 决定 |
|----|------|
| 包管理 | pnpm **9.15.0**（Node **22**） |
| Web | `apps/web`（Next） |
| 桌面 / Agent | `apps/desktop` · `apps/mcp` · `apps/cli` · `apps/gateway` |
| 共享包 | `packages/*`（`@modeldesk/*`） |
| 数据 | Web：`{dataDir}/modeldesk.db`（见 README「数据目录」） |

默认端口：Web **3300**（含 Gateway `/v1`）；可选无头网关 **3310**。Web 默认绑定 `127.0.0.1`。

---

## 3. 目录结构（现行）

```text
modeldesk/
├── apps/
│   ├── web/
│   ├── desktop/
│   ├── mcp/
│   ├── cli/
│   └── gateway/
├── packages/
│   ├── adapters/
│   ├── shared/
│   ├── model-registry/
│   ├── object-storage/
│   ├── tos-storage/
│   └── gateway-client/   # Phase A official Gateway client
├── data/          # 本地数据（gitignore）
├── docs/
│   └── adapters/  # 厂商协议对照档案
├── scripts/       # smoke / check:oss / 桌面打包等
├── PLAN.md
├── SECURITY.md
└── README.md
```

### Web 主要路由

| 路径 | 含义 |
|------|------|
| `/runs/text` 等 | 五模态实测（默认 `/runs/text`） |
| `/models` | 模型配置（卡片「测试」= 连通性冒烟） |
| `/gallery` | 生成结果 |
| `/settings` | 系统设置 |

---

## 4. 验收要点

- `pnpm install && pnpm dev`
- Web：`http://127.0.0.1:3300`
- 公开发布前：`pnpm check:oss`（见 SECURITY.md）
- 详见 README 与 `pnpm smoke`
