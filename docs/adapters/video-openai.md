# OpenAI 系视频 — `video.openai-*`

覆盖：`video.openai-videos` · `video.openai-compatible` · `video.openai-generations`。

## Meta

| 项 | 值 |
|----|-----|
| Modality | `video` |
| Tier | `core`（`openai-generations` 为 extended） |
| 代码入口 | `api-formats.ts` · `api-base-url.ts` · `video.ts` |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-12 |

## 官方文档

| 说明 | URL |
|------|-----|
| OpenAI Videos | https://platform.openai.com/docs/api-reference/videos |
| 兼容 / generations | 以具体上游为准（常见：Grok 形 `/videos/generations`） |

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| 异步视频任务 | 视 format | ✓ | 多 format 分流 |
| 自定义 endpoint | compatible | ✓ | |
| 首帧 `input_reference` | ✓（官方 `/videos`） | ✓（仅 `video.openai-videos`） | 兼容中转**不发** |
| 首帧 / 多参考（兼容） | 视上游 | ✓ | 仅 `image:{url}` / `reference_images:[{url}]` |
| 首尾帧 | 官方无 | ✗（兼容） | UI 关闭；提交本地拒绝 |
| Agnes 帧字段 | — | ✗（兼容） | 不发 `width`/`height`/`num_frames`/`seconds` |

## 路径分流

| format | 简单根 | 提交 | 轮询 / 取片 |
|--------|--------|------|-------------|
| `video.openai-videos` | `…/v1` | `POST /videos` | `GET /videos/{id}`；成片常走 `/videos/{id}/content` + Bearer |
| `video.openai-compatible` | `…/v1`（占位 `https://api.example.com/v1`） | `POST /videos/generations` | `GET /videos/generations/{id}`；成片在 `output.url`，或 `GET /videos/generations/{id}/content` + Bearer |
| `video.openai-generations` | 同 generations | 同 compatible | extended 别名，避免旧配置断裂 |

## UI 参数与约束

- **官方 OpenAI（`openai-videos`）**：时长 / 画幅 + 参考「无 / 首帧」→ `input_reference`
- **兼容 / Generations（中转）**：秒级 `duration` + `resolution` + `aspect_ratio` + 参考「无 / 首帧 / 多参考」
  - 提交体字段（有图时）：`model` · `prompt` · `duration` · `aspect_ratio` · `resolution` · `image` 或 `reference_images`
  - **不发**：`input_reference` · `width` · `height` · `num_frames` · `frame_rate` · `seconds` · 其它别名喷发

## 已知坑

- 三 id 勿混用；新建配置时选与上游一致的 format。
- 官方 OpenAI Videos **没有**公网 MP4 URL：完成后须 `GET /videos/{id}/content`（相对路径）并带 Bearer；中转若返回 `/v1/videos/.../content`，必须拼到 base 的 origin 再下载，不能直接 `fetch` 相对路径。
- `video.openai-compatible` 面向中转：走 `/videos/generations`，**不要**与官方 `/videos` 混用。
- 严格中转（Go `unknown field`）只能发上游认识的字段；兼容路径按常见 Grok/generations 精简。
- 官方首帧图分辨率宜与请求 `size` 一致；本地上传走 data URI / 公网 URL。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-12 | 部分对齐 | 档案与代码对齐：兼容精简字段 + 无首尾帧；废止「多形状同喷」 |
| 2026-08-12 | 部分对齐 | ~~兼容开放首尾帧+多形状下发~~（已撤回，见上行） |
| 2026-08-12 | 部分对齐 | 兼容去掉 width/height/num_frames/seconds；参考图改 Grok 形 |
| 2026-08-12 | 部分对齐 | 官方补「无/首帧」；提交 `input_reference` |
| 2026-08-12 | 部分对齐 | compatible 默认改 `/videos/generations`；与官方 `/videos` 拆分 |
| 2026-08-10 | 档案初建 | |
| 2026-08-10 | 部分对齐 | 相对 `/videos/{id}/content` 拼绝对 URL + 鉴权下载 |
