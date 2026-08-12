import fs from "node:fs";
import { NextResponse } from "next/server";
import { getArtifact } from "@/lib/server/artifacts";
import { resolveDataPath } from "@/lib/server/paths";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Thumbnail endpoint (sharp). Kept separate from /api/artifacts/[id] so a broken
 * sharp install in packaged desktop cannot 500 the original image route.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const row = getArtifact(id);
    if (!row || row.type !== "image") {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const absPath = resolveDataPath(row.uri);
    if (!fs.existsSync(absPath)) {
      return NextResponse.json(
        { ok: false, error: "File missing on disk" },
        { status: 404 },
      );
    }

    try {
      const { getOrCreateImageThumb } = await import(
        "@/lib/server/artifact-thumb"
      );
      const thumb = await getOrCreateImageThumb(id, absPath);
      const buf = new Uint8Array(fs.readFileSync(thumb.absPath));
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": thumb.mime,
          "Cache-Control": "private, max-age=604800, immutable",
          "Content-Length": String(buf.byteLength),
        },
      });
    } catch {
      // Fallback: serve original when sharp optional deps are missing.
      const buf = new Uint8Array(fs.readFileSync(absPath));
      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": row.mime ?? "application/octet-stream",
          "Cache-Control": "private, max-age=60",
          "Content-Length": String(buf.byteLength),
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
