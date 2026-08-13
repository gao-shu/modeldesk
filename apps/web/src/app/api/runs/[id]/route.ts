import { NextRequest, NextResponse } from "next/server";
import { getRunWithJob } from "@/lib/server/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Single run + job detail (status reconcile / view in-progress). */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const row = getRunWithJob(id);
    if (!row) {
      return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
