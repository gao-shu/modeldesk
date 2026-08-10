import { NextRequest, NextResponse } from "next/server";
import { RegistryError } from "@modeldesk/model-registry";
import { getModelRegistry } from "@/lib/server/model-registry";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Smoke-test connectivity for a registered model via registry.testConfig. */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const registry = getModelRegistry();
    const model = await registry.getConfig(id);
    if (!model) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const result = await registry.testConfig(id);
    return NextResponse.json({
      ok: result.ok,
      model,
      result,
      error: result.ok ? undefined : result.message,
    });
  } catch (error) {
    if (error instanceof RegistryError && error.code === "not_found") {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
