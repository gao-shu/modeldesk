/**
 * Offline smoke: verify Seedance 中转 multipart fields (no network).
 * Run: node packages/adapters/scripts/smoke-seedance-relay-form.mjs
 */

function isHttpUrl(v) {
  return /^https?:\/\//i.test(String(v).trim());
}

function redactUrlValue(v) {
  return v.startsWith("data:") || v.length > 120
    ? `[omitted ${v.length} chars]`
    : v;
}

function parseVideoDataUri(s) {
  const m = /^data:([^;,]+);base64,(.+)$/i.exec(s.trim());
  if (!m) return null;
  try {
    return { mime: m[1].trim(), bytes: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

function videoMimeToExt(mime) {
  const m = mime.split(";")[0].trim().toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  return "jpg";
}

function appendSeedanceRelayInputReference(form, ref, logRefs) {
  const trimmed = ref.trim();
  if (!trimmed) return;
  if (isHttpUrl(trimmed)) {
    form.append("input_reference", trimmed);
    logRefs.push(trimmed);
    return;
  }
  const parsed = parseVideoDataUri(trimmed);
  if (parsed) {
    const filename = `reference-${logRefs.length}.${videoMimeToExt(parsed.mime)}`;
    form.append(
      "input_reference",
      new Blob([parsed.bytes], { type: parsed.mime }),
      filename,
    );
    logRefs.push(`[file ${filename}]`);
    return;
  }
  form.append("input_reference", trimmed);
  logRefs.push(redactUrlValue(trimmed));
}

/** Mirrors packages/adapters/src/video.ts buildSeedanceRelayForm */
function buildSeedanceRelayForm(opts) {
  const multi = (opts.referenceImages ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 9);
  const first = opts.referenceImage?.trim();
  const last = opts.referenceImageEnd?.trim();

  if (multi.length > 0 && (first || last)) {
    throw new Error("互斥");
  }

  const hasRefs = multi.length > 0 || Boolean(first) || Boolean(last);

  const form = new FormData();
  form.append("model", opts.model);
  form.append("prompt", opts.prompt);
  form.append("seconds", String(opts.seconds));
  form.append("size", opts.size);
  form.append("generate_audio", opts.withAudio === true ? "true" : "false");
  const ratio = opts.aspectRatio?.trim();
  if (ratio) form.append("aspect_ratio", ratio);
  if (hasRefs) {
    form.append("confirm_no_human_reference", "true");
  }

  const logBody = {
    model: opts.model,
    prompt: opts.prompt,
    seconds: String(opts.seconds),
    size: opts.size,
    generate_audio: opts.withAudio === true ? "true" : "false",
    _multipart: true,
    ...(ratio ? { aspect_ratio: ratio } : {}),
    ...(hasRefs ? { confirm_no_human_reference: "true" } : {}),
  };

  const logRefs = [];
  if (multi.length > 0) {
    for (const ref of multi) {
      appendSeedanceRelayInputReference(form, ref, logRefs);
    }
  } else {
    if (first) appendSeedanceRelayInputReference(form, first, logRefs);
    if (last) appendSeedanceRelayInputReference(form, last, logRefs);
  }

  if (logRefs.length > 0) {
    logBody.input_reference = logRefs.length === 1 ? logRefs[0] : logRefs;
  }

  return { form, logBody };
}

function dump(form) {
  const out = {};
  for (const [k, v] of form.entries()) {
    const val = typeof v === "string" ? v : "[Blob]";
    if (out[k] === undefined) out[k] = val;
    else if (Array.isArray(out[k])) out[k].push(val);
    else out[k] = [out[k], val];
  }
  return out;
}

const checks = [];
function assert(name, cond, detail = "") {
  checks.push({ name, ok: !!cond });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

{
  const { form } = buildSeedanceRelayForm({
    model: "seedance-2.0-mini",
    prompt: "boat",
    seconds: 5,
    size: "1280x720",
    withAudio: false,
  });
  const f = dump(form);
  assert("文生无 input_reference", form.getAll("input_reference").length === 0);
  assert("文生无 confirm", form.get("confirm_no_human_reference") == null);
  assert("文生 seconds=5", form.get("seconds") === "5");
  assert("文生 size=1280x720", form.get("size") === "1280x720");
  assert("文生 generate_audio=false", form.get("generate_audio") === "false");
  assert(
    "文生无 reference_image_urls",
    !("reference_image_urls" in f) && !("reference_image_urls[]" in f),
  );
}

{
  const url = "https://example.com/first.jpg";
  const { form, logBody } = buildSeedanceRelayForm({
    model: "seedance-2.0-mini",
    prompt: "x",
    seconds: 5,
    size: "1280x720",
    withAudio: false,
    referenceImage: url,
  });
  const refs = form.getAll("input_reference");
  assert("首帧 input_reference ×1", refs.length === 1 && refs[0] === url);
  assert("首帧 confirm=true", form.get("confirm_no_human_reference") === "true");
  assert("首帧 log.input_reference", logBody.input_reference === url);
}

{
  const { form } = buildSeedanceRelayForm({
    model: "seedance-2.0-mini",
    prompt: "x",
    seconds: 5,
    size: "1280x720",
    withAudio: false,
    referenceImage: "https://a/1.jpg",
    referenceImageEnd: "https://a/2.jpg",
  });
  const refs = form.getAll("input_reference");
  assert(
    "首尾帧 input_reference ×2",
    refs.length === 2 &&
      refs[0] === "https://a/1.jpg" &&
      refs[1] === "https://a/2.jpg",
  );
}

{
  const urls = [
    "https://tos.example/scene.jpg",
    "https://tos.example/char.jpg",
  ];
  const { form, logBody } = buildSeedanceRelayForm({
    model: "seedance-2.0-mini",
    prompt: "@Image1 @Image2",
    seconds: 5,
    size: "1280x720",
    aspectRatio: "16:9",
    withAudio: false,
    referenceImages: urls,
  });
  const f = dump(form);
  const refs = form.getAll("input_reference");
  assert(
    "多参 input_reference ×2",
    refs.length === 2 && refs[0] === urls[0] && refs[1] === urls[1],
  );
  assert(
    "多参不用 reference_image_urls",
    !("reference_image_urls" in f) && !("reference_image_urls[]" in f),
  );
  assert("多参 confirm=true", form.get("confirm_no_human_reference") === "true");
  assert("多参 aspect_ratio", form.get("aspect_ratio") === "16:9");
  assert(
    "多参 log 是数组",
    Array.isArray(logBody.input_reference) &&
      logBody.input_reference.length === 2,
  );
  console.log("\n多参实际字段:");
  console.log(JSON.stringify(f, null, 2));
}

const failed = checks.filter((c) => !c.ok).length;
console.log(
  `\n=== SUMMARY: ${checks.length - failed}/${checks.length} passed ===`,
);
process.exit(failed ? 1 : 0);
