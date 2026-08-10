import type { FastifyInstance } from "fastify";
import type { AppDb } from "../db/client.js";
import { getProbeReport } from "../lib/probe-report-store.js";
import {
  renderReportMissingPage,
  renderReportPage,
} from "../lib/probe-report-view.js";

function buildShareUrl(
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

export async function registerProbeReportPageRoutes(
  app: FastifyInstance,
  db: AppDb,
) {
  app.get("/r/:id", async (req, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const id = String((req.params as { id?: string }).id || "").trim();
    if (!id || id.length > 64) {
      reply.code(404).type("text/html; charset=utf-8");
      return renderReportMissingPage("not_found");
    }

    const got = getProbeReport(db, id);
    if (!got.ok) {
      reply.code(404).type("text/html; charset=utf-8");
      return renderReportMissingPage(
        got.reason === "expired" ? "expired" : "not_found",
      );
    }

    reply.type("text/html; charset=utf-8");
    return renderReportPage({
      id: got.id,
      snapshot: got.snapshot,
      shareUrl: buildShareUrl(req, got.id),
    });
  });
}
