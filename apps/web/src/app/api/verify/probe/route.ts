import { NextResponse } from "next/server";
import { z } from "zod";
import { getModelApiKey } from "@/lib/server/models";

const BodySchema = z.object({
  baseUrl: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(200),
  mode: z.enum(["standard", "deep"]).optional().default("standard"),
  /** Plain key from the form; takes precedence when non-empty. */
  apiKey: z.string().optional(),
  /** When apiKey is empty, decrypt from this saved interface config. */
  configId: z.string().trim().min(1).max(80).optional(),
});

function radarBase() {
  return (process.env.RADAR_API_BASE || "http://127.0.0.1:9800").replace(
    /\/$/,
    "",
  );
}

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const typedKey = body.apiKey?.trim() || "";
    let apiKey = typedKey;

    if (!apiKey && body.configId) {
      apiKey = getModelApiKey(body.configId)?.trim() || "";
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: body.configId
            ? "该模型配置未保存 API Key，请在下方填写后再测试"
            : "请填写 API Key",
        },
        { status: 400 },
      );
    }

    const res = await fetch(`${radarBase()}/api/v1/probe/once`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: body.baseUrl,
        apiKey,
        model: body.model,
        mode: body.mode,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    let json: {
      data?: unknown;
      error?: { code?: string; message?: string } | null;
    };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      return NextResponse.json(
        { ok: false, error: `Radar 响应不是 JSON（HTTP ${res.status}）` },
        { status: 502 },
      );
    }

    if (!res.ok || json.error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            json.error?.message || `Radar 请求失败（HTTP ${res.status}）`,
        },
        { status: res.ok ? 400 : 502 },
      );
    }

    return NextResponse.json({ ok: true, report: json.data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes("ENCRYPTION_SECRET") ? 500 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
