export function jsonResponse(status: number, body: unknown): Response {
  const raw = JSON.stringify(body);
  return new Response(raw, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(raw)),
    },
  });
}

export function openaiErrorResponse(
  status: number,
  message: string,
  type = "invalid_request_error",
): Response {
  return jsonResponse(status, {
    error: { message, type, param: null, code: null },
  });
}

export async function readJsonBody(
  req: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false }> {
  try {
    const text = await req.text();
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

/** Public origin for artifact URLs (respects Host / forwarded headers). */
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const protoHeader = req.headers.get("x-forwarded-proto");
  const proto = protoHeader?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  if (host) return `${proto}://${host}`;
  return url.origin;
}
