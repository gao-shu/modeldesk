#!/usr/bin/env bash
# ModelDesk — one-shot Docker deploy for 宝塔 (Baota) / Aliyun ECS.
#
# Prereqs (Baota 软件商店):
#   - Docker
#   - Docker Compose (v2 plugin, usually bundled)
#   - Git (optional if you upload code manually)
#
# Run on the server (Baota → 终端):
#   curl -fsSL https://gitee.com/gaoshuteacher/modeldesk/raw/main/scripts/deploy-baota-docker.sh | bash
# Or after git clone:
#   bash scripts/deploy-baota-docker.sh
#
# After success: Baota → 网站 → 反向代理 → http://127.0.0.1:3020

set -euo pipefail

INSTALL_DIR="${MODELDESK_INSTALL_DIR:-/www/wwwroot/modeldesk}"
REPO_URL="${MODELDESK_REPO_URL:-https://gitee.com/gaoshuteacher/modeldesk.git}"
BRANCH="${MODELDESK_BRANCH:-main}"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.baota.yml)

log() { printf '\n[modeldesk] %s\n' "$*"; }
die() { printf '\n[modeldesk] ERROR: %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令: $1（请在宝塔软件商店安装）"
}

need_cmd docker
docker compose version >/dev/null 2>&1 || die "需要 Docker Compose v2（docker compose）"

if ! docker info >/dev/null 2>&1; then
  die "Docker 未运行，请在宝塔 Docker 管理器中启动"
fi

mkdir -p "$(dirname "$INSTALL_DIR")"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  log "更新代码: $INSTALL_DIR"
  git -C "$INSTALL_DIR" fetch origin "$BRANCH" || git -C "$INSTALL_DIR" fetch gitee "$BRANCH" || true
  git -C "$INSTALL_DIR" checkout "$BRANCH"
  git -C "$INSTALL_DIR" pull --ff-only || true
else
  need_cmd git
  log "克隆仓库 → $INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

if [[ ! -f .env.docker ]]; then
  cp .env.docker.example .env.docker
  secret="$(openssl rand -base64 32 | tr -d '\n')"
  if grep -q '^ENCRYPTION_SECRET=change-me' .env.docker 2>/dev/null; then
    sed -i "s|^ENCRYPTION_SECRET=.*|ENCRYPTION_SECRET=${secret}|" .env.docker
  else
    echo "ENCRYPTION_SECRET=${secret}" >> .env.docker
  fi
  log "已生成 .env.docker（含随机 ENCRYPTION_SECRET）"
else
  log "沿用已有 .env.docker"
fi

mkdir -p data

log "构建并启动容器（首次约 5～15 分钟，视 CPU/网络而定）…"
docker compose "${COMPOSE_FILES[@]}" --env-file .env.docker up --build -d

log "等待健康检查…"
for i in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:3020/healthz" >/dev/null 2>&1; then
    log "服务已就绪: http://127.0.0.1:3020"
    curl -fsS "http://127.0.0.1:3020/healthz" || true
    echo
    cat <<'EOF'

══════════════════════════════════════════════════════════════
  下一步（宝塔面板）：

  1. 网站 → 添加站点
     - 有域名：填域名；仅 IP：填 8.141.97.65 或留空用 IP 访问
  2. 站点 → 设置 → 反向代理 → 添加
     - 代理名称：modeldesk
     - 目标 URL：http://127.0.0.1:3020
     - 发送域名：$host
  3. （推荐）安全组 / 防火墙：不要对公网开放 3020，只开放 80/443
  4. 浏览器打开站点 → 设置 → 对象存储 → 配置七牛

  常用命令（在 /www/wwwroot/modeldesk）：
    docker compose -f docker-compose.yml -f docker-compose.baota.yml --env-file .env.docker logs -f
    docker compose -f docker-compose.yml -f docker-compose.baota.yml --env-file .env.docker restart

  ⚠ ModelDesk 无登录页，公网暴露前请加 IP 白名单或 Nginx 基础认证。
══════════════════════════════════════════════════════════════
EOF
    exit 0
  fi
  sleep 3
done

die "启动超时。查看日志: docker compose -f docker-compose.yml -f docker-compose.baota.yml --env-file .env.docker logs --tail=80"
