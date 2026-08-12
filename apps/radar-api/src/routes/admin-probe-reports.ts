import type { FastifyInstance } from "fastify";
import type { AppDb } from "../db/client.js";
import { fail, ok } from "../lib/envelope.js";
import {
  deleteProbeReport,
  purgeExpiredProbeReports,
} from "../lib/probe-report-store.js";

function adminToken(): string {
  return String(process.env.MODELDESK_RADAR_ADMIN_TOKEN || "").trim();
}

function assertAdmin(
  req: { headers: Record<string, unknown> },
  reply: { code: (n: number) => unknown },
): string | null {
  const expected = adminToken();
  if (!expected) {
    reply.code(503);
    return "未配置 MODELDESK_RADAR_ADMIN_TOKEN，管理接口不可用";
  }
  const hdr = req.headers["x-admin-token"];
  const got = typeof hdr === "string" ? hdr.trim() : "";
  if (!got || got !== expected) {
    reply.code(401);
    return "未授权";
  }
  return null;
}

/** 管理：清理 / 删除自测报告（不写雷达榜） */
export async function registerAdminProbeReportRoutes(
  app: FastifyInstance,
  db: AppDb,
) {
  app.post(
    "/api/v1/admin/probe-reports/purge",
    {
      config: {
        rateLimit: { max: 20, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const err = assertAdmin(req, reply);
      if (err) return fail("UNAUTHORIZED", err);
      const removed = purgeExpiredProbeReports(db);
      return ok({ removed });
    },
  );

  app.delete(
    "/api/v1/admin/probe-reports/:id",
    {
      config: {
        rateLimit: { max: 30, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const err = assertAdmin(req, reply);
      if (err) return fail("UNAUTHORIZED", err);
      const id = String((req.params as { id?: string }).id || "").trim();
      if (!id || id.length > 64) {
        reply.code(400);
        return fail("VALIDATION_ERROR", "无效的报告 id");
      }
      const deleted = deleteProbeReport(db, id);
      if (!deleted) {
        reply.code(404);
        return fail("NOT_FOUND", "报告不存在");
      }
      return ok({ id, deleted: true });
    },
  );
}
