"use client";

import {
  getApiFormat,
  modalityLabel,
  modalityUsesApiFormatPicker,
  resolveApiFormatId,
} from "@modeldesk/shared";
import type { ApiConfigListItem, SmokeTestDisplay } from "./types";

export type ApiConfigListProps = {
  configs: ApiConfigListItem[];
  modalityFilter?: string;
  testingId?: string | null;
  lastTest?: { id: string; result: SmokeTestDisplay } | null;
  onEdit: (config: ApiConfigListItem) => void;
  onTest: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  emptyHint?: string;
};

export function ApiConfigList({
  configs,
  modalityFilter,
  testingId,
  lastTest,
  onEdit,
  onTest,
  onDelete,
  emptyHint,
}: ApiConfigListProps) {
  if (configs.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm text-zinc-500">
        {emptyHint ??
          `暂无 API 配置${modalityFilter ? `（${modalityLabel(modalityFilter)}）` : ""}。`}
      </div>
    );
  }

  return (
    <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(16rem,1fr))]">
      {configs.map((m) => {
        const test = lastTest?.id === m.id ? lastTest.result : null;
        const formatId = resolveApiFormatId({
          modality: m.modality,
          defaults: m.defaults,
          provider: m.provider,
          baseUrl: m.baseUrl,
          modelId: m.modelId,
        });
        const formatLabel = getApiFormat(formatId)?.label ?? formatId;
        const showFormat = modalityUsesApiFormatPicker(m.modality);

        return (
          <article
            key={m.id}
            className="flex aspect-square min-w-0 flex-col rounded-md border border-zinc-200 bg-white p-3"
          >
            <div className="min-w-0 shrink-0">
              <h3 className="truncate text-sm font-semibold leading-snug text-zinc-900">
                {m.name}
              </h3>
              <p
                className="mt-1 truncate font-mono text-xs text-zinc-500"
                title={m.modelId}
              >
                {m.modelId}
              </p>
            </div>

            <dl className="mt-3 flex min-h-0 flex-1 flex-col justify-center gap-2 text-xs text-zinc-600">
              {showFormat ? (
                <div className="flex gap-2">
                  <dt className="w-9 shrink-0 text-zinc-400">格式</dt>
                  <dd className="min-w-0 truncate" title={formatLabel}>
                    {formatLabel}
                  </dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="w-9 shrink-0 text-zinc-400">密钥</dt>
                <dd className="min-w-0 truncate font-mono">
                  {m.hasApiKey ? m.apiKeyMasked : "未配置"}
                </dd>
              </div>
              {m.baseUrl ? (
                <div className="flex gap-2">
                  <dt className="w-9 shrink-0 text-zinc-400">地址</dt>
                  <dd
                    className="min-w-0 break-all font-mono leading-snug line-clamp-3"
                    title={m.baseUrl}
                  >
                    {m.baseUrl}
                  </dd>
                </div>
              ) : null}
              <div className="flex gap-2">
                <dt className="w-9 shrink-0 text-zinc-400">状态</dt>
                <dd className="min-w-0">
                  {test ? (
                    <span
                      className={
                        test.ok ? "text-emerald-700" : "text-red-600"
                      }
                    >
                      {test.ok ? "通过" : "失败"} · {test.latencyMs}ms
                    </span>
                  ) : (
                    <span className="text-zinc-400">未测试</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex shrink-0 flex-wrap gap-x-3 gap-y-1 border-t border-zinc-100 pt-2.5 text-xs">
              <button
                type="button"
                className="cursor-pointer text-zinc-700 underline hover:text-zinc-900 disabled:opacity-50"
                disabled={testingId === m.id}
                onClick={() => onTest(m.id)}
              >
                {testingId === m.id ? "测试中…" : "测试"}
              </button>
              <button
                type="button"
                className="cursor-pointer text-zinc-700 underline hover:text-zinc-900"
                onClick={() => onEdit(m)}
              >
                编辑
              </button>
              <button
                type="button"
                className="cursor-pointer text-red-600 underline hover:text-red-700"
                onClick={() => onDelete(m.id, m.name)}
              >
                删除
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
