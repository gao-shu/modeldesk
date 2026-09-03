/**
 * Normalize media reference lists from gateway / desk params.
 * Accepts string URLs, JSON string arrays, or OpenAI-shaped `{ url }` objects.
 */

function pushMediaUrl(out: string[], value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    out.push(value.trim());
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) pushMediaUrl(out, item);
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if (typeof obj.url === "string" && obj.url.trim()) {
    out.push(obj.url.trim());
    return;
  }
  if (typeof obj.image_url === "string" && obj.image_url.trim()) {
    out.push(obj.image_url.trim());
    return;
  }
  if (
    obj.image_url &&
    typeof obj.image_url === "object" &&
    !Array.isArray(obj.image_url)
  ) {
    const nested = obj.image_url as Record<string, unknown>;
    if (typeof nested.url === "string" && nested.url.trim()) {
      out.push(nested.url.trim());
    }
    return;
  }
  if (typeof obj.audio_url === "string" && obj.audio_url.trim()) {
    out.push(obj.audio_url.trim());
    return;
  }
  if (
    obj.audio_url &&
    typeof obj.audio_url === "object" &&
    !Array.isArray(obj.audio_url)
  ) {
    const nested = obj.audio_url as Record<string, unknown>;
    if (typeof nested.url === "string" && nested.url.trim()) {
      out.push(nested.url.trim());
    }
  }
}

/** Flatten string | {url} | JSON-array-string into unique URL list. */
export function coerceMediaUrlList(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      return coerceMediaUrlList(JSON.parse(value.trim()) as unknown);
    } catch {
      const t = value.trim();
      return t ? [t] : [];
    }
  }
  const out: string[] = [];
  pushMediaUrl(out, value);
  return [...new Set(out)];
}
