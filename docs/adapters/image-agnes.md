# Agnes Image — `image.agnes`

> 对照表：官方能力 ↔ ModelDesk 已接能力。勿大段复制厂商文档正文。

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.agnes` |
| Modality | `image` |
| Tier | `core`（列表顺序：即梦 → 智谱 → **Agnes** → …） |
| 建议 Base URL | `https://apihub.agnes-ai.com/v1` |
| Action | `POST /images/generations` |
| 典型 Model ID | `agnes-image-2.1-flash` · `agnes-image-2.0-flash` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/images.ts`（dialect `agnes`） |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-10 |

## 官方文档

| 说明 | URL |
|------|-----|
| 概览 / Base URL | https://agnes-ai.com/en/docs/overview |
| 图片 2.1 Flash | https://agnes-ai.com/doc/agnes-image-21-flash |
| 图片 2.0 Flash | https://agnes-ai.com/doc/agnes-image-20-flash |
| 模型目录 | https://github.com/AgnesAI-Labs/AgnesAI-Models/blob/main/MODEL_CATALOG.md |
| API 平台 | https://platform.agnes-ai.com/ |
| API Hub | https://apihub.agnes-ai.com |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| `POST /v1/images/generations` | ✓ | ✓ | Bearer Key |
| 文生图 | ✓ | ✓ | |
| 图生图 / 多图合成 | ✓ | ✓ | `extra_body.image`（URL 或 Data URI） |
| `size` 档位 1K–4K | ✓ | ✓ | UI：1K–4K；遗留 WxH 官方也接受 |
| `ratio` | ✓ | ✓ | 含 21:9 等 |
| `return_base64` | ✓ | ✓ | 本项目默认 `true`（便于落盘） |
| `extra_body.response_format` | ✓ | — | 未单独暴露；走 `return_base64` |

## UI 参数与约束

- `size`：`1K` / `2K` / `3K` / `4K`
- `ratio`：`1:1` · `16:9` · `9:16` · `4:3` · `3:4` · `3:2` · `2:3` · `21:9`
- `reference_images` → adapter `extra_body.image`

请求体要点（adapter）：

```json
{
  "model": "agnes-image-2.1-flash",
  "prompt": "…",
  "n": 1,
  "size": "1K",
  "ratio": "16:9",
  "return_base64": true,
  "extra_body": { "image": ["https://…"] }
}
```

## 已知坑

- Base URL 须带 `/v1`：`https://apihub.agnes-ai.com/v1`。
- 图生图可用公网 URL 或 Data URI；多图合成传数组。
- 与 OpenAI 兼容站不同：参考图在 **`extra_body.image`**，不是顶层 `image`。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-10 | 部分对齐 | core、排在智谱下；对照官方目录收敛为 2.1-flash / 2.0-flash；补 API Hub 链接 |
