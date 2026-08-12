import type { AuthenticityStatus, StabilityScore } from "./enums.js";

export interface CompositeScoreInput {
  rankWeight: number;
  authenticityStatus: AuthenticityStatus;
  stabilityScore: StabilityScore;
  lastVerifiedAt: string | Date;
  now?: Date;
}

function authenticityBonus(status: AuthenticityStatus): number {
  switch (status) {
    case "pass":
      return 30;
    case "unknown":
      return 10;
    case "fail":
      return 0;
  }
}

function stabilityBonus(score: StabilityScore): number {
  switch (score) {
    case "excellent":
      return 20;
    case "fair":
      return 10;
    case "poor":
      return 0;
    case "unknown":
      return 5;
  }
}

function freshnessBonus(lastVerifiedAt: string | Date, now: Date): number {
  const verified =
    lastVerifiedAt instanceof Date
      ? lastVerifiedAt
      : new Date(lastVerifiedAt);
  if (Number.isNaN(verified.getTime())) return 0;
  const days = (now.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 7) return 15;
  if (days <= 30) return 8;
  return 0;
}

/**
 * compositeScore =
 *   rankWeight * 0.35
 *   + authenticityBonus(pass=30, unknown=10, fail=0)
 *   + stabilityBonus(excellent=20, fair=10, poor=0, unknown=5)
 *   + freshnessBonus(7d=15, 30d=8, else=0)
 */
export function compositeScore(input: CompositeScoreInput): number {
  const now = input.now ?? new Date();
  const raw =
    input.rankWeight * 0.35 +
    authenticityBonus(input.authenticityStatus) +
    stabilityBonus(input.stabilityScore) +
    freshnessBonus(input.lastVerifiedAt, now);
  return Math.round(raw * 100) / 100;
}
