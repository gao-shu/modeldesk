import {
  compositeScore,
  type AuthenticityStatus,
  type StabilityScore,
} from "@modeldesk/radar-types";
import type { providers } from "../db/schema.js";

type ProviderRow = typeof providers.$inferSelect;

export function scoreProvider(row: ProviderRow, now = new Date()): number {
  return compositeScore({
    rankWeight: row.rankWeight,
    authenticityStatus: row.authenticityStatus as AuthenticityStatus,
    stabilityScore: row.stabilityScore as StabilityScore,
    lastVerifiedAt: row.lastVerifiedAt,
    now,
  });
}

export function mapProviderListItem(
  row: ProviderRow,
  promoCodes: Array<{
    code: string;
    label: string;
    isExclusive: boolean;
  }>,
  now = new Date(),
) {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    logoUrl: row.logoUrl,
    authenticityStatus: row.authenticityStatus,
    priceLevel: JSON.parse(row.priceLevelJson) as string[],
    payments: JSON.parse(row.paymentsJson) as string[],
    minTopupCny: row.minTopupCny,
    giftDescription: row.giftDescription,
    invoiceSupport: row.invoiceSupport,
    invoiceNote: row.invoiceNote,
    stabilityScore: row.stabilityScore,
    imageModelSupport: row.imageModelSupport,
    channelType: row.channelType,
    lastVerifiedAt: row.lastVerifiedAt,
    lastPriceUpdatedAt: row.lastPriceUpdatedAt,
    promoCodes,
    affiliateDisclosure: row.affiliateDisclosure,
    compositeScore: scoreProvider(row, now),
  };
}
