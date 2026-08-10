"use client";

import { capabilityLabel, modalityLabel } from "@modeldesk/shared";

export type ModelPickerItem = {
  id: string;
  name: string;
  modality: string;
  capability?: string;
  modelId?: string;
  provider?: string;
};

export type ModelPickerProps = {
  models: ModelPickerItem[];
  value: string;
  onChange: (id: string) => void;
  modality?: string;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
  id?: string;
};

export function ModelPicker({
  models,
  value,
  onChange,
  modality,
  disabled,
  className,
  emptyLabel = "暂无可用模型",
  id,
}: ModelPickerProps) {
  const filtered = modality
    ? models.filter((m) => m.modality === modality)
    : models;

  return (
    <select
      id={id}
      disabled={disabled || filtered.length === 0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? "md-control"}
    >
      {filtered.length === 0 ? (
        <option value="">{emptyLabel}</option>
      ) : (
        filtered.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.capability
              ? ` （${modalityLabel(m.modality)}/${capabilityLabel(m.capability)}）`
              : ` （${modalityLabel(m.modality)}）`}
          </option>
        ))
      )}
    </select>
  );
}
