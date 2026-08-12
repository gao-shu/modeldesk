# Anthropic Claude — `text.anthropic`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `text.anthropic` |
| Modality | `text` |
| Tier | `core` |
| 建议 Base URL | （空，配置时填写） |
| 典型 Model ID | `claude-sonnet-4-20250514`, … |
| 代码入口 | `api-formats.ts` · chat 路径按 Anthropic `/v1/messages` 解析 |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| Messages API | https://docs.anthropic.com/en/api/messages |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| Messages | ✓ | ✓ | 非纯 OpenAI chat 形态 |
| 流式 | ✓ | 待确认 | 以代码路径为准 |
| temperature / max_tokens | ✓ | ✓ | UI 字段同 chat |

## UI 参数与约束

- `TEXT_CHAT_FIELDS`

## 已知坑

- Base URL / 路径与 OpenAI 不同，须用本 format，勿误标 `text.openai-compatible`。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | |
