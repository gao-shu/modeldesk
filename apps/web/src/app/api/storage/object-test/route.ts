import { NextResponse } from "next/server";
import {
  getObjectStorage,
  isObjectStorageConfigured,
  uploadBytesToObjectStorage,
} from "@/lib/server/tos";

export const runtime = "nodejs";

/** 1x1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Smoke-test the configured object-storage driver:
 * upload a tiny PNG, then GET the public URL.
 */
export async function POST() {
  try {
    const storage = getObjectStorage();
    if (!isObjectStorageConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          provider: storage.provider,
          configured: false,
          error:
            storage.provider === "none"
              ? "未启用对象存储"
              : "密钥未配齐，请先保存配置",
        },
        { status: 503 },
      );
    }

    const uploaded = await uploadBytesToObjectStorage({
      bytes: TINY_PNG,
      mime: "image/png",
      filename: "object-storage-smoke.png",
      kind: "image",
    });

    let fetchStatus: number | null = null;
    let fetchOk = false;
    let fetchError: string | null = null;
    try {
      const res = await fetch(uploaded.url, {
        method: "GET",
        signal: AbortSignal.timeout(15_000),
      });
      fetchStatus = res.status;
      fetchOk = res.status === 200;
      if (!fetchOk) {
        fetchError = `公网 URL 返回 HTTP ${res.status}（检查 ACL / 桶策略 / PUBLIC_BASE_URL）`;
      }
    } catch (e) {
      fetchError = e instanceof Error ? e.message : String(e);
    }

    const ok = fetchOk;
    return NextResponse.json(
      {
        ok,
        provider: storage.provider,
        configured: true,
        key: uploaded.key,
        url: uploaded.url,
        fetchStatus,
        fetchOk,
        error: ok ? null : fetchError,
        message: ok
          ? `上传并访问成功（${storage.provider}）`
          : fetchError ?? "上传成功但公网访问失败",
      },
      { status: ok ? 200 : 502 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "测试失败";
    return NextResponse.json(
      {
        ok: false,
        provider: getObjectStorage().provider,
        configured: isObjectStorageConfigured(),
        error: message,
      },
      { status: 500 },
    );
  }
}
