import { NextResponse } from "next/server";
import {
  cleanupGeneratedData,
  getDiskUsage,
} from "@/lib/server/disk-usage";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, disk: getDiskUsage() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Body: { clearRuns?: boolean } — wipe artifacts; optionally run history. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      clearRuns?: boolean;
    };
    const result = cleanupGeneratedData({
      clearRuns: Boolean(body.clearRuns),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
