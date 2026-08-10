# 智谱 GLM — `text.zhipu`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `text.zhipu` |
| Modality | `text` |
| Tier | `core` |
| 建议 Base URL | `https://open.bigmodel.cn/api/paas/v4` |
| 典型 Model ID | `glm-5.2`, `glm-4.7-flash`（UI 标免费） |
| 代码入口 | `api-formats.ts` · `openai-compatible.ts` |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| 开放平台 | https://open.bigmodel.cn/dev/api |
| （待补 Chat 具体页） | |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| Chat Completions 兼容 | ✓ | ✓ | |
| 流式 | ✓ | ✓ | |
| temperature / max_tokens | ✓ | ✓ | |

## UI 参数与约束

- 同 `TEXT_CHAT_FIELDS`

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
