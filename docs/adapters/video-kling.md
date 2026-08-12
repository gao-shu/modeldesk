# 可灵 Kling — `video.kling`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.kling` |
| Modality | `video` |
| Tier | `core` |
| 建议 Base URL | `https://api.klingai.com`（根路径 `/v1`） |
| Action | `POST /v1/videos/text2video` · `POST /v1/videos/image2video` |
| 典型 Model ID | `kling-v2-6` · `kling-v2-5-turbo` · `kling-v2-1-master` · `kling-v1-6` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/video-cn.ts` |
| 适配度 | **部分对齐** |
| 上次校验 | 2026-08-11 |

## 官方文档

| 说明 | URL |
|------|-----|
| 开放平台 / API | https://app.klingai.com/global/dev/document-api/apiReference/model/skillsMap |
| 社区整理参考 | JWT + text2video 流程与官方一致（iss/exp/nbf · HS256） |

## 鉴权

- 官方：AccessKey + SecretKey → **JWT**（`iss=AccessKey`，`exp`/`nbf`，HS256），请求头 `Authorization: Bearer <jwt>`。
- ModelDesk：API Key 填 `AccessKey:SecretKey`（或 `AccessKey\|SecretKey`），服务端签发；也可直接填已签发 JWT / 中转站 Bearer。

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 异步创建 + 轮询 | ✓ | ✓ | `GET …/text2video/{id}` / `image2video/{id}` |
| 文生视频 | ✓ | ✓ | |
| 图生视频 | ✓ | ✓ | 有参考图时走 image2video |
| mode std/pro | ✓ | ✓ | UI `mode` |
| duration 5/10 | ✓ | ✓ | |
| aspect_ratio | ✓ | ✓ | 16:9 / 9:16 / 1:1 |
| sound | ✓（新型号） | ✓ | `with_audio` → `sound=on` |
| camera_control / negative_prompt | ✓ | — | 未暴露 |

## UI 参数与约束

- `duration_sec`：仅 5 / 10（适配侧映射为官方字符串）
- `mode`：`std` / `pro`
- Key 占位提示：`AccessKey:SecretKey`

## 已知坑

- 勿把 SecretKey 单独当 Bearer；须 AK:SK 或完整 JWT。
- 轮询间隔宜偏保守，避免查询限流。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-11 | 部分对齐 | 初建：JWT、T2V/I2V、mode/duration/sound；运镜等未接 |
