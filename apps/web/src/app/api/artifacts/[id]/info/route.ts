import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getArtifact, toPublicArtifact } from "@/lib/server/artifacts";
import { resolveDataPath } from "@/lib/server/paths";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(
  _request: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const row = getArtifact(id);
    if (!row) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const pub = toPublicArtifact(row);
    const meta: Record<string, unknown> = { ...pub.meta };

    // Ensure fileSize is present even for older artifacts that lacked it in meta.
    if (typeof meta.fileSize !== "number") {
      try {
        const absPath = resolveDataPath(row.uri);
        if (fs.existsSync(absPath)) {
          meta.fileSize = fs.statSync(absPath).size;
        }
      } catch {
        /* ignore missing file */
      }
    }

    return NextResponse.json({
      ok: true,
      meta,
      type: pub.type,
      mime: pub.mime,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
