# Phase 2 backlog（公开）

> 主仓：`modeldesk` · 包名保持 `@modeldesk/*`  
> 原则：本机单用户工具；不默认做成多租户 SaaS  
> 品牌 / Web「性能测试」页清理等已在 Phase 1 后续完成，不再列入下方

---

## 已完成（从 backlog 划出）

| 项 | 说明 |
|----|------|
| 品牌文案 | 对外统一 ModelDesk；legacy `sessionStorage` key 仅兼容保留 |
| Web `/verify` | 已移除；探测留在 Radar `/verify` |
| 开源门禁 | `pnpm check:oss`；占位家目录路径不误报 |
| 包名 | **不**迁到 `@model-select/*` |

---

## P0 — 运行时收敛（可选）

| 项 | 说明 | 验收 |
|----|------|------|
| Radar → Next Route Handlers | 将 `apps/radar-api` 的 `/api/v1/*` 与 probe 迁入 Web | 可选单进程开发 |
| 退役独立 Fastify 进程 | 文档与 `pnpm dev` 简化 | smoke 仍绿 |
| Zod 统一 | Radar / Web 收束到同一 major | 无双份类型冲突 |

> 双进程（Web + Radar）仍是当前默认；迁入 Next **非**开源 blocker。

## P1 — 产品体验

| 项 | 说明 | 验收 |
|----|------|------|
| 配置深链 | 从 Radar 探测结果一键打开 Web `/models` 并预填 | 少一次手填 |
| Radar 检测进度 UI | 可选 SSE / 分步进度（探测站内） | deep 模式可看步骤 |
| 可分享报告 | 在 Web 内打开 Radar `/r/:id` 或嵌入 | 与现有报告等价 |
| 配置导出 | 导出推荐 Base URL / 环境片段 JSON | 文档 + 下载即可 |

## P2 — 数据与运维

| 项 | 说明 | 验收 |
|----|------|------|
| DB 布局 | 统一 `MODELDESK_DATA_DIR` 文档；评估单库 vs 双库 | README 更新 |
| 端口提示 | 检测本机不可用端口并提示 | Windows 新手少踩坑 |
| 适配器债 | 兼容中转默认精简字段；大文件按 format 拆分 | 严格 schema 中转少 400 |

## 明确不做（除非另开项目）

- 登录 / 多租户 / 计费  
- 自建中转卖 Token  
- 默认公网暴露 API  

---

## 建议顺序

```text
1) 配置深链 + Radar 检测体验（仍双进程亦可）
2) 配置导出
3) 可选：Radar API 迁 Next（单进程）
4) DB 布局文档 / 端口提示 / 适配器精简
```
