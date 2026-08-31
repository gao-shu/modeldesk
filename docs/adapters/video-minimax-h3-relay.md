# 拾光 MiniMax H3 中转 — `video.minimax-h3-relay`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.minimax-h3-relay` |
| Modality | `video` |
| Tier | `core`（社区中转；与官方 OpenAI / 海螺分离） |
| 建议 Base URL | `https://new.xlcsh.top/v1` |
| Action | `POST /videos` |
| 典型 Model ID | `minimax_h3` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/video.ts`（`buildMinimaxH3RelaySubmit`） |
| 适配度 | **部分对齐** |
| 上次校验 | 2026-08-30 |

## 文档

| 说明 | URL |
|------|-----|
| 中转站 OpenAI 形 Videos（拾光） | 以站点「文生视频 / 图生视频」文档为准 |
| 上游能力参考（官方 H3） | https://platform.minimaxi.com/docs/guides/video-generation |

> 路径形似 OpenAI Videos，**参数是 H3 定制**（`size` / `resolution` / `ratio`）。勿与 `video.openai-videos` 混用。

## 流程对照

1. 文生：`POST /v1/videos` JSON → `{ id }`
2. 图生：同路径 multipart（`input_reference` 或 `first_frame`/`last_frame`）
3. `GET /v1/videos/{id}` → `status`：`completed` / `failed` …
4. 成片：`GET /v1/videos/{id}/content`（Bearer）或轮询体里的公网 URL

## 能力矩阵

| 能力 | 中转文档 | 本项目 | 备注 |
|------|----------|--------|------|
| 文生视频 | ✓ | ✓ | `seconds` · `size` · `resolution` · `ratio` |
| 图生首帧 | ✓ `input_reference` | ✓ | multipart |
| 首尾帧 | ✓ `first_frame`/`last_frame` | ✓ | multipart |
| 多参考 / characters / callback | ✓ | — | 未接 |
| 分辨率 | `768p` / `2K` | ✓ | 默认 `768p`（勿发 720p） |
| 时长 | 4–15 | ✓ | JSON 须为 **string**（如 `"5"`） |
| 尺寸枚举 | 文档 WxH | ✓ | 由画幅推断 |

## UI 参数与约束

- 时长 4–15；分辨率 `768p`/`2K`；画幅 → `size` + `ratio`
- 参考：无 / 首帧 / 首尾帧
- **不要**选 `video.openai-videos` 或官方 `video.minimax-hailuo` 来打本中转

## 已知坑

- 缺 `resolution` 时上游常默认不兼容档位 → `unsupported H3 resolution`
- `seconds` 必须是字符串；传数字会 `invalid_json`（Go unmarshal）
- 与 `video.seedance-relay` 同域名不同模型/字段，勿混用 format
- 官方 MiniMax 请继续用 `video.minimax-hailuo`

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-30 | 部分对齐 | 初建：对齐中转 curl 字段，与 OpenAI 纯兼容路径隔离 |
