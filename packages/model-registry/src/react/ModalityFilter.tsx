"use client";

import { MODALITIES, modalityLabel } from "@modeldesk/shared";

export type ModalityFilterProps = {
  /** Active modality id, or `""` when 「全部」 is selected. */
  value: string;
  onChange: (modality: string) => void;
  /** Show an 「全部」 chip that sets value to `""`. */
  allowAll?: boolean;
  allLabel?: string;
  /** Optional left-side caption (e.g. 「类型」). */
  label?: string;
  /** @deprecated Kept for call-sites; all sizes use the same larger chip. */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Shared modality chip row — 文本 / 图片 / 视频 / 语音.
 * Used by 模型配置、跑一次、生成结果等页面。
 */
export function ModalityFilter({
  value,
  onChange,
  allowAll = false,
  allLabel = "全部",
  label,
  className,
}: ModalityFilterProps) {
  const chip =
    "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors";
  const active = "bg-zinc-900 text-white";
  const idle =
    "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50";

  return (
    <div
      className={
        className ?? "mb-3 flex flex-wrap items-center gap-2"
      }
    >
      {label ? (
        <span className="text-sm font-medium text-zinc-500">{label}</span>
      ) : null}
      {allowAll ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className={`${chip} ${value === "" ? active : idle}`}
        >
          {allLabel}
        </button>
      ) : null}
      {MODALITIES.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`${chip} ${value === m ? active : idle}`}
        >
          {modalityLabel(m)}
        </button>
      ))}
    </div>
  );
}
