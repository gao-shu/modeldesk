# syntax=docker/dockerfile:1
# ModelDesk monorepo — web (Next) + radar (Fastify)

FROM node:20-bookworm AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY data ./data
RUN pnpm install --frozen-lockfile

# Rewrites bake RADAR_API_BASE at build time (docker network service name)
ARG RADAR_API_BASE=http://radar:9800
ENV RADAR_API_BASE=${RADAR_API_BASE}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN pnpm --filter @modeldesk/web build

# ── Web (Next standalone) ──────────────────────────────────────────
FROM node:20-bookworm-slim AS web
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3020
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV MODELDESK_DATA_DIR=/data
# standalone layout for apps/web in a pnpm monorepo
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p /data
EXPOSE 3020
CMD ["node", "apps/web/server.js"]

# ── Radar (Fastify via tsx) ─────────────────────────────────────────
FROM base AS radar
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=9800
ENV MODELDESK_DATA_DIR=/data
ENV MODELDESK_RADAR_DB=/data/radar/modeldesk-radar.sqlite
ENV SEED_ON_EMPTY=1
COPY --from=build /app /app
COPY docker/radar-entrypoint.sh /usr/local/bin/radar-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/radar-entrypoint.sh \
  && chmod +x /usr/local/bin/radar-entrypoint.sh \
  && mkdir -p /data/radar
EXPOSE 9800
ENTRYPOINT ["/usr/local/bin/radar-entrypoint.sh"]
