#!/usr/bin/env bash
# ModelDesk — Baota / Linux deploy (Docker Compose).
#
# 默认：本机回环 127.0.0.1:3300 —— 仅本机其它进程/容器可访问，公网不可达。
#
#   export WEB_PORT=3300            # 默认 3300（与 ModelDesk 开发端口一致）
#   export BIND_HOST=127.0.0.1      # 默认 127.0.0.1
#   bash scripts/deploy-baota.sh
#
# 同 VPC 其它机器也要访问时（仍不对公网）：
#   export BIND_HOST=172.18.148.248  # ECS 私网 IP
#   bash scripts/deploy-baota.sh
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/www/wwwroot/modeldesk}"
REPO_URL="${REPO_URL:-https://gitee.com/gaoshuteacher/modeldesk.git}"
BRANCH="${BRANCH:-main}"
WEB_PORT="${WEB_PORT:-3300}"
INTERNAL_ONLY="${INTERNAL_ONLY:-1}"
BIND_HOST="${BIND_HOST:-127.0.0.1}"

log() { printf '[deploy-baota] %s\n' "$*"; }
die() { printf '[deploy-baota] ERROR: %s\n' "$*" >&2; exit 1; }

detect_private_ip() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 addr show 2>/dev/null | awk '
      /inet / {
        split($2, a, "/");
        ip = a[1];
        if (ip ~ /^127\./) next;
        if (ip ~ /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/) { print ip; exit }
      }'
  fi
}

resolve_bind_host() {
  # BIND_HOST 已在环境变量中给出（默认 127.0.0.1 = 仅本机其它服务）
  if [[ "$INTERNAL_ONLY" != "1" && "$BIND_HOST" == "127.0.0.1" ]]; then
    local ip
    ip="$(detect_private_ip || true)"
    if [[ -n "$ip" ]]; then
      printf '%s' "$ip"
      return
    fi
  fi
  printf '%s' "$BIND_HOST"
}

command -v docker >/dev/null 2>&1 || die "未安装 Docker。请在宝塔 → 软件商店 → 安装 Docker 后重试。"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  die "未找到 docker compose。"
fi

BIND_HOST="$(resolve_bind_host)"
log "访问模式: $([[ "$INTERNAL_ONLY" == "1" ]] && echo '仅内网' || echo '需自行配置公网反代')"
log "绑定地址: ${BIND_HOST}:${WEB_PORT}"

log "安装目录: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if [[ -d .git ]]; then
  log "已存在仓库，git pull…"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  log "克隆 $REPO_URL ($BRANCH)…"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" .
fi

if [[ ! -f .env.docker ]]; then
  cp .env.docker.example .env.docker
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -base64 32 | tr -d '\n')"
  else
    SECRET="$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
  fi
  sed -i "s|^ENCRYPTION_SECRET=.*|ENCRYPTION_SECRET=${SECRET}|" .env.docker
  sed -i "s|^WEB_HOST_PORT=.*|WEB_HOST_PORT=${WEB_PORT}|" .env.docker
  log "已生成 .env.docker（请备份 ENCRYPTION_SECRET）"
else
  log "沿用已有 .env.docker"
fi

cat > docker-compose.override.yml <<EOF
services:
  web:
    ports:
      - "${BIND_HOST}:${WEB_PORT}:3020"
EOF
log "已写入 docker-compose.override.yml"

log "构建并启动容器（首次约 10～20 分钟）…"
$COMPOSE --env-file .env.docker up --build -d

HEALTH_URL="http://${BIND_HOST}:${WEB_PORT}/healthz"
log "等待健康检查 ${HEALTH_URL} …"
for i in $(seq 1 60); do
  if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
    log "服务已就绪"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    log "健康检查超时: $COMPOSE --env-file .env.docker logs -f web"
    exit 1
  fi
  sleep 5
done

if [[ "$BIND_HOST" == "127.0.0.1" ]]; then
  NEXT_STEPS="
  【本机专用】同服务器其它服务请调用:
    http://127.0.0.1:${WEB_PORT}/
    Gateway API: http://127.0.0.1:${WEB_PORT}/v1/...

  公网 / 其它 ECS 均无法访问（未监听外网网卡，无需安全组放行 ${WEB_PORT}）。"
elif [[ "$INTERNAL_ONLY" == "1" ]]; then
  NEXT_STEPS="
  【VPC 内网】访问地址:
    http://${BIND_HOST}:${WEB_PORT}/

  阿里云安全组: 勿对 0.0.0.0/0 开放 ${WEB_PORT}；仅 VPC 网段可访问。"
else
  NEXT_STEPS="
  下一步 — 宝塔反向代理（公网场景，不推荐无登录暴露）:
    目标 URL: http://127.0.0.1:${WEB_PORT}
    务必加 IP 白名单或基础认证。"
fi

cat <<EOF

================================================================================
  ModelDesk 容器已启动（${INTERNAL_ONLY:+内网模式}${INTERNAL_ONLY:-公网需自配反代}）
================================================================================
  访问:  http://${BIND_HOST}:${WEB_PORT}/
  数据:  ${INSTALL_DIR}/data
${NEXT_STEPS}

  运维:
    cd ${INSTALL_DIR}
    $COMPOSE --env-file .env.docker logs -f web

  文档: docs/deploy-baota.md
================================================================================
EOF
