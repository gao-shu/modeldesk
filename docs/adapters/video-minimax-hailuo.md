# MiniMax 海螺 / H3 — `video.minimax-hailuo`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `video.minimax-hailuo` |
| Modality | `video` |
| Tier | `core` |
| 建议 Base URL | `https://api.minimaxi.com` |
| Action | H3：`POST /v2/video_generation`；Hailuo：`POST /v1/video_generation` |
| 典型 Model ID | `MiniMax-H3` · `MiniMax-Hailuo-2.3` · `MiniMax-Hailuo-02` |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/video-cn.ts` |
| 适配度 | **部分对齐** |
| 上次校验 | 2026-08-13 |

## 官方文档

| 说明 | URL |
|------|-----|
| 视频生成指南（H3） | https://platform.minimaxi.com/docs/guides/video-generation |
| 创建任务（v2 · H3） | https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create |
| 查询任务（v2） | https://platform.minimaxi.com/docs/api-reference/video-generation-v2-query |
| 查询任务列表（v2） | https://platform.minimaxi.com/docs/api-reference/video-generation-v2-list |
| 取消 / 删除任务（v2） | https://platform.minimaxi.com/docs/api-reference/video-generation-v2-delete |
| H3-Context-IR | https://platform.minimaxi.com/docs/api-reference/video-generation-v2-h3-context-ir |
| 视频再生成（768P→2K） | https://platform.minimaxi.com/docs/api-reference/video-generation-v2-regeneration |
| 文生视频（v1） | https://platform.minimaxi.com/docs/api-reference/video-generation-t2v |
| 图生视频（v1） | https://platform.minimaxi.com/docs/api-reference/video-generation-i2v |
| 查询任务（v1） | https://platform.minimaxi.com/docs/api-reference/video-generation-query |
| 视频下载 / 文件检索 | https://platform.minimaxi.com/docs/api-reference/video-generation-download |

## 鉴权

- `Authorization: Bearer <API_key>`（国内站 `api.minimaxi.com`；国际站多为 `api.minimax.io`）
- H3 需按量开通视频额度（见官方「按量购买 API」）

## 流程对照

### MiniMax-H3（v2，默认）

1. `POST /v2/video_generation`，`content[]` 多模态（**必含非空 `text`**）→ `task_id`
2. `GET /v2/query/video_generation/{task_id}` → `task.status`：`queued` / `running` / `succeeded` / `failed` / `cancelled`
3. 成功后直接 `task.content.url`（限时下载，过期可重新查询；**无需** `files/retrieve`）
4. 可选：`GET /v2/query/video_generation` 分页列表（近 7 天；可按 `filter.model=MiniMax-H3`、`filter.task_type`、`filter.status` 过滤）— 本项目生成链路不调用列表接口

### Hailuo / 旧型号（v1）

1. `POST /v1/video_generation` → `task_id`
2. `GET /v1/query/video_generation?task_id=` → `status`：`Preparing` / `Queueing` / `Processing` / `Success` / `Fail`
3. 成功后 `file_id` → `GET /v1/files/retrieve?file_id=` → `file.download_url`（约 1 小时有效）

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| H3 文生视频（t2va） | ✓ | ✓ | `ratio` 必填且非 `adaptive` |
| H3 首帧 / 尾帧 / 首尾帧（i2va） | ✓ | ✓ | `role=first_frame` / `last_frame`；`ratio=adaptive` |
| H3 多模态参考（图/音频 · r2va） | ✓ | ✓ | UI「多参」：`reference_image`≤9 + 可选 `reference_audio`≤3；与首尾帧互斥。参考视频未接 |
| H3-Context-IR / 再生成 | ✓ | — | 故意未做 |
| H3 任务列表 / 取消删除 | ✓ | — | 生成链路只轮询单任务 |
| Hailuo T2V / I2V（首帧） | ✓ | ✓ | `first_frame_image` |
| Hailuo 首尾帧 / 主体参考 | ✓ | — | 未接独立接口 |
| 分辨率 | ✓ | ✓ | H3：`768P`·`2K`；Hailuo：`768P`·`1080P`（及旧 `720P`） |
| 时长 | ✓ | ✓ | H3：4–15 整数秒；Hailuo：常用 6 / 10 |
| 运镜 `[指令]` | ✓（prompt） | ✓ | 用户写在 prompt 内 |

## UI 参数与约束

- 参考输入：无 / 首帧 / 首尾帧 / **多参**（≤9 张参考图；**参考音频仅多参**，不可与首尾帧混用）
- 新建配置默认模型：`MiniMax-H3`（走 v2）；选 Hailuo / T2V-01* 走 v1
- 别名归一：`mimaxh3` / `minimaxh3` / `hailuo-03` / `H3` 等在适配器内识别为 H3，请求体 `model` 固定为 `MiniMax-H3`
- H3 文生：`ratio` ∈ `21:9` · `16:9` · `4:3` · `1:1` · `3:4` · `9:16`
- H3 图生：宽高比由输入图决定；适配器传 `ratio=adaptive`
- Hailuo：`duration` 与 `resolution` 互相约束（1080P 仅 6s；10s 仅 768P）— 极端组合可能被官方拒
- 请求体总大小 ≤ 64 MB；大图请用公网 URL / `mm_file://`，勿塞超大 Base64

## 已知坑

- v1 成功返回的是 `file_id`，不是直接 URL
- v2 错误体为 OpenAI 风格（`error.type` / HTTP 4xx），与 v1 的 `base_resp` 不同
- 国际站域名可能是 `api.minimax.io`；本项目默认国内 `minimaxi.com`
- 列表接口只覆盖近 7 天任务；`task_type` 含 `generation` / `h3_context_ir` / `regeneration`

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-11 | 部分对齐 | 对照官方 OpenAPI：v1 轮询+files/retrieve；H3 v2 content/url；多模态参考未接 |
| 2026-08-13 | 部分对齐 | 对照 V2 create/query/list：默认模型改 H3；时长 4–15；画幅含 21:9；图生 `ratio=adaptive`；补充列表/IR/再生成文档链接（未实现） |
