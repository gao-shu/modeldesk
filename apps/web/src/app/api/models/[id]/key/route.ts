import { NextRequest, NextResponse } from "next/server";
import {
  deleteModelApiKey,
  getModel,
  updateModelApiKey,
} from "@/lib/server/models";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Update encrypted API key. Body: { apiKey: string } */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    if (!getModel(id)) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const body = (await request.json()) as { apiKey?: string };
    if (!body.apiKey || typeof body.apiKey !== "string") {
      return NextResponse.json(
        { ok: false, error: "apiKey string required" },
        { status: 400 },
      );
    }
    const model = updateModelApiKey(id, body.apiKey);
    return NextResponse.json({ ok: true, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Remove stored API key */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const model = deleteModelApiKey(id);
    if (!model) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, model });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
