# 拾光 MiniMax H3 中转 — `video.minimax-h3-relay`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.minimax-h3-relay` |
| Modality | `video` |
| Tier | `relay`（社区中转；模型配置勾选「显示社区中转 / 扩展格式」后可见） |
| 建议 Base URL | `https://new.xlcsh.top/v1` |
| Action | `POST /videos` · 轮询 `GET /videos/{id}` · 成片 `GET /videos/{id}/content` |
| 典型 Model ID | `MiniMax-H3`（别名 `minimax_h3`） |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/video.ts`（`buildMinimaxH3RelaySubmit`） |
| 适配度 | **部分对齐** |
| 上次校验 | 2026-09-01 |

## 文档

| 说明 | URL |
|------|-----|
| New API 多参考图（拾光 / xlcsh） | 站内「MiniMax-H3 多参」接口说明 |
| 上游能力参考（官方 H3） | https://platform.minimaxi.com/docs/guides/video-generation |

> 路径形似 OpenAI Videos，**参数是 H3 定制**（`size` / `resolution` / `ratio` / `content[]`）。勿与 `video.openai-videos` 或官方 `video.minimax-hailuo` 混用。客户端只保留一个 `/v1`，不要配成 `/v1/v1/videos`。

## 流程对照

1. 文生：`POST /v1/videos` JSON → `{ id }`
2. 图生 / 多参：同路径 **JSON** + `content[]`（`role=first_frame|last_frame|reference_image|reference_audio`）
3. 本地图：**优先**经对象存储（七牛等）变成公网 HTTPS 写入 `image_url.url`；未开存储时才兜底 `POST /v1/files`（须带 `model` + `purpose=video_reference`）→ `file_id`
4. `GET /v1/videos/{id}` → `status`：`queued` / `in_progress` / `completed` / `failed` …
5. 成片：`GET /v1/videos/{id}/content`（Bearer，mp4 二进制）

## 能力矩阵

| 能力 | 中转文档 | 本项目 | 备注 |
|------|----------|--------|------|
| 文生视频 | ✓ | ✓ | `seconds` · `size` · `resolution` · `ratio` |
| 首帧 | ✓ `first_frame` | ✓ | JSON `content[]` |
| 首尾帧 | ✓ | ✓ | JSON `content[]` |
| 多参考图 | ✓ `role=reference_image` | ✓ | UI「多参」≤9；提示词用「图片1、图片2…」 |
| 参考音频 | ✓ `reference_audio` | ✓ | 仅多参模式下可选 ≤3 |
| 本地图 | ✓ | ✓ | 优先七牛公网 URL；兜底 `/files`（须 `model`） |
| 分辨率 | `768p` / `2K` | ✓ | 默认 `768p`（勿发 720p） |
| 时长 | 4–15 | ✓ | JSON 须为 **string**（如 `"15"`） |
| 画幅 | 含 `adaptive` | ✓ | |

## UI 参数与约束

- 时长 4–15；分辨率 `768p`/`2K`；画幅 → `size` + `ratio`
- 参考：无 / 首帧 / 首尾帧 / **多参**（与首尾帧互斥）
- 多参提示词应对齐 `content` 顺序（图片1=第一张 reference_image）
- **不要**选 `video.openai-videos` 或官方 `video.minimax-hailuo` 来打本中转

## 已知坑

- 缺 `resolution` 时上游常默认不兼容档位 → `unsupported H3 resolution`
- `seconds` 必须是字符串；传数字会 `invalid_json`（Go unmarshal）
- 远程图须为视频服务可访问的 HTTPS；推荐系统设置里开七牛后再本地上传
- New API `/files` 缺少 `model` 会 400「Model name not specified」（须 query + form 都带）
- 本地图若仍是 `data:`，说明对象存储未真正生效（未开/凭证未保存），勿依赖 `/files` 兜底
- 与 `video.seedance-relay` 同域名不同模型/字段，勿混用 format
- 官方 MiniMax 请继续用 `video.minimax-hailuo`

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-09-01 | 部分对齐 | 多参 `content[]`；优先七牛；`/files` 补 `?model=`；UI 预览改 `content[]` |
| 2026-08-30 | 部分对齐 | 初建：对齐中转 curl 字段，与 OpenAI 纯兼容路径隔离 |
