"use client";

import {
  matchPromptPresetId,
  promptPresetsForModality,
  type PromptPreset,
} from "@/lib/client/default-prompts";

/** Compact preset picker; empty value = custom / edited prompt. */
export function PromptPresetSelect({
  modality,
  prompt,
  onSelect,
  disabled,
  compact,
}: {
  modality: string;
  prompt: string;
  /** Called with full preset so callers can apply params (e.g. music lyrics). */
  onSelect: (preset: PromptPreset) => void;
  disabled?: boolean;
  /** Inline toolbar style without full-width label stack. */
  compact?: boolean;
}) {
  const presets = promptPresetsForModality(modality);
  if (presets.length <= 1) return null;

  const value = matchPromptPresetId(modality, prompt);

  const select = (
    <select
      value={value}
      disabled={disabled}
      aria-label="示例文案"
      onChange={(e) => {
        const id = e.target.value;
        const preset = presets.find((p) => p.id === id);
        if (preset) onSelect(preset);
      }}
      className={
        compact
          ? "md-control md-control-sm"
          : "mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
      }
    >
      {value === "" ? (
        <option value="" disabled>
          自定义 / 已编辑
        </option>
      ) : null}
      {presets.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  );

  if (compact) return select;

  return (
    <div className="mb-1">
      <label className="block text-xs">
        <span className="text-zinc-500">示例文案</span>
        {select}
      </label>
    </div>
  );
}
