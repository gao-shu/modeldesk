"use client";

const PAGE_SIZE = 15;

export function HistoryPager({
  page,
  total,
  pageSize = PAGE_SIZE,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return total > 0 ? (
      <p className="mt-2 text-right text-[11px] text-zinc-400">共 {total} 条</p>
    ) : null;
  }

  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-sm text-zinc-600">
      <span>
        共 {total} 条 · 第 {page}/{totalPages} 页
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md border border-zinc-300 px-3.5 py-1.5 hover:bg-zinc-50 disabled:opacity-40"
        >
          上一页
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md border border-zinc-300 px-3.5 py-1.5 hover:bg-zinc-50 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

export { PAGE_SIZE };
