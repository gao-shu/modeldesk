import { NextResponse } from "next/server";
import { seedDemoData } from "@/lib/server/seed";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = seedDemoData();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
