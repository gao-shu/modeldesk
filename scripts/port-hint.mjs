/**
 * Shared Chinese hints when Web ports are already in use.
 * Used by run-with-port-hint.mjs, desktop-sidecar.
 */

/**
 * @param {{ service: string; port: number; host?: string; envVar: string }} opts
 */
export function formatPortInUseMessage(opts) {
  const host = opts.host || "127.0.0.1";
  const win =
    process.platform === "win32"
      ? `Windows 查看占用：netstat -ano | findstr ":${opts.port}"`
      : `查看占用：lsof -i :${opts.port}   或   ss -ltnp | grep ${opts.port}`;
  return [
    `[ModelDesk] ${opts.service} 端口已被占用：${host}:${opts.port}`,
    `  可能原因：上次 Web/桌面引擎未退出，或其它程序占用。`,
    `  ${win}`,
    `  然后结束对应 PID，或改环境变量 ${opts.envVar}=其它端口后重启。`,
    `  文档：README「开发者：本机跑 Web」端口说明。`,
  ].join("\n");
}

/** @param {string} text */
export function looksLikePortInUse(text) {
  const s = text || "";
  return (
    /EADDRINUSE/i.test(s) ||
    /address already in use/i.test(s) ||
    /port\s+\d+\s+is\s+(already\s+)?in\s+use/i.test(s) ||
    /failed to (bind|listen).*port/i.test(s)
  );
}
