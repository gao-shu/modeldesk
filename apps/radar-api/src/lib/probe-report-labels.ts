import type { OverallStatus } from "./probe-types.js";

export type OverallTone = "ok" | "warn" | "bad" | "mute";

export type OverallLabel = {
  /** 圆标主文案 */
  ring: string;
  /** 徽章 */
  badge: string;
  tone: OverallTone;
  /** 结果区短标题（/verify） */
  short: string;
};

/** overall → 展示文案（报告页 + /verify 共用） */
export const OVERALL_LABELS: Record<OverallStatus, OverallLabel> = {
  likely_genuine: {
    ring: "倾向真货",
    badge: "倾向可信",
    tone: "ok",
    short: "倾向真货",
  },
  suspicious: {
    ring: "存疑",
    badge: "需复核",
    tone: "warn",
    short: "存疑",
  },
  likely_fake: {
    ring: "高度可疑",
    badge: "疑似假货",
    tone: "bad",
    short: "高度可疑",
  },
  unreachable: {
    ring: "无法检测",
    badge: "未检测",
    tone: "mute",
    short: "无法检测",
  },
  inconclusive: {
    ring: "无法判定",
    badge: "样本不足",
    tone: "warn",
    short: "无法判定",
  },
};

export type StatusMark = {
  mark: string;
  label: string;
  cls: "ok" | "weak" | "bad" | "skip";
};

/** 分项状态 → 符号 / 中文 */
export const STATUS_MARKS: Record<"pass" | "weak" | "fail" | "skip", StatusMark> =
  {
    pass: { mark: "✓", label: "通过", cls: "ok" },
    weak: { mark: "△", label: "偏弱", cls: "weak" },
    fail: { mark: "✗", label: "未通过", cls: "bad" },
    skip: { mark: "—", label: "跳过", cls: "skip" },
  };

export function overallView(overall: OverallStatus | string): OverallLabel {
  if (overall in OVERALL_LABELS) {
    return OVERALL_LABELS[overall as OverallStatus];
  }
  return OVERALL_LABELS.inconclusive;
}

/** Big-hero display: symbol + 真货概率 */
export function authenticityHero(
  overall: OverallStatus | string,
  score?: number | null,
): {
  glyph: string;
  label: string;
  tone: OverallTone;
  /** 0–100；无法检测时为 null */
  probability: number | null;
} {
  const ov = overallView(overall);
  const glyph =
    ov.tone === "ok" ? "✓" : ov.tone === "bad" ? "✗" : ov.tone === "mute" ? "—" : "!";

  let probability: number | null = null;
  if (overall === "unreachable") {
    probability = null;
  } else if (typeof score === "number" && Number.isFinite(score)) {
    probability = Math.max(0, Math.min(100, Math.round(score)));
  } else if (overall === "likely_genuine") {
    probability = 85;
  } else if (overall === "suspicious") {
    probability = 45;
  } else if (overall === "likely_fake") {
    probability = 15;
  }

  return { glyph, label: ov.ring, tone: ov.tone, probability };
}

export function statusMark(status: string): StatusMark {
  if (status === "pass" || status === "weak" || status === "fail" || status === "skip") {
    return STATUS_MARKS[status];
  }
  return STATUS_MARKS.skip;
}

/** 供前端内嵌的精简字典（避免手写第二份文案） */
export function labelsForClient(): {
  overall: Record<string, { ring: string; badge: string; short: string; tone: string }>;
  status: Record<string, { mark: string; label: string; cls: string }>;
} {
  const overall: Record<
    string,
    { ring: string; badge: string; short: string; tone: string }
  > = {};
  for (const [k, v] of Object.entries(OVERALL_LABELS)) {
    overall[k] = { ring: v.ring, badge: v.badge, short: v.short, tone: v.tone };
  }
  const status: Record<string, { mark: string; label: string; cls: string }> = {};
  for (const [k, v] of Object.entries(STATUS_MARKS)) {
    status[k] = { mark: v.mark, label: v.label, cls: v.cls };
  }
  return { overall, status };
}
