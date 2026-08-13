# Phase 2 · 个人本机多业务中心

> 主仓：`modeldesk` · 包名 `@modeldesk/*`  
> **定位（已锁定）：** 个人本机多业务中心 —— 自己配 Key、自己实测、自己的业务脚本/程序来调。  
> **不是：** 团队中台、SaaS、卖 Token、默认可达公网。

---

## 0. 明确清除（永不作为目标）

下列方向**不进任务列表**，也不为它们预留架构：

| 清除项 | 说明 |
|--------|------|
| 登录 / 账号体系 | 无注册、无 OAuth、无会话用户 |
| 多租户 / 权限 / 计费 | 无组织、无配额、无账单 |
| 默认可达公网 | Web / Gateway 默认只绑 `127.0.0.1`；不为「局域网同事」做默认开放 |
| 配置同步 / 导出导入 | 不为远程同事复用配置；不做配置云同步 |
| 卖 Token / 自建中转商业化 | 不做代售额度；社区中转仅个人 opt-in |
| 恢复 Radar 找接口站 | 除非你明确再开 |

安全边界见 [SECURITY.md](../SECURITY.md)。

---

## 1. 产品分层（目标结构）

```text
L1 Desk（配测台）     模型 / Key / 五模态实测 / 产物 / 按需适配
        ↓ 同一 dataDir + run-core
L2 本机出口            CLI · MCP · Gateway（别名 + OpenAPI + Client）
        ↓
L3 你的业务            漫剧 / 口播 / 脚本 ……（仓库外；只消费 L2）
```

- **L1** 已基本可用 → 维护 + 有新中转再补适配。  
- **L2** = Gateway API（默认嵌在 Web `:3300/v1`；可选无头 `:3310`）。  
- **L3** 不进本仓大功能，只保证契约好用。

默认端口（精简为一条主路径）：

| 服务 | 端口 | 用途 |
|------|------|------|
| Web / 桌面 UI + Gateway API | `3300` | 人用配测 + 本机业务 `/v1`（默认） |
| 可选无头 Gateway | `3310` | 不开 UI 时的 `modeldesk-gateway` |

CLI / MCP 走进程，不另开业务端口。

---

## 2. 接下来全部任务列表

状态：`todo` / `doing` / `done` / `park`（有痛点再做）

### A. Gateway 多业务收口（当前主线）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| A1 | 全模态 HTTP：文 / 图 / 音 / 视 / 乐 | 各模态至少一次成功生成；产物可 `GET /v1/artifacts/:id` | done |
| A2 | 稳定别名 `llm-default` 等 | 文件 / env / `PUT /v1/aliases`；`GET /v1/models` 可见 | done |
| A3 | 冻结 OpenAPI + 官方 Client | `apps/gateway/openapi.yaml` + `@modeldesk/gateway-client` | done |
| A4 | 可选本机调用方 token | `MODELDESK_GATEWAY_TOKEN`（可多值）/ `TOKENS_FILE`；非多租户 | done |
| A5 | Gateway 冒烟与文档对齐 | `pnpm gateway:smoke`；README / external-access / PHASE2 / gateway-business 一致 | done |
| A6 | **真实业务验收**（必做收口） | `pnpm gateway:accept`：仅经别名跑通一文一图（迷你漫剧旁白→封面） | done |
| A7 | Web 设置页管理别名（可选） | 设置里查看/绑定别名，免手改 JSON | park |

> **Phase A 主线完成（A1–A6）**。A7 / C 为体验增强，不挡业务接入。业务短文：[gateway-business.md](./gateway-business.md)。

### B. Desk 维护（按需，不挡 A）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| B1 | 新中转 / 新模型 → 适配 + [docs/adapters](./adapters/README.md) 档案 | 实测页能跑；档案写清 verified | park |
| B2 | 手测回归（你常用链路） | 图 / 视主路径无回归 | park |
| B3 | 端口占用 / 数据目录文案 | 用户能自助排错（已有基础，有反馈再补） | done |
| B4 | 开源门禁 | 公开发布前 `pnpm check:oss` | done（保持） |

### C. 本机出口体验（A 收口后）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| C1 | 设置页「外部调用」补 Gateway 说明 | 别名、token、示例 curl / Client 一眼能抄 | done |
| C2 | 桌面安装路径下无头 Gateway 与 Web 同 dataDir 再验 | 可选；默认业务已走 `:3300` 同进程 | park |
| C3 | Client 使用短文（对接业务） | `docs/gateway-business.md` + Client README | done |
| C4 | MCP/CLI 与 Gateway 能力对照表 | 何时用 CLI / MCP / Gateway 写清，避免三套文档打架 | todo |

### D. 远期增强（个人本机，有痛点再开）

| ID | 任务 | 说明 | 状态 |
|----|------|------|------|
| D1 | 本机本地服务（ComfyUI / 本地 OpenAI 口） | 仍是个人本机，不公网 | park |
| D2 | 同提示词多模型对比 | Desk 实测增强 | park |
| D3 | 提示词库 / 测试包 | Desk 增强 | park |
| D4 | Agent 工具面加深（MCP/CLI） | 不替代 Gateway 契约 | park |
| D5 | 工程债：Zod 统一、适配器大文件拆分 | 纯工程，不改产品边界 | park |

### E. 工程卫生（穿插，非主线）

| ID | 任务 | 验收 | 状态 |
|----|------|------|------|
| E1 | 未提交 WIP 按主题拆 commit（你点名再做） | 历史可读；无密钥 | todo |
| E2 | CHANGELOG 记 Phase A Gateway | 对外可读 | todo |
| E3 | 公开发布前 check:oss + 敏感文件扫一眼 | 同 SECURITY | todo |

---

## 3. 建议执行顺序（从现在起）

```text
1) A5–A6  ✅ 已完成（smoke + gateway:accept 一文一图）
2) C1 / C2 / C4  设置页说明、桌面同 dataDir、出口对照
3) B1     仅当有新中转需要
4) A7 / D*  有痛点再开
5) E*     你准备提交/发版时做
```

**Phase A 成功标准（已达标）：**  
本机业务只经 Gateway + 稳定别名即可跑通文/图，不必直连厂商。

---

## 4. 近况备忘（2026-08-13）

- [PHASE2-2W.md](./PHASE2-2W.md) 已收尾；Radar 整套已移除。  
- 产品形态：**Web + 可选桌面 / CLI / MCP / Gateway**。  
- Desk 主线够用；工程主线转入上表 **A → C**。

### 已完成（从旧 backlog 划出）

品牌统一 · 退役 Radar · check:oss · 图 `image_urls` · 海螺/H3 收紧 · 端口中文提示 · 数据目录说明 · 配置导出明确不做 · Gateway 文本 MVP 与 Phase A 扩展初版。

---

## 5. 文档入口

| 文档 | 用途 |
|------|------|
| [apps/gateway/README.md](../apps/gateway/README.md) | Gateway 用法 |
| [docs/external-access.md](./external-access.md) | CLI / MCP / Gateway |
| [packages/gateway-client/README.md](../packages/gateway-client/README.md) | 官方 Client |
| [SECURITY.md](../SECURITY.md) | 本机安全边界 |
