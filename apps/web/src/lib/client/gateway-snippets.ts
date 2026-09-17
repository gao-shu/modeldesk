/** Shared Gateway copy snippets for Settings / Use this model. */

export const GATEWAY_V1_BASE = "http://127.0.0.1:3300/v1";

export type GatewaySnippetLang = "curl" | "python" | "java";

export type UseModelSnippetInput = {
  /** Registry id or Gateway alias — must be a real configured id. */
  model: string;
  modality: "text" | "image" | "audio" | "video" | string;
  /** Optional sample prompt; defaults to a short placeholder. */
  prompt?: string;
};

function escJson(s: string): string {
  return JSON.stringify(s);
}

function samplePrompt(modality: string, prompt?: string): string {
  const p = prompt?.trim();
  if (p) return p.length > 120 ? `${p.slice(0, 117)}...` : p;
  if (modality === "image") return "a red cube on a table";
  if (modality === "audio") return "Hello from ModelDesk";
  if (modality === "video") return "a calm ocean at sunset";
  return "Hello from ModelDesk";
}

/** Settings-page style curl helpers (aliases / chat / image / env). */
export function gatewaySettingsSnippets(dataDir: string) {
  const dataDirPosix = dataDir.replace(/\\/g, "/");
  const aliases = `curl -s -X PUT http://127.0.0.1:3300/v1/aliases \\
  -H "Content-Type: application/json" \\
  -d "{\\"llm-default\\":\\"<text-registry-id>\\",\\"image-default\\":\\"<image-registry-id>\\"}"`;
  const chat = `curl -s http://127.0.0.1:3300/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d "{\\"model\\":\\"llm-default\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"hi\\"}]}"`;
  const image = `curl -s http://127.0.0.1:3300/v1/images/generations \\
  -H "Content-Type: application/json" \\
  -d "{\\"model\\":\\"image-default\\",\\"prompt\\":\\"a cat\\"}"`;
  const client = `import { createGatewayClient } from "@modeldesk/gateway-client";

const md = createGatewayClient(); // 默认 http://127.0.0.1:3300
// 可选: token: process.env.MODELDESK_GATEWAY_TOKEN

await md.chatCompletions({
  model: "llm-default",
  messages: [{ role: "user", content: "hi" }],
});
await md.imagesGenerations({
  model: "image-default",
  prompt: "a cat",
});`;
  const env = `# 默认：打开 Web/桌面后直接调 :3300/v1（无需另起进程）
# 数据目录（须与本页一致）: ${dataDirPosix}
# 可选口令: MODELDESK_GATEWAY_TOKEN
# 可选无头（仅 API、不开 UI）: modeldesk-gateway → :3310`;
  return { aliases, chat, image, client, env };
}

/**
 * Build curl / Python / Java for a concrete model via local Gateway.
 * Paths match packages/run-core gateway routes.
 */
export function buildUseModelSnippets(input: UseModelSnippetInput): Record<
  GatewaySnippetLang,
  string
> {
  const model = input.model.trim() || "<model-id>";
  const prompt = samplePrompt(input.modality, input.prompt);
  const modality = input.modality;

  if (modality === "image") {
    const body = `{"model":${escJson(model)},"prompt":${escJson(prompt)}}`;
    return {
      curl: `curl -s ${GATEWAY_V1_BASE}/images/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer local" \\
  -d ${escJson(body)}`,
      python: `from openai import OpenAI

client = OpenAI(base_url="${GATEWAY_V1_BASE}", api_key="local")
result = client.images.generate(model=${escJson(model)}, prompt=${escJson(prompt)})
print(result)`,
      java: `// Java 11+ HttpClient → ModelDesk OpenAI-compatible Gateway
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

String body = ${escJson(body)};
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("${GATEWAY_V1_BASE}/images/generations"))
    .header("Content-Type", "application/json")
    .header("Authorization", "Bearer local")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();
HttpResponse<String> res = HttpClient.newHttpClient()
    .send(req, HttpResponse.BodyHandlers.ofString());
System.out.println(res.body());`,
    };
  }

  if (modality === "audio") {
    const body = `{"model":${escJson(model)},"input":${escJson(prompt)},"voice":"alloy"}`;
    return {
      curl: `curl -s ${GATEWAY_V1_BASE}/audio/speech \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer local" \\
  -d ${escJson(body)} \\
  --output speech.mp3`,
      python: `from openai import OpenAI

client = OpenAI(base_url="${GATEWAY_V1_BASE}", api_key="local")
with client.audio.speech.with_streaming_response.create(
    model=${escJson(model)},
    voice="alloy",
    input=${escJson(prompt)},
) as response:
    response.stream_to_file("speech.mp3")`,
      java: `// Java 11+ HttpClient → POST /v1/audio/speech
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;

String body = ${escJson(body)};
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("${GATEWAY_V1_BASE}/audio/speech"))
    .header("Content-Type", "application/json")
    .header("Authorization", "Bearer local")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();
HttpResponse<byte[]> res = HttpClient.newHttpClient()
    .send(req, HttpResponse.BodyHandlers.ofByteArray());
Files.write(Path.of("speech.mp3"), res.body());`,
    };
  }

  if (modality === "video") {
    const body = `{"model":${escJson(model)},"prompt":${escJson(prompt)}}`;
    return {
      curl: `# Submit (async) then poll GET ${GATEWAY_V1_BASE}/videos/{id}
curl -s ${GATEWAY_V1_BASE}/videos/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer local" \\
  -d ${escJson(body)}`,
      python: `import json, time, urllib.request

base = "${GATEWAY_V1_BASE}"
req = urllib.request.Request(
    f"{base}/videos/generations",
    data=${escJson(body)}.encode(),
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer local",
    },
    method="POST",
)
with urllib.request.urlopen(req) as r:
    task = json.load(r)
print(task)
# Poll: GET {base}/videos/{task['id']} until completed`,
      java: `// Java 11+ — submit video task then poll GET /v1/videos/{id}
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

String body = ${escJson(body)};
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("${GATEWAY_V1_BASE}/videos/generations"))
    .header("Content-Type", "application/json")
    .header("Authorization", "Bearer local")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();
HttpResponse<String> res = HttpClient.newHttpClient()
    .send(req, HttpResponse.BodyHandlers.ofString());
System.out.println(res.body());
// Then poll: GET ${GATEWAY_V1_BASE}/videos/{id}`,
    };
  }

  // text (default)
  const chatBody = `{"model":${escJson(model)},"messages":[{"role":"user","content":${escJson(prompt)}}]}`;
  return {
    curl: `curl -s ${GATEWAY_V1_BASE}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer local" \\
  -d ${escJson(chatBody)}`,
    python: `from openai import OpenAI

client = OpenAI(base_url="${GATEWAY_V1_BASE}", api_key="local")
resp = client.chat.completions.create(
    model=${escJson(model)},
    messages=[{"role": "user", "content": ${escJson(prompt)}}],
)
print(resp.choices[0].message.content)`,
    java: `// Java 11+ HttpClient → ModelDesk OpenAI-compatible Gateway
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

String body = ${escJson(chatBody)};
HttpRequest req = HttpRequest.newBuilder()
    .uri(URI.create("${GATEWAY_V1_BASE}/chat/completions"))
    .header("Content-Type", "application/json")
    .header("Authorization", "Bearer local")
    .POST(HttpRequest.BodyPublishers.ofString(body))
    .build();
HttpResponse<String> res = HttpClient.newHttpClient()
    .send(req, HttpResponse.BodyHandlers.ofString());
System.out.println(res.body());`,
  };
}
