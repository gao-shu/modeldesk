import { NextRequest, NextResponse } from "next/server";
import { listActiveRuns } from "@/lib/server/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight in-flight runs for status polling (not the history list). */
export async function GET(request: NextRequest) {
  try {
    const raw = Number(request.nextUrl.searchParams.get("limit"));
    const limit = Number.isFinite(raw) ? raw : 50;
    const runs = listActiveRuns(limit);
    return NextResponse.json({ ok: true, runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
