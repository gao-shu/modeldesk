# Agnes Video — `video.agnes`

> 对照表：官方能力 ↔ ModelDesk 已接能力。勿大段复制厂商文档正文。
>
> **协议分流**：本档案仅 **V2.0**（`agnes-video-v2.0`，`width` / `num_frames`）。  
> **Agnes Video 2.5 Flash**（`mode` / `seconds` / `size:720P`）见 [`video-agnes-25-flash.md`](./video-agnes-25-flash.md)（`video.agnes-25-flash`）。

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.agnes` |
| Modality | `video` |
| Tier | `core`（列表顺序：即梦 → 智谱 → **Agnes** → Agnes 2.5 Flash → 万相 …） |
| 建议 Base URL | `https://apihub.agnes-ai.com/v1` |
| Action | `POST /videos`；轮询 `GET /agnesapi?video_id=` |
| 典型 Model ID | `agnes-video-v2.0` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/video.ts` |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-10 |

## 官方文档

| 说明 | URL |
|------|-----|
| 概览 / Base URL | https://agnes-ai.com/en/docs/overview |
| Video V2.0 | https://agnes-ai.com/en/docs/agnes-video-v20 |
| 模型目录 | https://github.com/AgnesAI-Labs/AgnesAI-Models/blob/main/MODEL_CATALOG.md |
| API 平台 | https://platform.agnes-ai.com/ |
| API Hub | https://apihub.agnes-ai.com |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| `POST /v1/videos` 创建任务 | ✓ | ✓ | 异步 |
| 轮询结果 | ✓ `GET /agnesapi?video_id=` | ✓ | 官方 host 用 `/agnesapi`；可带 `model_name` |
| 兼容轮询 | ✓ `GET /v1/videos/{task_id}` | ✓ | 中转 / 回退 |
| 文生视频 | ✓ | ✓ | |
| 图生视频 | ✓ `image` 公网 URL | ✓ | 官方 host 拒绝本地 base64（快速失败提示） |
| 关键帧 `extra_body.mode=keyframes` | ✓ | — | 未做 UI；后续可选 |
| 时长 | ✓ `num_frames`/`frame_rate`（8n+1） | ✓ | UI：约 3/5/10/18 秒 → 81/121/241/441 @24fps |
| 分辨率档 | ✓ 480p / 720p / 1080p（会归一化） | ✓ | UI 档位 + 画幅 → width/height |
| 画幅 | ✓ 16:9 · 9:16 · 1:1 · 4:3 · 3:4 | ✓ | |
| 结果 URL | ✓ `metadata.url` | ✓ | status：`queued` / `in_progress` / `completed` / `failed` |

## UI 参数与约束

- `duration_sec`：3 / 5 / 10 / 18（提示由 frames 换算）
- `resolution`：480p / 720p / 1080p
- `aspect_ratio`：16:9 · 9:16 · 1:1 · 4:3 · 3:4
- `reference_image`：图生视频；官方要求**公网可访问 URL**

创建任务要点（adapter）：

```json
{
  "model": "agnes-video-v2.0",
  "prompt": "…",
  "width": 1152,
  "height": 768,
  "num_frames": 121,
  "frame_rate": 24,
  "image": "https://…"
}
```

轮询（官方）：

```text
GET https://apihub.agnes-ai.com/agnesapi?video_id=<VIDEO_ID>&model_name=agnes-video-v2.0
Authorization: Bearer <KEY>
```

优先使用响应里的 `video_id`（而非仅 `task_id`）。

## 已知坑

- Base URL：`https://apihub.agnes-ai.com/v1`（轮询路径在 `/agnesapi`，与 `/v1` 同级）。
- 官方强调 status 查询限流；本项目轮询有退避，过密易 429。
- 图生视频：本地 data URI / base64 无法被 Agnes 云端拉取；需公网 URL 或 TOS。
- 服务端可能归一化 width/height；以返回的 `size` / `seconds` 为准。
- 勿将 Model ID 改成 `agnes-video-2.5-flash` 却仍选本 format：adapter 会按 **model id** 走 2.5 Flash 请求体，但 UI 仍是 V2.0 字段（帧数/分辨率档），易配错。新建请显选 `video.agnes-25-flash`。
- 本 format 仅适合 `agnes-video-v2.0`；完整版 `agnes-video-2.5`（非 Flash）未接。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-26 | — | 注明与 2.5 Flash 分流；新档案见 video-agnes-25-flash.md |
| 2026-08-10 | 部分对齐 | 升为 core、排在智谱下；对照 Video V2.0 文档补矩阵与轮询约定；关键帧未接 |
| 2026-08-10 | 档案初建 | |
