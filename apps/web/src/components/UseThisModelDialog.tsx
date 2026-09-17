"use client";

import { useMemo, useState } from "react";
import {
  buildUseModelSnippets,
  GATEWAY_V1_BASE,
  type GatewaySnippetLang,
} from "@/lib/client/gateway-snippets";

const LANGS: { id: GatewaySnippetLang; label: string }[] = [
  { id: "curl", label: "curl" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
];

export function UseThisModelDialog({
  open,
  onClose,
  modelId,
  modelName,
  modality,
  prompt,
}: {
  open: boolean;
  onClose: () => void;
  modelId: string;
  modelName?: string;
  modality: string;
  prompt?: string;
}) {
  const [lang, setLang] = useState<GatewaySnippetLang>("curl");
  const [copied, setCopied] = useState(false);

  const snippets = useMemo(
    () =>
      buildUseModelSnippets({
        model: modelId,
        modality,
        prompt,
      }),
    [modelId, modality, prompt],
  );

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippets[lang]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="use-model-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
          <div className="min-w-0">
            <h2
              id="use-model-title"
              className="text-sm font-semibold text-zinc-900"
            >
              Use this model
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {modelName ? `${modelName} · ` : ""}
              <span className="font-mono">{modelId}</span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-zinc-400">
              {GATEWAY_V1_BASE}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
          >
            关闭
          </button>
        </div>

        <div className="flex gap-1 border-b border-zinc-100 px-4 pt-2">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => setLang(l.id)}
              className={`rounded-t-md px-3 py-1.5 text-xs font-medium ${
                lang === l.id
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <pre className="min-h-0 flex-1 overflow-auto bg-zinc-50 p-4 font-mono text-[11px] leading-relaxed text-zinc-800">
          {snippets[lang]}
        </pre>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
          >
            {copied ? "已复制" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
