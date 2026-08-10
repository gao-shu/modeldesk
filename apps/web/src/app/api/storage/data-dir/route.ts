import { NextResponse } from "next/server";
import { changeDataDir, getDataDirMeta } from "@/lib/server/data-dir";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...getDataDirMeta() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      dataDir?: string | null;
      migrate?: boolean;
      resetToDefault?: boolean;
    };
    const result = changeDataDir({
      dataDir: body.dataDir,
      migrate: body.migrate,
      resetToDefault: body.resetToDefault,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
