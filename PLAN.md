# ModelDesk · Phase 1（公开摘要）

> Phase 1 已完成；后续见 [docs/PHASE2.md](./docs/PHASE2.md)  
> 本仓是**本机单用户** AI 接口台，安全边界见 [SECURITY.md](./SECURITY.md)。

---

## 1. 定位

**一句话：** 配置多模态 API → 验证 Key → 文/图/音/视频实测。

| 做 | 不做（Phase 1） |
|----|-----------------|
| monorepo：Next UI + Radar Fastify | 登录 / 多租户 / 计费 |
| 模型配置、单测、产物库、设置 | 公网多用户托管 |
| 本机 SQLite + 可选对象存储 | 自建卖 Token 中转 |

---

## 2. 技术选型

| 项 | 决定 |
|----|------|
| 包管理 | pnpm **9.15.0** |
| Web | `apps/web`（Next） |
| Radar API | `apps/radar-api`（Fastify，本机探测） |
| 共享包 | `packages/*`（`@modeldesk/*`） |
| 数据 | Radar `modeldesk-radar.sqlite` + Web `data/modeldesk.db` |

默认端口：Web **3300**，Radar **9800**。CORS 默认仅 localhost；Radar 默认 `HOST=127.0.0.1`。

---

## 3. 目录结构

```text
modeldesk/
├── apps/
│   ├── web/
│   └── radar-api/
├── packages/
│   ├── adapters/
│   ├── shared/
│   ├── model-registry/
│   ├── object-storage/
│   ├── tos-storage/
│   └── radar-types/
├── data/          # 本地数据（gitignore）
├── docs/
├── pnpm-workspace.yaml
├── package.json
├── PLAN.md
├── SECURITY.md
└── README.md
```

### 主要路由

| 路径 | 含义 |
|------|------|
| `/runs/single` | 跑一次（默认入口） |
| `/models` | 模型配置 |
| `/verify` | Key / Base URL 性能测试 |
| `/gallery` | 生成结果 |
| `/settings` | 设置 |

---

## 4. 验收要点

- `pnpm install && pnpm seed && pnpm dev`
- Web：`http://127.0.0.1:3300`
- Radar：`http://127.0.0.1:9800/health`
- 详见 README 手测清单与 `pnpm smoke` / `pnpm smoke:radar`
