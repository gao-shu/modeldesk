import { NextResponse } from "next/server";
import { getStorageStatus } from "@/lib/server/seed";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, storage: getStorageStatus() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
