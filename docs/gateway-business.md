# 业务怎么接本机 Gateway API

面向：**个人本机**上的漫剧 / 口播 / 脚本。业务代码只打 ModelDesk 的 `/v1`，不直连各家厂商。

## 1. 默认：跟 Web / 桌面同一个口（推荐）

打开 Desk（`pnpm dev` 或桌面应用）后即可：

```text
http://127.0.0.1:3300
```

与 UI **同一进程、同一数据目录**，不必再开 `modeldesk-gateway`。

## 2. 可选：无头独立进程

不想开 UI、只要 HTTP 时：

```bash
modeldesk-gateway   # http://127.0.0.1:3310
```

契约与 `:3300` 相同。须保证 `MODELDESK_DATA_DIR` / 桌面数据目录与配 Key 时一致。

## 3. 绑一次稳定别名

```bash
curl -s -X PUT http://127.0.0.1:3300/v1/aliases \
  -H "Content-Type: application/json" \
  -d "{\"llm-default\":\"<text-registry-id>\",\"image-default\":\"<image-registry-id>\"}"
```

之后业务里写死 `llm-default` / `image-default`；换模型只改别名。

## 4. 业务调用（示例）

```bash
curl -s http://127.0.0.1:3300/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"llm-default","messages":[{"role":"user","content":"……"}]}'

curl -s http://127.0.0.1:3300/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"image-default","prompt":"……"}'
```

TypeScript：`@modeldesk/gateway-client`（默认 `baseUrl` → `:3300`）。  
契约：`http://127.0.0.1:3300/openapi.yaml` 或仓库 `apps/web/public/openapi.yaml`。

## 5. 验收

```bash
# Web 已启动时：
curl -s http://127.0.0.1:3300/v1/models

# 可选无头进程：
pnpm gateway:smoke

# 花额度一文一图（优先打已运行的 :3300）：
# Windows 桌面数据目录：
$env:MODELDESK_DESKTOP='1'; pnpm gateway:accept
```

## 6. 不做

登录、多租户、配置同步、默认公网、卖 Token —— 见 [PHASE2.md](./PHASE2.md)。
