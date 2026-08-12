import {
  createTosStorageFromEnv,
  type TosStorage,
} from "@modeldesk/tos-storage";
import type {
  EnsurePublicUrlOpts,
  MediaKind,
  ObjectStorage,
  UploadInput,
  UploadResult,
} from "./types";

function adaptTos(tos: TosStorage): ObjectStorage {
  async function mapUpload(
    result: Awaited<ReturnType<TosStorage["uploadBytes"]>>,
  ): Promise<UploadResult> {
    return {
      bucket: result.bucket,
      key: result.key,
      kind: result.kind,
      mime: result.mime,
      uri: result.tosUri,
      tosUri: result.tosUri,
      publicUrl: result.publicUrl,
      url: result.url,
    };
  }

  return {
    provider: "tos",
    isConfigured: () => true,
    uploadBytes: async (input: UploadInput) =>
      mapUpload(await tos.uploadBytes(input)),
    uploadFile: async (file, kind?: MediaKind) =>
      mapUpload(await tos.uploadFile(file, kind)),
    ensurePublicUrl: (value, opts?: EnsurePublicUrlOpts) =>
      tos.ensurePublicUrl(value, opts),
  };
}

/** Wrap env-based TOS; null when TOS_* incomplete. */
export function createTosObjectStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStorage | null {
  const tos = createTosStorageFromEnv(env);
  if (!tos) return null;
  return adaptTos(tos);
}
