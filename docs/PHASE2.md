# Phase 2 backlog（公开）

> 主仓：`model-select` · Phase 1 已可用  
> 原则：保持本机单用户工具；不默认做成多租户 SaaS

---

## P0 — 运行时收敛

| 项 | 说明 | 验收 |
|----|------|------|
| Radar → Next Route Handlers | 将 `apps/radar-api` 的 `/api/v1/*` 与 probe 迁入 Web | 可选单进程开发 |
| 退役独立 Fastify 进程 | 文档与 `pnpm dev` 简化 | smoke 仍绿 |
| Zod 统一 | Radar / Web 收束到同一 major | 无双份类型冲突 |

## P1 — 产品体验

| 项 | 说明 | 验收 |
|----|------|------|
| 配置深链 | 从探测结果一键打开 `/models` 并预填 | 少一次手填 |
| Verify 进度 UI | 可选 SSE / 分步进度 | deep 模式可看步骤 |
| 可分享报告 | 白 UI 内打开 `/r/:id` | 与现有报告等价 |
| 配置导出 | 导出推荐 Base URL / 环境片段 JSON | 文档 + 下载即可 |

## P2 — 数据与运维

| 项 | 说明 | 验收 |
|----|------|------|
| DB 布局 | 统一 `data/` 文档；评估单库 vs 双库 | README 更新 |
| 包名收敛 | `@modeldesk/*` → `@model-select/*`（可分期） | 构建与文档一致 |
| 端口提示 | 检测本机不可用端口并提示 | Windows 新手少踩坑 |

## 明确不做（除非另开项目）

- 登录 / 多租户 / 计费  
- 自建中转卖 Token  
- 默认公网暴露 API  

---

## 建议顺序

```text
1) 可选：Radar API 迁 Next（单进程）
2) 深链 + Verify 体验
3) 配置导出
4) 包名 / 品牌收敛
```
