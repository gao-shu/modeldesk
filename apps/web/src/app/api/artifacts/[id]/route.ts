import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getArtifact } from "@/lib/server/artifacts";
import { resolveDataPath } from "@/lib/server/paths";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function parseRange(
  rangeHeader: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const spec = rangeHeader.slice("bytes=".length).split(",")[0]?.trim();
  if (!spec) return null;
  const [startRaw, endRaw] = spec.split("-", 2);
  let start = startRaw === "" ? NaN : Number(startRaw);
  let end = endRaw === "" || endRaw == null ? NaN : Number(endRaw);

  if (Number.isNaN(start) && !Number.isNaN(end)) {
    // suffix: bytes=-N
    start = Math.max(0, size - end);
    end = size - 1;
  } else if (!Number.isNaN(start) && Number.isNaN(end)) {
    end = size - 1;
  }

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }
  end = Math.min(end, size - 1);
  return { start, end };
}

function fileWebStream(
  absPath: string,
  options?: { start?: number; end?: number },
): ReadableStream {
  const nodeStream = fs.createReadStream(absPath, options);
  return Readable.toWeb(nodeStream) as ReadableStream;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const row = getArtifact(id);
    if (!row) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const absPath = resolveDataPath(row.uri);
    if (!fs.existsSync(absPath)) {
      return NextResponse.json(
        { ok: false, error: "File missing on disk" },
        { status: 404 },
      );
    }

    // Thumbnails live at /api/artifacts/[id]/thumb — do not import sharp here.
    // Packaged desktop engines have broken sharp (@img/*) which would 500 this route.

    const stat = fs.statSync(absPath);
    const size = stat.size;
    const mime = row.mime ?? "application/octet-stream";
    const ext = path.extname(absPath) || "";
    const filename = `${id}${ext}`;
    const range = parseRange(request.headers.get("range"), size);
    const asDownload =
      request.nextUrl.searchParams.get("download") === "1" ||
      request.nextUrl.searchParams.get("download") === "true";

    const baseHeaders: Record<string, string> = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": asDownload
        ? `attachment; filename="${filename}"`
        : `inline; filename="${filename}"`,
    };

    // Prefer buffered body for media/text — WebView2 often hangs on streamed
    // bodies (audio metadata never loads; gallery text fetch stays pending).
    const preferBuffer =
      row.type === "image" ||
      row.type === "audio" ||
      row.type === "music" ||
      row.type === "text" ||
      row.type === "video";
    const maxBufferBytes =
      row.type === "video" || row.type === "music"
        ? 96 * 1024 * 1024
        : 32 * 1024 * 1024;

    if (!range && preferBuffer && size <= maxBufferBytes) {
      // Uint8Array: Next/WebView2 is more reliable than passing Node Buffer.
      const buf = new Uint8Array(fs.readFileSync(absPath));
      return new NextResponse(buf, {
        status: 200,
        headers: {
          ...baseHeaders,
          "Content-Length": String(buf.byteLength),
        },
      });
    }

    if (!range) {
      return new NextResponse(fileWebStream(absPath), {
        status: 200,
        headers: {
          ...baseHeaders,
          "Content-Length": String(size),
        },
      });
    }

    const { start, end } = range;
    const chunkSize = end - start + 1;
    // Buffer ranged chunks too — WebView2 audio often requests Range and
    // hangs if the 206 body is a Node stream.
    if (preferBuffer && chunkSize <= maxBufferBytes) {
      const fd = fs.openSync(absPath, "r");
      try {
        const buf = new Uint8Array(chunkSize);
        fs.readSync(fd, buf, 0, chunkSize, start);
        return new NextResponse(buf, {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Length": String(chunkSize),
            "Content-Range": `bytes ${start}-${end}/${size}`,
          },
        });
      } finally {
        fs.closeSync(fd);
      }
    }

    return new NextResponse(fileWebStream(absPath, { start, end }), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${size}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
