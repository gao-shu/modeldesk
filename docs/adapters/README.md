# Adapter 对照档案

ModelDesk 用 **`api_format`** 描述「怎么调厂商接口」。本目录是开源友好的**适配契约索引**：官方文档链接、能力边界、我们接了什么、上次校验结论。

- **真相以代码为准**：`packages/shared/src/api-formats.ts`（UI 字段）+ `packages/adapters/`（请求）。
- **文档只记对我们有影响的约束**，不搬运整篇厂商手册。
- **不要写入**：API Key、内网地址、未公开合同价、客户私有 endpoint。

## 如何校验（维护 / Issue）

1. 打开下表对应档案中的官方 URL（或贡献者贴新链接）。
2. 对照「能力矩阵」与 `api-formats` / adapter。
3. 结论记为：**对齐** / **部分对齐** / **文档已变未跟**；更新「上次校验」与校验记录。
4. 需要改 UI 选项或请求体时，同一 PR 更新代码 + 本档案。

对 Agent / 协作者可直接说：`校验 MiniMax 语音`、`校验 Seedance`、`全量扫 adapters 过期项`。

## 新增 / 变更 format

见 [CONTRIBUTING.md](../../CONTRIBUTING.md)：新 `api_format` 须带本目录短档案；模板见 [`_TEMPLATE.md`](./_TEMPLATE.md)。

## 总览

适配度说明：

| 状态 | 含义 |
|------|------|
| 对齐 | 常用路径与文档一致，已知限制已反映到 UI |
| 部分对齐 | 主路径可用，有明确缺口（见档案） |
| 待校验 | 档案已建，尚未对照最新官方文档 |
| 内部 | Mock / 演示，不面向真实厂商 |

### Text

| format | 档案 | Tier | 适配度 | 上次校验 |
|--------|------|------|--------|----------|
| `text.deepseek` | [text-deepseek.md](./text-deepseek.md) | core | 待校验 | 2026-08-10 |
| `text.zhipu` | [text-zhipu.md](./text-zhipu.md) | core | 待校验 | 2026-08-10 |
| `text.openai` | [text-openai.md](./text-openai.md) | core | 待校验 | 2026-08-10 |
| `text.anthropic` | [text-anthropic.md](./text-anthropic.md) | core | 待校验 | 2026-08-10 |
| `text.gemini` | [text-gemini.md](./text-gemini.md) | core | 待校验 | 2026-08-10 |
| `text.openai-compatible` | [text-openai-compatible.md](./text-openai-compatible.md) | core | 待校验 | 2026-08-10 |

### Image

| format | 档案 | Tier | 适配度 | 上次校验 |
|--------|------|------|--------|----------|
| `image.volcengine-seedream` | [image-volcengine-seedream.md](./image-volcengine-seedream.md) | core | 待校验 | 2026-08-10 |
| `image.dashscope-wanxiang` | [image-dashscope-wanxiang.md](./image-dashscope-wanxiang.md) | core | 部分对齐 | 2026-08-11 |
| `image.zhipu-cogview` | [image-zhipu-cogview.md](./image-zhipu-cogview.md) | core | 部分对齐 | 2026-08-10 |
| `image.agnes` | [image-agnes.md](./image-agnes.md) | core | 部分对齐 | 2026-08-10 |
| `image.openai` | [image-openai.md](./image-openai.md) | core | 待校验 | 2026-08-10 |
| `image.google-nano-banana` | [image-google-nano-banana.md](./image-google-nano-banana.md) | core | 待校验 | 2026-08-10 |
| `image.openai-compatible` | [image-openai-compatible.md](./image-openai-compatible.md) | core | 部分对齐 | 2026-08-13 |
| `image.grok` | [image-grok.md](./image-grok.md) | core | 部分对齐 | 2026-08-10 |
| `image.openai-async` | [image-openai-async.md](./image-openai-async.md) | relay | 部分对齐 | 2026-08-13 |
| `image.mock` | — | extended | 内部 | — |

> 遗留别名：`image.shiguang` 在代码中解析为 `image.openai-async`（旧配置兼容；新建请直接选 async）。

### Video

| format | 档案 | Tier | 适配度 | 上次校验 |
|--------|------|------|--------|----------|
| `video.volcengine-seedance` | [video-volcengine-seedance.md](./video-volcengine-seedance.md) | core | 部分对齐 | 2026-08-10 |
| `video.kling` | [video-kling.md](./video-kling.md) | core | 部分对齐 | 2026-08-11 |
| `video.minimax-hailuo` | [video-minimax-hailuo.md](./video-minimax-hailuo.md) | core | 部分对齐 | 2026-08-13 |
| `video.vidu` | [video-vidu.md](./video-vidu.md) | core | 部分对齐 | 2026-08-11 |
| `video.zhipu-cogvideox` | [video-zhipu-cogvideox.md](./video-zhipu-cogvideox.md) | core | 待校验 | 2026-08-10 |
| `video.volcengine-wan` | [video-volcengine-wan.md](./video-volcengine-wan.md) | core | 待校验 | 2026-08-10 |
| `video.agnes` | [video-agnes.md](./video-agnes.md) | core | 部分对齐 | 2026-08-10 |
| `video.openai-videos` | [video-openai.md](./video-openai.md) | core | 部分对齐 | 2026-08-12 |
| `video.openai-compatible` | [video-openai.md](./video-openai.md) | core | 部分对齐 | 2026-08-12 |
| `video.openai-generations` | [video-openai.md](./video-openai.md) | extended | 部分对齐 | 2026-08-12 |
| `video.grok` | [video-grok.md](./video-grok.md) | core | 部分对齐 | 2026-08-11 |
| `video.mock` | — | extended | 内部 | — |

### Audio / Music

| format | 档案 | Tier | 适配度 | 上次校验 |
|--------|------|------|--------|----------|
| `audio.minimax` | [audio-minimax.md](./audio-minimax.md) | core | 待校验 | 2026-08-10 |
| `audio.qwen` | [audio-qwen.md](./audio-qwen.md) | core | 待校验 | 2026-08-10 |
| `audio.openai-compatible` | [audio-openai-compatible.md](./audio-openai-compatible.md) | core | 待校验 | 2026-08-10 |
| `music.minimax` | [music-minimax.md](./music-minimax.md) | core | 待校验 | 2026-08-10 |
| `music.openai-compatible` | [music-openai-compatible.md](./music-openai-compatible.md) | core | 待校验 | 2026-08-10 |

## 相关代码

| 区域 | 路径 |
|------|------|
| Format 注册 / UI 字段 | `packages/shared/src/api-formats.ts` |
| 运行参数兜底 | `packages/shared/src/run-params.ts` |
| 适配实现 | `packages/adapters/src/` |
| 中转 / OSS 策略 | `.cursor/rules/opensource-and-vendor-adapters.mdc` |
