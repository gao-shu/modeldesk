import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 9800);
// Default loopback for local single-user use. Docker sets HOST=0.0.0.0 explicitly.
const host = process.env.HOST ?? "127.0.0.1";

const { app, dbPath } = await buildApp();
app.log.info({ dbPath }, "database ready");
await app.listen({ port, host });
app.log.info(`API Radar listening on http://${host}:${port}`);
