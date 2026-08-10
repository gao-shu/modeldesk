import { NextRequest, NextResponse } from "next/server";
import { CAPABILITIES, MODALITIES } from "@modeldesk/shared";
import { z } from "zod";
import { RegistryError } from "@modeldesk/model-registry";
import { getModelRegistry } from "@/lib/server/model-registry";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  modality: z.enum(MODALITIES).optional(),
  capability: z.enum(CAPABILITIES).optional(),
  provider: z.string().trim().min(1).max(100).optional(),
  baseUrl: z.string().trim().max(500).nullable().optional(),
  /** Omit to keep; empty string ignored; null clears. */
  apiKey: z.string().max(2000).nullable().optional(),
  modelId: z.string().trim().min(1).max(200).optional(),
  defaults: z.record(z.string(), z.unknown()).optional(),
  pricing: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const model = await getModelRegistry().getConfig(id);
    if (!model) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = updateSchema.parse(await request.json());
    const apiKey =
      body.apiKey === undefined
        ? undefined
        : body.apiKey === null || body.apiKey === ""
          ? body.apiKey === null
            ? null
            : undefined
          : body.apiKey;

    const model = await getModelRegistry().updateConfig(id, {
      name: body.name,
      modality: body.modality,
      capability: body.capability,
      provider: body.provider,
      baseUrl: body.baseUrl,
      apiKey,
      modelId: body.modelId,
      defaults: body.defaults,
      pricing: body.pricing,
    });
    return NextResponse.json({ ok: true, model });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: error.issues[0]?.message ?? "Invalid body" },
        { status: 400 },
      );
    }
    if (error instanceof RegistryError && error.code === "not_found") {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    await getModelRegistry().deleteConfig(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RegistryError && error.code === "not_found") {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
