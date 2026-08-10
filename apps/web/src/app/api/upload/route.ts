import { NextResponse } from "next/server";
import type { MediaKind } from "@modeldesk/object-storage";
import { TEMP_PREFIX_BY_KIND } from "@modeldesk/object-storage";
import {
  getObjectStorage,
  getObjectStorageRuntimeStatus,
  isObjectStorageConfigured,
  uploadBytesToObjectStorage,
  uploadFileToObjectStorage,
} from "@/lib/server/tos";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

function parseKind(raw: FormDataEntryValue | string | null): MediaKind | undefined {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "image" || v === "video" || v === "voice") return v;
  return undefined;
}

export async function GET() {
  const runtime = getObjectStorageRuntimeStatus();
  return NextResponse.json({
    ok: true,
    provider: runtime.provider,
    configured: runtime.configured,
    enabled: runtime.enabled,
    selectedProvider: runtime.selectedProvider,
    /** @deprecated Prefer `configured` */
    tosConfigured: runtime.configured,
    prefixes: {
      image: `${TEMP_PREFIX_BY_KIND.image}/`,
      video: `${TEMP_PREFIX_BY_KIND.video}/`,
      voice: `${TEMP_PREFIX_BY_KIND.voice}/`,
    },
  });
}

export async function POST(req: Request) {
  try {
    if (!isObjectStorageConfigured()) {
      const provider = getObjectStorage().provider;
      return NextResponse.json(
        {
          ok: false,
          provider,
          error:
            provider === "none"
              ? "对象存储未启用。请到「系统设置」打开开关并配置提供商。"
              : "对象存储未就绪。请到「系统设置」填写并保存密钥。",
        },
        { status: 503 },
      );
    }

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const kind = parseKind(form.get("kind"));
      if (!(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "缺少 file 字段" },
          { status: 400 },
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { ok: false, error: "文件不能超过 20MB" },
          { status: 400 },
        );
      }
      const uploaded = await uploadFileToObjectStorage(file, kind);
      return NextResponse.json({ ok: true, ...uploaded });
    }

    const body = (await req.json()) as {
      dataUrl?: string;
      kind?: string;
      filename?: string;
    };
    const dataUrl = body.dataUrl?.trim() ?? "";
    if (!dataUrl.startsWith("data:")) {
      return NextResponse.json(
        { ok: false, error: "需要 data:...;base64,... 或 multipart file" },
        { status: 400 },
      );
    }
    const m = /^data:([\w/+.-]+);base64,(.+)$/i.exec(dataUrl);
    if (!m) {
      return NextResponse.json(
        { ok: false, error: "无效的 data URI" },
        { status: 400 },
      );
    }
    const bytes = Buffer.from(m[2]!, "base64");
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "文件不能超过 20MB" },
        { status: 400 },
      );
    }
    const uploaded = await uploadBytesToObjectStorage({
      bytes,
      mime: m[1]!,
      filename: body.filename,
      kind: parseKind(body.kind ?? null),
    });
    return NextResponse.json({ ok: true, ...uploaded });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传失败";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
