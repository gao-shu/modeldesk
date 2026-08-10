import { NextRequest, NextResponse } from "next/server";
import { listArtifacts } from "@/lib/server/artifacts";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type") ?? undefined;
    const limitRaw = request.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 60;
    const artifacts = listArtifacts(type || undefined, {
      limit: Number.isFinite(limit) ? limit : 60,
    });
    return NextResponse.json({ ok: true, artifacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
