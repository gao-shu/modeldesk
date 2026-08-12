import { NextRequest, NextResponse } from "next/server";
import { abortRun } from "@/lib/server/run-abort";
import { cancelRunJobs, getRun } from "@/lib/server/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Cancel an in-flight run: abort upstream work + mark jobs cancelled. */
export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const run = getRun(id);
    if (!run) {
      return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
    }
    const aborted = abortRun(id);
    const { cancelledJobs } = cancelRunJobs(id, "已取消");
    return NextResponse.json({
      ok: true,
      aborted,
      cancelledJobs,
      runId: id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
