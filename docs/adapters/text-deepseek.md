# DeepSeek — `text.deepseek`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `text.deepseek` |
| Modality | `text` |
| Tier | `core` |
| 建议 Base URL | `https://api.deepseek.com` |
| 典型 Model ID | `deepseek-v4-pro`, `deepseek-v4-flash` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/openai-compatible.ts` |
| 适配度 | 待校验 |
| 上次校验 | 2026-08-10（档案初建） |

## 官方文档

| 说明 | URL |
|------|-----|
| API 概览 | https://api-docs.deepseek.com/ |
| （待补更具体页面） | |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| Chat Completions | ✓ | ✓ | OpenAI 兼容路径 |
| 流式 | ✓ | ✓ | SSE |
| temperature / max_tokens | ✓ | ✓ | `TEXT_CHAT_FIELDS` |

## UI 参数与约束

- `temperature`（默认 0.2）、`max_tokens` 档位选择

## 已知坑

- Base URL 一般不带 `/v1` 后缀时由 `resolveChatCompletionsUrl` 补全；以实际联调为准。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 档案初建 | 待对照官方最新模型列表 |
