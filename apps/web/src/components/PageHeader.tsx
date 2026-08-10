import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3"
      style={{ marginBottom: "var(--md-page-title-mb)" }}
    >
      <div className="min-w-0">
        <h1
          className="font-semibold tracking-tight text-zinc-900"
          style={{ fontSize: "var(--md-page-title)" }}
        >
          {title}
        </h1>
        {description ? (
          <p className="md-hint mt-0.5 max-w-2xl">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PlaceholderPanel({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6">
      <div className="text-sm font-medium text-zinc-800">{title}</div>
      <div className="mt-2 text-sm text-zinc-500">
        {children ?? "后续阶段实现。导航已在脚手架阶段接好。"}
      </div>
    </div>
  );
}
