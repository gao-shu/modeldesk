# Agnes Video 2.5 Flash — `video.agnes-25-flash`

> 对照表：官方能力 ↔ ModelDesk 已接能力。勿大段复制厂商文档正文。
>
> **与 V2.0 分流**：帧数协议见 [`video-agnes.md`](./video-agnes.md)（`video.agnes` / `agnes-video-v2.0`）。勿混用同一 format。

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.agnes-25-flash` |
| Modality | `video` |
| Tier | `core`（列表紧挨 `video.agnes`） |
| 建议 Base URL | `https://apihub.agnes-ai.com/v1` |
| Action | `POST /videos`；轮询 `GET /agnesapi?video_id=` |
| 典型 Model ID | `agnes-video-2.5-flash` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/video.ts`（`buildAgnes25FlashSubmitBody`）· `run-params.ts` |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-26 |

## 官方文档

| 说明 | URL |
|------|-----|
| Agnes Video 2.5 Flash（中文） | https://agnes-ai.com/zh-Hans/docs/agnes-video-25-flash |
| Agnes Video 2.5（公共参数，Flash 继承） | https://agnes-ai.com/zh-Hans/docs/agnes-video-25 |
| 概览 / Base URL | https://agnes-ai.com/zh-Hans/docs/overview |
| API Hub | https://apihub.agnes-ai.com |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| `POST /v1/videos` 创建任务 | ✓ | ✓ | 异步 |
| 轮询 | ✓ `GET /agnesapi?video_id=&model_name=` | ✓ | 官方 host；**keyframe / reference 必须带** `model_name=agnes-video-2.5-flash` |
| 兼容轮询 | ✓ `GET /v1/videos/{id}` | ✓ | 中转 / 高级模式回退 |
| `mode=text` 文生 | ✓ | ✓ | 不得带媒体字段 |
| `mode=keyframe` 首尾帧 | ✓ `first_frame` / `last_frame` | ✓ | UI：`reference_image` / `reference_image_end`；至少一个 |
| `mode=reference` 多参考 | ✓ `images`≤5、`audios` | ✓ | UI：`reference_images` max 5 + `reference_audios` |
| `videos` 参考视频 | Flash **不支持** | — | adapter 不发送；官方 400 |
| 时长 `seconds` | ✓ 字符串 `"4"`–`"12"`，默认 `"5"` | ✓ | UI `duration_sec` → 字符串 |
| 分辨率 `size` | ✓ **仅** `"720P"` | ✓ | UI `resolution` → `size`；Flash 仅 720P 档 |
| 画幅 `aspect_ratio` | ✓ 含 21:9 | ✓ | 输出像素由画幅决定（见下表） |
| 结果 URL | ✓ `metadata.url` | ✓ | 与 V2.0 同轮询解析 |

### Flash 专属校验（创建前 400，不计费）

| 校验 | 规则 | 本项目 |
|------|------|--------|
| `size` | 必须 `"720P"` | 始终发送 |
| `images` | 最多 5 | UI `listMax: 5` + adapter 抛错 |
| `videos` | 不支持 | 不发送 |

## UI 参数与约束

- `mode`：`text` / `keyframe` / `reference`（必填；与参考输入须一致）
- `duration_sec`：4–12
- `resolution`：720P（Flash 固定；写入官方 `size`）
- `aspect_ratio`：21:9 · 16:9 · 4:3 · 1:1 · 3:4 · 9:16
- 参考输入（`image_pair`）：keyframe 用首/尾帧；reference 用多参图 + 可选音频；text 留空
- 媒体须**公网可访问 URL**（官方 host 拒绝本地 base64）

官方 720P 画幅像素（文档）：

| `aspect_ratio` | 像素 |
|----------------|------|
| 21:9 | 1680×720 |
| 16:9 | 1280×720 |
| 4:3 | 960×720 |
| 1:1 | 720×720 |
| 3:4 | 720×960 |
| 9:16 | 720×1280 |

创建任务要点（adapter）：

```json
{
  "model": "agnes-video-2.5-flash",
  "prompt": "…",
  "mode": "text",
  "seconds": "5",
  "size": "720P",
  "aspect_ratio": "16:9"
}
```

keyframe / reference 示例字段：`first_frame` · `last_frame` · `images` · `audios`（勿与 text 混用）。

轮询（官方，推荐）：

```text
GET https://apihub.agnes-ai.com/agnesapi?video_id=<VIDEO_ID>&model_name=agnes-video-2.5-flash
Authorization: Bearer <KEY>
```

优先使用响应里的 `video_id`。不带 `model_name` 的纯 `video_id` 查询仅适用于创建时 `mode: "text"`。

## 与 V2.0 差异（勿混用）

| 项 | V2.0（`video.agnes`） | 2.5 Flash（本格式） |
|----|----------------------|---------------------|
| Model ID | `agnes-video-v2.0` | `agnes-video-2.5-flash` |
| 时长 | `num_frames` + `frame_rate` | `seconds`（字符串） |
| 尺寸 | `width` / `height` | `size: "720P"` + `aspect_ratio` |
| 图生 | 单字段 `image` | `mode` + first/last 或 images |

把 2.5 Flash 配成 `video.agnes` 会发错误字段，易 400。

## 已知坑

- Base URL：`https://apihub.agnes-ai.com/v1`；轮询在 `/agnesapi`（与 `/v1` 同级）。
- Status 查询限流；本项目 Agnes 轮询间隔偏保守（见 `defaultVideoPollTiming`）。
- `/agnesapi` 完成态常返回顶层 `url`（未必有 `metadata.url`）；adapter 已兼容两者，否则会软轮询至超时。
- UI 仅「参考输入」一项：无→text、首/尾帧→keyframe、多参→reference；adapter 自动推断官方 `mode`（Gateway/API 仍可显式传 `mode`）。
- 完整版 `agnes-video-2.5`（非 Flash）本期未接；勿用本 format 硬塞付费 2.5 ID。
- 厂商 preset 默认仍为 V2.0（`packages/shared` `agnes-video`）；新建配置请显选本格式。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-26 | 部分对齐 | Step7 Gateway：`POST` 经嵌入式网关成功（job `6aae2210-…`，submit 体正确，成片 URL + artifact）；MCP `list_models` 可见该配置（`live_desk`）。打包 MCP 若仍报 `width is a forbidden field` 需重装/跟 Desk 同源 adapter |
| 2026-08-26 | 部分对齐 | 本机冒烟成功（text 5s）：submit 体正确；`/agnesapi` 成片取顶层 `url`（补 metadata.url 回退）；Desk 配置 `Agnes · agnes-video-2.5-flash` 已存在 |
| 2026-08-26 | 部分对齐 | 新增 format + adapter；对照 Flash 文档落地 text/keyframe/reference；`packages/adapters` 单测覆盖 body/校验/参数映射 |
