import { NextRequest, NextResponse } from "next/server";
import { CAPABILITIES, MODALITIES } from "@modeldesk/shared";
import { z } from "zod";
import { RegistryError } from "@modeldesk/model-registry";
import { getModelRegistry } from "@/lib/server/model-registry";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  modality: z.enum(MODALITIES),
  capability: z.enum(CAPABILITIES),
  provider: z.string().trim().min(1).max(100),
  baseUrl: z.string().trim().max(500).nullable().optional(),
  apiKey: z.string().min(1).max(2000).nullable().optional(),
  modelId: z.string().trim().min(1).max(200),
  defaults: z.record(z.string(), z.unknown()).optional(),
  pricing: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const modality = request.nextUrl.searchParams.get("modality") ?? undefined;
    const models = await getModelRegistry().listConfigs(modality || undefined);
    return NextResponse.json({ ok: true, models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = createSchema.parse(await request.json());
    const model = await getModelRegistry().saveConfig({
      name: body.name,
      modality: body.modality,
      capability: body.capability,
      provider: body.provider,
      baseUrl: body.baseUrl ?? null,
      apiKey: body.apiKey ?? null,
      modelId: body.modelId,
      defaults: body.defaults,
      pricing: body.pricing,
    });
    return NextResponse.json({ ok: true, model }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: error.issues[0]?.message ?? "Invalid body" },
        { status: 400 },
      );
    }
    if (error instanceof RegistryError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.code === "not_found" ? 404 : 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
