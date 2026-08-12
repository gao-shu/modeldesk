# 通义万相 — `image.dashscope-wanxiang`

## Meta

| 项 | 值 |
|----|-----|
| `api_format` | `image.dashscope-wanxiang` |
| Modality | `image` |
| Tier | `core` |
| 建议 Base URL | `https://dashscope.aliyuncs.com/api/v1` |
| 典型 Model ID | `wan2.6-t2i`、`wan2.7-image`、`wan2.7-image-pro`、wan2.5/2.2/wanx2.1… |
| 代码入口 | `api-formats.ts` · `packages/adapters/src/images.ts`（`generateDashScopeWanxiangImage`） |
| 适配度 | 部分对齐 |
| 上次校验 | 2026-08-11 |

## 官方文档

| 说明 | URL |
|------|-----|
| 万相 2.1/2.x 文生图 V2 | https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference |
| 万相图像生成与编辑 2.7 | https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference |

## OpenAI 兼容？

**否。** 官方走 DashScope：`Authorization: Bearer` + `/api/v1/services/aigc/…`，不是 `/v1/images/generations`。  
第三方聚合网关若把万相包装成 OpenAI 形态，请改用 `image.openai-compatible`，不要选本 format。

## 能力矩阵

| 能力 | 文档 | 本项目 | 备注 |
|------|------|--------|------|
| wan2.6+ 同步 multimodal | ✓ | ✓ | `/services/aigc/multimodal-generation/generation` |
| wan2.6+ 异步 image-generation | ✓ | ✓ | `X-DashScope-Async: enable` → `GET /tasks/{id}` |
| wan2.5 及更早异步 text2image | ✓ | ✓ | `/services/aigc/text2image/image-synthesis` + `input.prompt` |
| size `宽*高`、prompt_extend、n、watermark | ✓ | ✓ | watermark 默认关 |
| 图生图 / 组图 / 2.7 编辑 | ✓ | — | 本期仅文生图 |

## UI 参数与约束

- `size`：官方星号格式（如 `1280*1280`）
- `prompt_extend`：智能改写

## 已知坑

- Base URL 需含 `/api/v1`（或根域 `https://dashscope.aliyuncs.com`，适配器会补全）。
- 异步结果 URL 约 24h 有效；Desk 会立刻下载落盘。
- Workspace 专属 `*.maas.aliyuncs.com` 域名也可填；路径约定同上。

## 校验记录

| 日期 | 结论 | 变更 |
|------|------|------|
| 2026-08-11 | 部分对齐 | 补齐适配器；新建可选 wan2.7；明确非 OpenAI 兼容 |
