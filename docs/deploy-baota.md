# 宝塔部署 ModelDesk（Docker）

## 推荐：本机 3300，外网不可访问

适合「**同一台服务器上的其它服务**」调用 ModelDesk（Gateway `/v1/...`），公网用户访问不到。

| 谁 | 地址 |
|----|------|
| 本机其它进程 / Docker 容器 | `http://127.0.0.1:3300` |
| 公网 | ❌ 不可达（只监听 127.0.0.1） |
| 同 VPC 其它 ECS | ❌ 默认不可达（若需要见下文） |

部署：

```bash
mkdir -p /www/wwwroot/modeldesk && cd /www/wwwroot/modeldesk
git clone https://gitee.com/gaoshuteacher/modeldesk.git .
export WEB_PORT=3300
export BIND_HOST=127.0.0.1
bash scripts/deploy-baota.sh
```

`docker-compose.override.yml` 等价于：

```yaml
services:
  web:
    ports:
      - "127.0.0.1:3300:3020"
```

验证：

```bash
curl -s http://127.0.0.1:3300/healthz
```

其它服务调用示例：

```bash
curl http://127.0.0.1:3300/v1/models
```

**不必**配置宝塔网站、域名、SSL；**不必**在安全组开放 3300（绑定 127.0.0.1 时外网本来就连不上）。

---

## 可选：同 VPC 其它机器也要访问（仍不对公网）

```bash
export WEB_PORT=3300
export BIND_HOST=172.18.148.248   # ECS 私网 IP
bash scripts/deploy-baota.sh
```

安全组：仅允许 VPC 网段访问 3300，**禁止** `0.0.0.0/0`。

---

## 宝塔安装 Docker

软件商店 → **Docker** → 安装 → 终端执行上述脚本。

---

## 七牛对象存储

浏览器需能打开 ModelDesk 才能进设置页。若只绑 127.0.0.1，在服务器上用：

```bash
curl 仅够 healthz；配置 Key 建议 SSH 隧道到本机 3300，或临时用 VPS 浏览器 / 内网跳板打开 http://127.0.0.1:3300
```

更省事：先在 Windows 本机 Desktop 配好七牛，再把 `data/` 目录拷到服务器（含同一 `.encryption-secret`）。

---

## 运维

```bash
cd /www/wwwroot/modeldesk
docker compose --env-file .env.docker logs -f web
docker compose --env-file .env.docker restart web
```

## 故障排查

| 现象 | 处理 |
|------|------|
| 外网访问 3300 失败 | **正常**，请用 127.0.0.1 |
| 本机 curl 失败 | `docker ps`；看日志 |
| 其它容器访问失败 | 同机用 `http://127.0.0.1:3300`；跨容器网络用 host 网络或 `extra_hosts` |
