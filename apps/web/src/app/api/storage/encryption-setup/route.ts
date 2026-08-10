import { NextResponse } from "next/server";
import {
  generateEncryptionSecretIfMissing,
  getEncryptionSecretStatus,
} from "@/lib/server/encryption-secret";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = getEncryptionSecretStatus();
    return NextResponse.json({
      ok: true,
      configured: status.configured,
      source: status.source,
      filePath: status.filePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Generate data-dir secret when missing (idempotent; never rotates). */
export async function POST() {
  try {
    const result = generateEncryptionSecretIfMissing();
    return NextResponse.json({
      ok: true,
      created: result.created,
      configured: true,
      source: result.source,
      filePath: result.filePath,
      message: result.created
        ? "已生成加密密钥（保存在数据目录）"
        : "加密密钥已存在，未改动",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
