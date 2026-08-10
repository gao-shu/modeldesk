"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { radarGet, type RadarModelListItem } from "@/lib/client/radar-api";

type ProbeReportLite = {
  result?: string;
  overall?: string | { label?: string; status?: string };
  message?: string;
  score?: number;
  probeVersion?: string;
  requestedModel?: string;
  endpoint?: string;
  dimensions?: {
    id?: string;
    name?: string;
    title?: string;
    status?: string;
    summary?: string;
  }[];
  latencyMs?: number;
  httpStatus?: number | null;
  [key: string]: unknown;
};

function authenticityHero(
  overallRaw: string | undefined,
  score?: number,
): {
  glyph: string;
  label: string;
  tone: "ok" | "warn" | "bad" | "mute";
  probability: number | null;
} {
  const overall = overallRaw || "inconclusive";
  const map: Record<
    string,
    { glyph: string; label: string; tone: "ok" | "warn" | "bad" | "mute"; fallback: number | null }
  > = {
    likely_genuine: { glyph: "✓", label: "倾向真货", tone: "ok", fallback: 85 },
    suspicious: { glyph: "!", label: "存疑", tone: "warn", fallback: 45 },
    likely_fake: { glyph: "✗", label: "高度可疑", tone: "bad", fallback: 15 },
    unreachable: { glyph: "—", label: "无法检测", tone: "mute", fallback: null },
    inconclusive: { glyph: "!", label: "无法判定", tone: "warn", fallback: null },
  };
  const row = map[overall] ?? map.inconclusive!;
  let probability: number | null = null;
  if (overall === "unreachable") {
    probability = null;
  } else if (typeof score === "number" && Number.isFinite(score)) {
    probability = Math.max(0, Math.min(100, Math.round(score)));
  } else {
    probability = row.fallback;
  }
  return {
    glyph: row.glyph,
    label: row.label,
    tone: row.tone,
    probability,
  };
}

const TONE_CLASS: Record<"ok" | "warn" | "bad" | "mute", string> = {
  ok: "border-emerald-300 bg-emerald-50 text-emerald-800",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  bad: "border-red-300 bg-red-50 text-red-800",
  mute: "border-zinc-300 bg-zinc-50 text-zinc-600",
};

export function VerifyClient() {
  const search = useSearchParams();
  const hint = search.get("hint") || "";
  const prefillName = search.get("name")?.trim() || "";
  const prefillBaseUrl = search.get("baseUrl")?.trim() || "";
  const prefillModelId =
    search.get("modelId")?.trim() || search.get("model")?.trim() || "";
  const prefillConfigId = search.get("configId")?.trim() || "";
  const keyMasked = search.get("keyMasked")?.trim() || "";

  const [baseUrl, setBaseUrl] = useState(
    () => prefillBaseUrl || "https://api.openai.com/v1",
  );
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(
    () => prefillModelId || "deepseek-v4-pro",
  );
  const [mode, setMode] = useState<"standard" | "deep">("standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ProbeReportLite | null>(null);
  const [models, setModels] = useState<RadarModelListItem[]>([]);
  const [modelsErr, setModelsErr] = useState<string | null>(null);

  const canUseStoredKey = Boolean(prefillConfigId && keyMasked);

  useEffect(() => {
    if (prefillBaseUrl) setBaseUrl(prefillBaseUrl);
    if (prefillModelId) setModel(prefillModelId);
  }, [prefillBaseUrl, prefillModelId]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await radarGet<{
          items: RadarModelListItem[];
        }>("/api/v1/models?pageSize=50");
        setModels(data.items);
        setModelsErr(null);
      } catch (e) {
        setModelsErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/verify/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          model,
          mode,
          apiKey: apiKey.trim() || undefined,
          configId: prefillConfigId || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        report?: ProbeReportLite;
        error?: string;
      };
      if (!data.ok || !data.report) {
        setError(data.error ?? "测试失败");
        return;
      }
      setReport(data.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const overallStatus =
    typeof report?.overall === "string"
      ? report.overall
      : report?.overall && typeof report.overall === "object"
        ? report.overall.status || report.overall.label
        : undefined;

  const hero = report
    ? authenticityHero(
        overallStatus,
        typeof report.score === "number" ? report.score : undefined,
      )
    : null;

  return (
    <div className="space-y-6">
      {prefillConfigId || prefillBaseUrl || prefillModelId || prefillName ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          已从模型配置带入
          {prefillName ? (
            <>
              「<span className="font-medium text-zinc-800">{prefillName}</span>」
            </>
          ) : null}
          的接口地址 / 模型
          {canUseStoredKey ? (
            <>
              ；密钥显示为{" "}
              <span className="font-mono text-zinc-800">{keyMasked}</span>
              ，留空将使用已保存的密钥（不会自动探测）。
            </>
          ) : (
            <>，请填写密钥后手动点「开始测试」（不会自动探测）。</>
          )}
        </p>
      ) : hint ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          来自链接预填：
          <span className="font-medium text-zinc-800">{hint}</span>
          （请自行填写该站的接口地址与密钥）
        </p>
      ) : null}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-zinc-500">接口地址</span>
            <input
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-zinc-500">密钥</span>
            <input
              required={!canUseStoredKey}
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              placeholder={
                canUseStoredKey
                  ? `${keyMasked}（留空=用已保存密钥）`
                  : "sk-…"
              }
              autoComplete="off"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-zinc-500">模型</span>
            <input
              required
              list="radar-model-ids"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            />
            <datalist id="radar-model-ids">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </datalist>
            {modelsErr ? (
              <span className="mt-1 block text-[11px] text-amber-700">
                模型列表未加载：{modelsErr}
              </span>
            ) : null}
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-zinc-500">模式</span>
            <select
              value={mode}
              onChange={(e) =>
                setMode(e.target.value === "deep" ? "deep" : "standard")
              }
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
            >
              <option value="standard">快速</option>
              <option value="deep">更全面</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy ? "测试中…" : "开始测试"}
          </button>
          <p className="text-xs text-zinc-400">
            Key 仅在本机用于出站探测，不写入榜单。内网地址默认拒绝。
          </p>
        </div>
      </form>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {report && hero ? (
        <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
          <div
            className={`flex flex-col items-center justify-center rounded-xl border px-5 py-6 text-center ${TONE_CLASS[hero.tone]}`}
          >
            <div className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">
              {hero.glyph}
            </div>
            <div className="mt-3 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
              {hero.probability == null ? "—" : `${hero.probability}%`}
            </div>
            <div className="mt-1.5 text-sm font-medium opacity-80">真货概率</div>
            <div className="mt-3 text-base font-semibold">{hero.label}</div>
            {report.message ? (
              <p className="mt-2 max-w-xl text-sm leading-relaxed opacity-90">
                {report.message}
              </p>
            ) : null}
          </div>

          {(typeof report.latencyMs === "number" ||
            typeof report.httpStatus === "number" ||
            report.endpoint) && (
            <div className="space-y-1 text-sm text-zinc-600">
              {typeof report.latencyMs === "number" ? (
                <p>
                  延迟{" "}
                  <span className="font-semibold tabular-nums text-zinc-800">
                    {report.latencyMs}
                  </span>{" "}
                  毫秒
                  {typeof report.httpStatus === "number" ? (
                    <span className="ml-3 text-zinc-500">
                      状态码 {report.httpStatus}
                    </span>
                  ) : null}
                </p>
              ) : null}
              {report.endpoint ? (
                <p className="break-all text-xs text-zinc-500">{report.endpoint}</p>
              ) : null}
            </div>
          )}

          {Array.isArray(report.dimensions) && report.dimensions.length > 0 ? (
            <ul className="divide-y divide-zinc-100 rounded border border-zinc-100">
              {report.dimensions.map((d, i) => (
                <li key={d.id || i} className="px-3 py-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <span className="font-medium text-zinc-800">
                      {d.title || d.name || d.id || `dim-${i}`}
                    </span>
                    {d.status ? (
                      <span className="text-xs text-zinc-500">{d.status}</span>
                    ) : null}
                  </div>
                  {d.summary ? (
                    <p className="mt-1 text-xs text-zinc-500">{d.summary}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/models?name=${encodeURIComponent(hint || prefillName || "verified-endpoint")}&baseUrl=${encodeURIComponent(baseUrl)}&modelId=${encodeURIComponent(model)}`}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              去模型配置添加此接口地址
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
