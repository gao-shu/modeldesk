# OpenAI 兼容 Chat — `text.openai-compatible`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `text.openai-compatible` |
| Modality | `text` |
| Tier | `core` |
| 建议 Base URL | （用户自填） |
| 典型 Model ID | 自填 |
| 代码入口 | `api-formats.ts` · `openai-compatible.ts` |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| OpenAI Chat 参考 | https://platform.openai.com/docs/api-reference/chat |
| 各中转站 | 以用户配置的厂商文档为准 |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| `/v1/chat/completions` | ✓ | ✓ | |
| 流式 | 视上游 | ✓ | |

## UI 参数与约束

- `TEXT_CHAT_FIELDS`

## 已知坑

- 社区中转差异大；问题优先查上游，而非默认改核心 adapter。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
