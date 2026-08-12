import fs from "node:fs";
import path from "node:path";
import { ensureDataDirs, resolveDataPath } from "./paths";

const THUMB_SIZE = 360;

/** Disk-cached WebP thumbnail for gallery grids (avoids shipping multi‑MB originals). */
export async function getOrCreateImageThumb(
  artifactId: string,
  sourceAbsPath: string,
): Promise<{ absPath: string; mime: string }> {
  ensureDataDirs();
  const thumbRel = `artifacts/thumbs/${artifactId}-${THUMB_SIZE}.webp`;
  const thumbAbs = resolveDataPath(thumbRel);
  if (fs.existsSync(thumbAbs)) {
    return { absPath: thumbAbs, mime: "image/webp" };
  }
  fs.mkdirSync(path.dirname(thumbAbs), { recursive: true });
  // Dynamic import: packaged desktop engines may lack sharp optional deps;
  // callers must not fail serving the original when thumbs are unavailable.
  const sharp = (await import("sharp")).default;
  await sharp(sourceAbsPath)
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(thumbAbs);
  return { absPath: thumbAbs, mime: "image/webp" };
}
