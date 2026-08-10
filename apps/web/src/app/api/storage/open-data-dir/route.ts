import { NextResponse } from "next/server";
import { openDataDirInOs } from "@/lib/server/data-dir";

export const runtime = "nodejs";

export async function POST() {
  try {
    const dataDir = await openDataDirInOs();
    return NextResponse.json({ ok: true, dataDir });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
