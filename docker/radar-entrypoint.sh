#!/bin/sh
set -eu

mkdir -p "$(dirname "${API_RADAR_DB:-/data/radar/api-radar.sqlite}")"

if [ "${SEED_ON_EMPTY:-1}" = "1" ]; then
  db="${API_RADAR_DB:-/data/radar/api-radar.sqlite}"
  if [ ! -f "$db" ]; then
    echo "[radar] empty DB — running seed…"
    pnpm --filter @api-radar/server seed
  else
    echo "[radar] DB exists — skip seed ($db)"
  fi
fi

exec pnpm --filter @api-radar/server start
