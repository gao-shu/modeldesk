"use client";

import { useEffect, useCallback, useState } from "react";

interface RequestLogModalProps {
  log: { url: string; body: Record<string, unknown> } | null;
  onClose: () => void;
}

export function RequestLogModal({ log, onClose }: RequestLogModalProps) {
  const [copied, setCopied] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    setCopied(false);
  }, [log]);

  if (!log) return null;

  const isMultipart = log.body._multipart === true;
  const bodyText = JSON.stringify(log.body, null, 2);

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(bodyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore — user can still select manually */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-auto rounded-lg border border-zinc-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              上游 API 请求
            </h3>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
              这是 ModelDesk 服务端发给中转/厂商的真实请求（浏览器 Network
              里看不到）。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            关闭
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Method · URL
            </span>
            <div className="mt-1 break-all rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-zinc-800">
              <span className="text-emerald-700">POST</span> {log.url}
            </div>
          </div>

          {isMultipart ? (
            <p className="rounded border border-amber-100 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
              实际 Content-Type 为{" "}
              <code className="font-mono">multipart/form-data</code>
              。下方 JSON 是字段摘要（
              <code className="font-mono">_multipart: true</code>
              ）；多张参考图会重复同名字段{" "}
              <code className="font-mono">input_reference</code>。
            </p>
          ) : null}

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Body{isMultipart ? "（字段摘要）" : ""}
            </span>
            <div className="relative mt-1">
              <button
                type="button"
                onClick={copyBody}
                className="absolute right-2 top-2 z-10 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 shadow-sm hover:bg-zinc-50 hover:text-zinc-900"
              >
                {copied ? "已复制" : "复制"}
              </button>
              <pre className="max-h-96 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-3 pr-16 font-mono whitespace-pre-wrap text-zinc-800">
                {bodyText}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
