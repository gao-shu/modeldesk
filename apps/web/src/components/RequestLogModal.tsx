"use client";

import { useEffect, useCallback } from "react";

interface RequestLogModalProps {
  log: { url: string; body: Record<string, unknown> } | null;
  onClose: () => void;
}

export function RequestLogModal({ log, onClose }: RequestLogModalProps) {
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

  if (!log) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-auto rounded-lg border border-zinc-200 bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">请求日志</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            关闭
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              URL
            </span>
            <div className="mt-1 break-all rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 font-mono text-zinc-800">
              {log.url}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              Body
            </span>
            <pre className="mt-1 max-h-96 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-3 font-mono whitespace-pre-wrap text-zinc-800">
              {JSON.stringify(log.body, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
