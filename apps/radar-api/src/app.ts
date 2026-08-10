import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { createDb } from "./db/client.js";
import { registerAdminProbeReportRoutes } from "./routes/admin-probe-reports.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerProbeReportPageRoutes } from "./routes/probe-report-page.js";
import { registerPublicRoutes } from "./routes/public.js";

export async function buildApp(dbPath?: string) {
  const { db, dbPath: resolved } = createDb(dbPath);
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    // Local single-user desk: allow same-origin + common localhost origins only.
    // Override with CORS_ORIGIN=* only if you knowingly expose the API.
    origin: (origin, cb) => {
      const raw = process.env.CORS_ORIGIN?.trim();
      if (raw === "*") {
        cb(null, true);
        return;
      }
      if (!origin) {
        cb(null, true);
        return;
      }
      try {
        const u = new URL(origin);
        const ok =
          u.hostname === "127.0.0.1" ||
          u.hostname === "localhost" ||
          u.hostname === "[::1]";
        cb(null, ok);
      } catch {
        cb(null, false);
      }
    },
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
  });

  // Two-page shell: /radar + /verify (/ redirects) + /r/:id reports
  await registerDashboardRoutes(app, db);
  await registerProbeReportPageRoutes(app, db);
  await registerPublicRoutes(app, db);
  await registerAdminProbeReportRoutes(app, db);

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.code(status).send({
      data: null,
      error: {
        code: status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
        message: err.message || "Internal error",
      },
      meta: {
        requestId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });
  });

  return { app, dbPath: resolved };
}