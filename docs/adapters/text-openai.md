# OpenAI Chat — `text.openai`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `text.openai` |
| Modality | `text` |
| Tier | `core` |
| 建议 Base URL | `https://api.openai.com/v1` |
| 典型 Model ID | `gpt-4o`, `gpt-4o-mini`, `o3-mini`, … |
| 代码入口 | `api-formats.ts` · `openai-compatible.ts` |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| Chat Completions | https://platform.openai.com/docs/api-reference/chat |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| Chat Completions | ✓ | ✓ | |
| 流式 | ✓ | ✓ | |
| temperature / max_tokens | ✓ | ✓ | |

## UI 参数与约束

- `TEXT_CHAT_FIELDS`

## 已知坑

-

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
