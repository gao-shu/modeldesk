import { NextResponse } from "next/server";
import { z } from "zod";
import { isCloudStorageProvider } from "@modeldesk/object-storage";
import {
  deleteObjectStorageConfig,
  getObjectStorageConfigPublic,
  listObjectStorageConfigs,
  upsertObjectStorageConfig,
} from "@/lib/server/object-storage-configs";
import {
  getObjectStoragePrefs,
  setObjectStoragePrefs,
} from "@/lib/server/object-storage-prefs";
import {
  getObjectStorageRuntimeStatus,
  resetObjectStorageCache,
} from "@/lib/server/tos";

export const runtime = "nodejs";

const configSchema = z.object({
  bucket: z.string().optional(),
  region: z.string().optional(),
  endpoint: z.string().optional(),
  accessKey: z.string().nullable().optional(),
  secretKey: z.string().nullable().optional(),
  publicBaseUrl: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
  skipAcl: z.boolean().optional(),
});

const putSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().trim().min(1).optional(),
  config: configSchema.optional(),
  /** Wipe saved credentials for the target provider. */
  clearConfig: z.boolean().optional(),
});

export async function GET() {
  try {
    const prefs = getObjectStoragePrefs();
    return NextResponse.json({
      ok: true,
      objectStorage: getObjectStorageRuntimeStatus(),
      config: getObjectStorageConfigPublic(prefs.provider),
      configs: listObjectStorageConfigs(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = putSchema.parse(await request.json());
    if (
      body.enabled === undefined &&
      body.provider === undefined &&
      body.config === undefined &&
      !body.clearConfig
    ) {
      return NextResponse.json(
        { ok: false, error: "缺少 enabled / provider / config" },
        { status: 400 },
      );
    }

    const current = getObjectStoragePrefs();
    const nextProvider = body.provider ?? current.provider;
    if (!isCloudStorageProvider(nextProvider)) {
      return NextResponse.json(
        {
          ok: false,
          error: "provider 须为 tos | s3 | oss | cos | bos",
        },
        { status: 400 },
      );
    }

    const nextEnabled = body.enabled ?? current.enabled;
    const prefs = setObjectStoragePrefs({
      enabled: nextEnabled,
      provider: nextProvider,
    });

    if (body.clearConfig) {
      deleteObjectStorageConfig(nextProvider);
    }

    let config = getObjectStorageConfigPublic(nextProvider);
    if (body.config && !body.clearConfig) {
      config = upsertObjectStorageConfig(nextProvider, body.config);
    }

    resetObjectStorageCache();
    return NextResponse.json({
      ok: true,
      prefs,
      config,
      configs: listObjectStorageConfigs(),
      objectStorage: getObjectStorageRuntimeStatus(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: error.issues[0]?.message ?? "Invalid body" },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("ENCRYPTION_SECRET")) {
      return NextResponse.json(
        { ok: false, error: "请先在设置页生成加密密钥" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
