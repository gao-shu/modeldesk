import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "../db/client.js";
import {
  guides,
  modelPrices,
  models,
  promoCodes,
  providers,
  verificationRecords,
} from "../db/schema.js";
import { fail, ok, parsePage, paginate } from "../lib/envelope.js";
import { runProbeAuth, runProbeAuthFull } from "../lib/probe-orchestrator.js";
import { runProbeOnce } from "../lib/probe-once.js";
import { parseProbeReportCreateBody } from "../lib/probe-report-parse.js";
import {
  getProbeReport,
  purgeExpiredProbeReports,
  saveProbeReport,
} from "../lib/probe-report-store.js";
import { mapProviderListItem, scoreProvider } from "../lib/providers.js";

function truthy(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (v === true || v === "true" || v === "1") return true;
  if (v === false || v === "false" || v === "0") return false;
  return undefined;
}

export async function registerPublicRoutes(
  app: FastifyInstance,
  db: AppDb,
) {
  app.addHook("onSend", async (req, reply, payload) => {
    if (
      req.method === "GET" &&
      reply.statusCode >= 200 &&
      reply.statusCode < 300
    ) {
      reply.header(
        "Cache-Control",
        "public, max-age=300, stale-while-revalidate=600",
      );
    }
    return payload;
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "api-radar",
    time: new Date().toISOString(),
  }));

  app.get("/api/v1/meta/updated-at", async () => {
    const rows = await db.select().from(providers).where(eq(providers.status, "active"));
    const providersUpdatedAt = maxIso(rows.map((r) => r.updatedAt));
    const pricesUpdatedAt = maxIso(rows.map((r) => r.lastPriceUpdatedAt));
    return ok({
      providersUpdatedAt,
      pricesUpdatedAt,
      activeProviderCount: rows.length,
    });
  });

  app.get("/api/v1/meta", async () => {
    return ok({
      app: "modeldesk-radar",
      singleUser: true,
      demoCatalog: process.env.RADAR_DEMO_CATALOG === "1",
    });
  });

  app.get("/api/v1/providers", async (req, reply) => {
    const q = req.query as Record<string, unknown>;
    const { page, pageSize } = parsePage(q);
    const sort = String(q.sort ?? "composite");
    const family = q.family ? String(q.family) : undefined;
    const authenticityStatus = q.authenticityStatus
      ? String(q.authenticityStatus)
      : undefined;
    const imageModelSupport = truthy(q.imageModelSupport);
    const paymentsFilter = q.payments
      ? String(q.payments)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    let providerRows = await db
      .select()
      .from(providers)
      .where(eq(providers.status, "active"));

    if (authenticityStatus) {
      providerRows = providerRows.filter(
        (r) => r.authenticityStatus === authenticityStatus,
      );
    }
    if (imageModelSupport !== undefined) {
      providerRows = providerRows.filter(
        (r) => r.imageModelSupport === imageModelSupport,
      );
    }
    if (paymentsFilter.length) {
      providerRows = providerRows.filter((r) => {
        const pays = JSON.parse(r.paymentsJson) as string[];
        return paymentsFilter.every((p) => pays.includes(p));
      });
    }
    if (family) {
      const priced = await db
        .select({ providerId: modelPrices.providerId })
        .from(modelPrices)
        .innerJoin(models, eq(models.id, modelPrices.modelId))
        .where(and(eq(models.family, family), eq(models.status, "active")));
      const ids = new Set(priced.map((p) => p.providerId));
      providerRows = providerRows.filter((r) => ids.has(r.id));
    }

    const now = new Date();
    const scored = providerRows.map((r) => ({
      row: r,
      score: scoreProvider(r, now),
    }));

    scored.sort((a, b) => {
      if (sort === "price") {
        return a.row.minTopupCny - b.row.minTopupCny;
      }
      if (sort === "verified") {
        return b.row.lastVerifiedAt.localeCompare(a.row.lastVerifiedAt);
      }
      if (sort === "updated") {
        return b.row.updatedAt.localeCompare(a.row.updatedAt);
      }
      // composite default
      return b.score - a.score;
    });

    const pageData = paginate(scored, page, pageSize);
    const ids = pageData.items.map((i) => i.row.id);
    const promos =
      ids.length === 0
        ? []
        : await db
            .select()
            .from(promoCodes)
            .where(
              and(
                inArray(promoCodes.providerId, ids),
                eq(promoCodes.isActive, true),
              ),
            );

    const items = pageData.items.map(({ row }) =>
      mapProviderListItem(
        row,
        promos
          .filter((p) => p.providerId === row.id)
          .map((p) => ({
            code: p.code,
            label: p.label,
            isExclusive: p.isExclusive,
          })),
        now,
      ),
    );

    return ok({ items, pagination: pageData.pagination });
  });

  app.get("/api/v1/providers/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, id))
      .limit(1);
    if (!row) {
      reply.code(404);
      return fail("NOT_FOUND", "Provider not found");
    }

    const promos = await db
      .select()
      .from(promoCodes)
      .where(
        and(
          eq(promoCodes.providerId, id),
          eq(promoCodes.isActive, true),
        ),
      );

    const prices = await db
      .select({
        id: modelPrices.id,
        providerId: modelPrices.providerId,
        modelId: modelPrices.modelId,
        modelName: models.name,
        family: models.family,
        inputPriceUsd: modelPrices.inputPriceUsd,
        outputPriceUsd: modelPrices.outputPriceUsd,
        imagePriceUsd: modelPrices.imagePriceUsd,
        priceUnit: modelPrices.priceUnit,
        currencyDisplay: modelPrices.currencyDisplay,
        channelNote: modelPrices.channelNote,
        isAvailable: modelPrices.isAvailable,
        lastVerifiedAt: modelPrices.lastVerifiedAt,
      })
      .from(modelPrices)
      .leftJoin(models, eq(models.id, modelPrices.modelId))
      .where(eq(modelPrices.providerId, id));

    const verifications = await db
      .select()
      .from(verificationRecords)
      .where(eq(verificationRecords.providerId, id))
      .orderBy(desc(verificationRecords.verifiedAt))
      .limit(3);

    const listItem = mapProviderListItem(
      row,
      row.status === "delisted"
        ? []
        : promos.map((p) => ({
            code: p.code,
            label: p.label,
            isExclusive: p.isExclusive,
          })),
    );

    return ok({
      ...listItem,
      summary: row.summary,
      status: row.status,
      channelNote: row.channelNote,
      communityUrl: row.communityUrl,
      listedAt: row.listedAt,
      updatedAt: row.updatedAt,
      prices,
      verificationRecords: verifications.map((v) => ({
        id: v.id,
        modelId: v.modelId,
        result: v.result,
        method: v.method,
        summary: v.summary,
        verifiedAt: v.verifiedAt,
      })),
    });
  });

  app.get("/api/v1/models", async (req) => {
    const q = req.query as Record<string, unknown>;
    const { page, pageSize } = parsePage(q);
    let rows = await db.select().from(models).where(eq(models.status, "active"));
    if (q.family) rows = rows.filter((r) => r.family === String(q.family));
    const featured = truthy(q.featured);
    if (featured !== undefined)
      rows = rows.filter((r) => r.isFeatured === featured);
    rows.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const pageData = paginate(rows, page, pageSize);
    return ok({
      items: pageData.items.map((m) => ({
        id: m.id,
        name: m.name,
        family: m.family,
        category: m.category,
        isFeatured: m.isFeatured,
        sortOrder: m.sortOrder,
      })),
      pagination: pageData.pagination,
    });
  });

  app.get("/api/v1/models/:id/prices", async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as Record<string, unknown>;
    const sort = String(q.sort ?? "price");
    const [model] = await db
      .select()
      .from(models)
      .where(eq(models.id, id))
      .limit(1);
    if (!model) {
      reply.code(404);
      return fail("NOT_FOUND", "Model not found");
    }

    const rows = await db
      .select({
        providerId: modelPrices.providerId,
        providerName: providers.name,
        authenticityStatus: providers.authenticityStatus,
        inputPriceUsd: modelPrices.inputPriceUsd,
        outputPriceUsd: modelPrices.outputPriceUsd,
        imagePriceUsd: modelPrices.imagePriceUsd,
        priceUnit: modelPrices.priceUnit,
        currencyDisplay: modelPrices.currencyDisplay,
        channelNote: modelPrices.channelNote,
        isAvailable: modelPrices.isAvailable,
        lastVerifiedAt: modelPrices.lastVerifiedAt,
        providerLastVerifiedAt: providers.lastVerifiedAt,
      })
      .from(modelPrices)
      .innerJoin(providers, eq(providers.id, modelPrices.providerId))
      .where(
        and(
          eq(modelPrices.modelId, id),
          eq(providers.status, "active"),
        ),
      );

    rows.sort((a, b) => {
      if (sort === "verified") {
        return (b.lastVerifiedAt ?? "").localeCompare(a.lastVerifiedAt ?? "");
      }
      const ap = a.inputPriceUsd ?? a.imagePriceUsd ?? Number.POSITIVE_INFINITY;
      const bp = b.inputPriceUsd ?? b.imagePriceUsd ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    });

    return ok({
      model: {
        id: model.id,
        name: model.name,
        family: model.family,
        category: model.category,
      },
      items: rows.map((r) => ({
        providerId: r.providerId,
        providerName: r.providerName,
        inputPriceUsd: r.inputPriceUsd,
        outputPriceUsd: r.outputPriceUsd,
        imagePriceUsd: r.imagePriceUsd,
        priceUnit: r.priceUnit,
        currencyDisplay: r.currencyDisplay,
        channelNote: r.channelNote,
        isAvailable: r.isAvailable,
        authenticityStatus: r.authenticityStatus,
        lastVerifiedAt: r.lastVerifiedAt ?? r.providerLastVerifiedAt,
      })),
      updatedAt: maxIso(
        rows.map((r) => r.lastVerifiedAt).filter(Boolean) as string[],
      ),
    });
  });

  app.get("/api/v1/guides", async (req) => {
    const q = req.query as Record<string, unknown>;
    let rows = await db
      .select()
      .from(guides)
      .where(eq(guides.status, "published"));
    if (q.category)
      rows = rows.filter((r) => r.category === String(q.category));
    return ok({
      items: rows.map((g) => ({
        slug: g.slug,
        title: g.title,
        category: g.category,
        summary: g.summary,
        publishedAt: g.publishedAt,
      })),
    });
  });

  app.get("/api/v1/guides/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const [g] = await db
      .select()
      .from(guides)
      .where(eq(guides.slug, slug))
      .limit(1);
    if (!g || g.status !== "published") {
      reply.code(404);
      return fail("NOT_FOUND", "Guide not found");
    }
    return ok({
      slug: g.slug,
      title: g.title,
      category: g.category,
      summary: g.summary,
      contentMd: g.contentMd,
      publishedAt: g.publishedAt,
    });
  });

  app.post(
    "/api/v1/probe/once",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
      const model = typeof body.model === "string" ? body.model : "";
      const mode = body.mode === "deep" ? "deep" : "standard";
      const legacy = body.legacy === true || body.legacy === "1";
      const suiteSeed =
        typeof body.suiteSeed === "number"
          ? body.suiteSeed
          : typeof body.suiteSeed === "string" && body.suiteSeed.trim()
            ? Number(body.suiteSeed)
            : undefined;
      if (!baseUrl || !apiKey || !model) {
        reply.code(400);
        return fail(
          "VALIDATION_ERROR",
          "baseUrl、apiKey、model 均为必填",
        );
      }
      try {
        // apiKey is used for the outbound call only and never persisted.
        const result = legacy
          ? await runProbeOnce({ baseUrl, apiKey, model })
          : await runProbeAuthFull({
              baseUrl,
              apiKey,
              model,
              mode,
              suiteSeed: Number.isFinite(suiteSeed) ? suiteSeed : undefined,
            });
        return ok(result);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 500;
        reply.code(status);
        return fail(
          status === 400 ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
          err instanceof Error ? err.message : "Probe failed",
        );
      }
    },
  );

  /** SSE：分步推送检测进度，最后一条 type=done 带完整报告 */
  app.post(
    "/api/v1/probe/run",
    {
      config: {
        rateLimit: {
          max: 6,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl : "";
      const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
      const model = typeof body.model === "string" ? body.model : "";
      const mode = body.mode === "deep" ? "deep" : "standard";
      const suiteSeed =
        typeof body.suiteSeed === "number"
          ? body.suiteSeed
          : typeof body.suiteSeed === "string" && body.suiteSeed.trim()
            ? Number(body.suiteSeed)
            : undefined;
      if (!baseUrl || !apiKey || !model) {
        reply.code(400);
        return fail("VALIDATION_ERROR", "baseUrl、apiKey、model 均为必填");
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const send = (obj: unknown) => {
        reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
      };

      try {
        const gen = runProbeAuth({
          baseUrl,
          apiKey,
          model,
          mode,
          suiteSeed: Number.isFinite(suiteSeed) ? suiteSeed : undefined,
        });
        while (true) {
          const next = await gen.next();
          if (next.done) {
            send({ type: "done", report: next.value });
            break;
          }
          send(next.value);
        }
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        reply.raw.end();
      }
    },
  );

  /** 创建可分享检测报告（脱敏入库；忽略 apiKey） */
  app.post(
    "/api/v1/probe/reports",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const parsed = parseProbeReportCreateBody(req.body);
      if (!parsed.ok) {
        reply.code(400);
        return fail("VALIDATION_ERROR", parsed.message);
      }

      try {
        purgeExpiredProbeReports(db);
        const saved = saveProbeReport(db, {
          report: parsed.report,
          meta: {
            testedHost: parsed.testedHost,
            testerLabel: parsed.testerLabel,
            includeSuiteIds: parsed.includeSuiteIds,
            includeRawPreview: parsed.includeRawPreview,
          },
        });
        const url = buildReportUrl(req, saved.id);
        return ok({
          id: saved.id,
          url,
          expiresAt: saved.expiresAt,
          snapshot: saved.snapshot,
        });
      } catch (err) {
        req.log.warn({ err }, "probe report save failed");
        reply.code(500);
        return fail(
          "INTERNAL_ERROR",
          err instanceof Error ? err.message : "保存报告失败",
        );
      }
    },
  );

  /** 读取公开报告快照 */
  app.get("/api/v1/probe/reports/:id", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const id = String((req.params as { id?: string }).id || "").trim();
    if (!id || id.length > 64) {
      reply.code(400);
      return fail("VALIDATION_ERROR", "无效的报告 id");
    }

    const got = getProbeReport(db, id);
    if (!got.ok) {
      reply.code(404);
      return fail(
        "NOT_FOUND",
        got.reason === "expired" ? "报告已过期" : "报告不存在",
      );
    }

    return ok({
      id: got.id,
      url: buildReportUrl(req, got.id),
      snapshot: got.snapshot,
    });
  });
}

function buildReportUrl(
  req: { protocol: string; hostname: string; headers: Record<string, unknown> },
  id: string,
): string {
  const xfProto = req.headers["x-forwarded-proto"];
  const proto =
    (typeof xfProto === "string" && xfProto.split(",")[0]?.trim()) ||
    req.protocol ||
    "http";
  const xfHost = req.headers["x-forwarded-host"];
  const host =
    (typeof xfHost === "string" && xfHost.split(",")[0]?.trim()) ||
    (typeof req.headers.host === "string" && req.headers.host) ||
    req.hostname ||
    "127.0.0.1:8787";
  return `${proto}://${host}/r/${id}`;
}

function maxIso(values: string[]): string | null {
  if (!values.length) return null;
  return values.reduce((a, b) => (a > b ? a : b));
}

