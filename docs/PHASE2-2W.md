# Phase 2 · 近两周执行清单（个人本机）

> 配套总览见同目录 [PHASE2.md](./PHASE2.md)。  
> **节奏：** 你说「做 Wx-Sy」→ 只做该步 → 汇报结果 → 等你点下一步。  
> **默认不 commit / 不 push**，除非你明确说提交或推送。

**窗口：** 约 2026-08-13 起两周 · 定位个人本机 · 不做导出/分享/迁 Radar。

---

## 总览

| 周 | 主题 | 步骤 ID |
|----|------|---------|
| 第 0 天 | 仓库对齐 | W0-S1 |
| 第 1 周 | 图兼容精简 + 档案 + 实测打磨 | W1-S1 … W1-S6 |
| 第 2 周 | 端口 / 数据目录 / 可选深链 | W2-S1 … W2-S5 |
| 收尾 | 回归与同步 | W2-S6 |

---

## W0 — 仓库对齐（半天内一次即可）

### W0-S1 · GitHub 与 Gitee 对齐
- **做什么：** `git fetch` / `git status`；若 `origin/main` 落后，`git push origin main`
- **验收：** 两边 `main` 指向同一 commit（或记录「GitHub 仍不可达」）
- **不做：** 改业务代码

---

## W1 — 稳调用（第 1 周）

### W1-S1 · 盘点图兼容参考图怎么发（只读）
- **做什么：** 读 `packages/adapters/src/images.ts` 的 `attachOpenAiReferenceFields` 及调用点；列当前同喷字段；对照你常用中转文档/报错
- **产出：** 一张表：字段名 / 是否保留 / 依据（中转习惯）
- **验收：** 表交给你确认后再改代码
- **不做：** 改提交体

### W1-S2 · 你拍板保留字段（阻塞）
- **做什么：** 根据 W1-S1 表勾选「只发哪些」
- **默认建议（可改）：** 单张优先 `image` 或 `image_urls` 二选一；多张只发一套；禁止再喷第三个别名
- **验收：** 书面确认（例如「按默认」或「只要 image_urls」）

### W1-S3 · 落地精简 + 本地错误提示
- **做什么：** 改 `attachOpenAiReferenceFields`（及必要分支）；严格未知字段场景下错误信息可读
- **验收：** 构造/手测：无参考、单张、多张各一；`pnpm` 相关包无类型炸
- **同步：** 改 `docs/adapters/image-openai-compatible.md`（若行为变）

### W1-S4 · 更新适配器索引
- **做什么：** `docs/adapters/README.md` 更新该 format 适配度/日期；校验记录一行
- **验收：** 索引与档案一致

### W1-S5 · 实测打磨清单（只读收集）
- **做什么：** 按你本周真实使用列痛点（视频/图/音频参数、报错、UI）
- **产出：** 最多 5 条「可改」项，按痛感排序
- **验收：** 你勾选本周要改的 1～3 条

### W1-S6 · 兑现 W1-S5 勾选项
- **做什么：** 只改已勾选项；一事一清
- **验收：** 你手测通过
- **可选：** 你说「提交」再拆 commit

### W1-S7 · 第 1 周回归（可选）
- **做什么：** `pnpm check:oss`；常用图/视频各跑一次
- **验收：** 门禁绿 + 主路径通

---

## W2 — 本机运维 + 可选深链（第 2 周）

### W2-S1 · 端口占用：现状盘点（只读）
- **做什么：** 查 Web/Radar 启动失败时现有日志；Windows 下谁占 3300/9800 如何查
- **产出：** 改哪里提示（web 启动脚本 / radar / 设置页）的建议

### W2-S2 · 端口占用：落地提示
- **做什么：** 启动失败时给出明确中文提示（端口 + 可能原因 + 一句话怎么办）
- **验收：** 故意占端口或模拟错误，提示可读

### W2-S3 · 数据目录文档
- **做什么：** README 和/或设置页：写清 `MODELDESK_DATA_DIR`、Web `modeldesk.db` vs Radar sqlite、默认 Windows 路径
- **验收：** 新人（或未来的你）不靠猜能找到库文件

### W2-S4 · 配置深链：是否做（拍板）
- **做什么：** 你确认「这周还常开 Radar 找接口吗？」
  - **否** → 跳过 W2-S5，标「暂缓」
  - **是** → 进入 W2-S5
- **验收：** 明确做 / 不做

### W2-S5 · 配置深链落地（仅 W2-S4=是）
- **子步：**
  1. 约定 query：`/models?baseUrl=&modelId=&name=`
  2. Radar 结果页按钮「在 ModelDesk 配置」
  3. Web `/models` 读 query 打开新建并预填（**不带 Key**）
- **验收：** 点按钮 → 表单已带 Base URL；保存仍需自填 Key

### W2-S6 · 两周收尾
- **做什么：**
  1. 对照本清单勾完成项
  2. `pnpm check:oss`
  3. 需要则 commit + 推 Gitee（GitHub 网络允许再推）
  4. 把未做项写回 [PHASE2.md](./PHASE2.md)「更远期」
- **验收：** 清单与仓库状态一致

---

## 明确不做（整两周）

- 配置导出 / 导入  
- 可分享报告、远程多人  
- Radar → Next / Fastify 退役  
- 大文件纯重构（除非挡 W1 精简）  
- ComfyUI / 多模型对比 / 提示词库  

---

## 当前指针

**两周清单已收尾；随后已退役 Radar（见 [PHASE2.md](./PHASE2.md)）。** 需要落库时你说「提交」/「推送」。

> 历史步骤中的 Radar / 深链 / `pnpm seed` 仅作当时记录，代码已删除。

---

## W2-S6 收尾核对（2026-08-13）

| 步骤 | 状态 |
|------|------|
| W0-S1 | 完成（GitHub/Gitee 曾对齐；现工作区未提交） |
| W1-S1…S4 | 完成（图兼容 → `image_urls` + 档案） |
| W1-S5…S6 | 完成（痛点清单；海螺/H3） |
| W1-S7 | `check:oss` 曾过；收尾再跑一次 **绿** |
| W2-S1…S3 | 完成（端口盘点 → 提示 → 数据目录文档） |
| W2-S4…S5 | **是** → 深链已落地 |
| W2-S6 | 本表 + `pnpm check:oss` OK + PHASE2「更远期」已更新 |
| commit / push | **未做**（清单默认不提交；等你说） |

**明确不做（整两周）仍成立：** 配置导出/导入、可分享报告、Radar 迁 Next、大文件纯重构、ComfyUI/多模型对比/提示词库。

---

## W2-S5 配置深链（2026-08-13）

| 位置 | 改动 |
|------|------|
| `web-deep-link.ts` | `resolveWebOrigin` / `buildModelsConfigUrl`；默认 `http://127.0.0.1:3300` |
| Radar 目录 | 平台行「配置」→ `/models?name&modelId&website&modality` |
| Radar 检测 | 结果区「在 ModelDesk 配置」→ 带 `baseUrl`+`modelId`（**从不带 Key**） |
| Radar 报告 `/r/:id` | 同按钮；报告仅有 host，用 `website=https://host` |
| Web `ModelsPageClient` | 读 query 开新建；支持 `modality`；消费后 `replaceState` 清 query |
| env | `MODELDESK_WEB_ORIGIN` / `MODELDESK_WEB_PORT` 注释 |

**验收：** Radar 点「配置」→ Web 表单已预填；保存仍需自填 Key。

---

## W2-S4 拍板（2026-08-13）

| 问题 | 决定 |
|------|------|
| 近期还会用 Radar 找/配新接口并加到 Web 吗？ | **是** → 做 W2-S5 深链 |

---

## W2-S3 数据目录文档（2026-08-13）

| 位置 | 改动 |
|------|------|
| README | 新增「数据目录（Web 库 vs Radar 库）」表 + 优先级 / MCP 同目录 |
| 环境变量表 | 补 `MODELDESK_RADAR_DB` |
| 设置页「存储」 | 短说明 + 指向 README |
| `.env.example` / `radar-api/.env.example` | 注释对齐 |
| PLAN.md | 数据行指向 README |

---

## W2-S2 落地（2026-08-13）

| 位置 | 改动 |
|------|------|
| `apps/radar-api/src/index.ts` | `EADDRINUSE` → 中文提示（内联，不依赖 scripts，便于桌面打包） |
| `scripts/port-hint.mjs` | 共用文案 |
| `scripts/run-with-port-hint.mjs` | 包装子进程，识别占用关键词 |
| 根 `package.json` `dev:web` / `dev:radar` | 经 port-hint 包装 |
| `desktop-sidecar.mjs` | `waitForHttp` 超时附带端口提示 |
| README | 补充自查与改端口说明 |

**验收：** 故意占 9800 后起 Radar，应看到 `[ModelDesk] Radar 端口已被占用…`；Web 占 3300 时 `pnpm dev:web` stderr 后应跟中文摘要。

---

## W2-S1 端口占用盘点（2026-08-13 · 只读）

### 现状

| 入口 | 默认端口 | 占用失败时现在怎样 |
|------|----------|-------------------|
| Web `next dev --port 3300` | 3300 | Next 原生英文报错（常见 `EADDRINUSE`），**无中文指引** |
| Radar `apps/radar-api/src/index.ts` → `app.listen` | 9800（`PORT`） | Fastify 抛错退出，**无捕获、无中文** |
| 根 `pnpm dev`（concurrently） | 上两者 | 只转发子进程 stderr，**不解释** |
| `scripts/desktop-sidecar.mjs` | 3300 / 9800 | `waitForHttp` 超时或子进程 exit；**未专门识别 EADDRINUSE** |
| 桌面 Tauri | 等 :3300 | 日志 `web did not become ready`；**不提端口占用** |
| 设置页 | — | 仅「磁盘占用」，**无端口说明** |
| README | — | 有一句 Hyper-V / 改 `PORT`，开发者可见、启动失败时不易看到 |

### Windows 自查（给人看的）

```text
netstat -ano | findstr ":3300"
netstat -ano | findstr ":9800"
```

再对 PID：`tasklist /FI "PID eq <pid>"`（或任务管理器）。

### W2-S2 建议改哪里（待落地）

| 优先级 | 位置 | 做什么 |
|--------|------|--------|
| P0 | `apps/radar-api/src/index.ts` | `listen` 包 try/catch；若 `EADDRINUSE` 打中文：端口、HOST、改 `PORT=`、上面 netstat 一句 |
| P0 | 根或 `scripts/` 小包装 | `pnpm dev` 路径：子进程 stderr 含 `EADDRINUSE` / `address already in use` 时再 echo 中文摘要（Web+Radar） |
| P1 | `desktop-sidecar.mjs` | wait 失败或子进程非 0 退出时，若端口探测失败则同样中文提示 |
| P2 | README / 设置「外部调用」旁 | 补「端口被占怎么办」短段（非启动瞬间） |

**不做（本步）：** 自动换端口（会搞乱桌面固定 3300 / 代理约定）。

---

## W1-S7 回归（2026-08-13）

| 检查 | 结果 |
|------|------|
| `pnpm check:oss` | 绿灯 |
| `@modeldesk/shared` / `adapters` `tsc --noEmit` | 通过 |
| 真实中转手测图/视频 | 未在本步代跑（需你本机 Key） |
---

## W1-S6（2026-08-13 · 按推荐）

### ★1 MiniMax 海螺 / H3 — 已收口

工作区半成品已核对并补强：

| 项 | 状态 |
|----|------|
| 默认模型 `MiniMax-H3`、action `/v2` | ✓ |
| 别名 → 请求体 `MiniMax-H3` | ✓ |
| 图生 `ratio=adaptive`；文生禁 adaptive | ✓ |
| 时长 4–15 / 分辨率 / 21:9 | ✓ |
| v2 错误信息（`error.message`） | ✓ 本步补强 |
| 档案 `video-minimax-hailuo.md` + README 日期 | ✓ |

### ★2 图兼容手测 — 需你本机

无参考 / 单张 / 多张各一次（`image.openai-compatible`）。缺 `image` 字段再告诉我。

---

## W1-S5 痛点候选（2026-08-13 · 最多 5 条）

按痛感排序；★ = 建议本周勾选。

| # | 痛点 | 依据 | 建议 |
|---|------|------|------|
| ★1 | **收口 MiniMax 海螺 / H3 未提交改动** | 工作区已有：`video-cn` 模型别名、默认 `/v2`、时长选项、档案；未提交易丢或半成品 | 补齐一致性 → 手测 H3 → 再提交 |
| ★2 | **手测图兼容精简** | W1-S3 已改只发 `image_urls`，需你真实中转验证 | 无图/单张/多张各一次；缺字段再补兼容 |
| 3 | 提交近两周规划文档 | `PHASE2.md` / `PHASE2-2W.md` 仅本地 | 与 ★1 可同批或另 commit |
| 4 | 端口占用提示 | 属 W2，个人本机有用但非本周主线 | 推到 W2-S1 |
| 5 | Radar→Web 深链 | 可选；不常用 Radar 可跳过 | 推到 W2-S4 |

**已消掉（不必再进 S6）：** Web verify 删除、视频兼容精简、参考图悬停/全屏、图 `image_urls` 精简（代码已做，待 ★2 验证）。

---

## W1-S1 产出（2026-08-13 · 只读盘点）

### 代码位置

| 路径 | 作用 |
|------|------|
| `attachOpenAiReferenceFields` | JSON：曾同喷 `image_urls` + `images` + `image` → **已改为仅 `image_urls`** |
| 调用 | `buildOpenAiCompatibleImageBody`；`image.openai-async` generations 回退 |
| `buildOpenAiEditsForm` | multipart 文件优先；无文件时仅 `image_urls[]` |

### 字段建议表

| 字段 | 拍板 | 落地 |
|------|------|------|
| `image_urls` | 保留（主） | ✓ |
| `image` / `images` | 不发 | ✓ |
| edits 文件 | 保留 | ✓ |
| edits `image_url` | 不发 | ✓（仅 `image_urls[]`） |

## W1-S2 拍板（2026-08-13）

**决定：按默认。**

## W1-S3 / W1-S4（2026-08-13）

- 代码：`packages/adapters/src/images.ts`
- 档案：`image-openai-compatible.md` · `image-openai-async.md` · `adapters/README.md` 索引
