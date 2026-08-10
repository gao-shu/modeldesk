import { z } from "zod";
import {
  AuthenticityStatusSchema,
  ChannelTypeSchema,
  CurrencyDisplaySchema,
  InvoiceSupportSchema,
  ModelCategorySchema,
  ModelFamilySchema,
  ModelStatusSchema,
  PaymentMethodSchema,
  PriceLevelSchema,
  PriceUnitSchema,
  ProviderStatusSchema,
  StabilityScoreSchema,
} from "./enums.js";

const isoDateTime = z.string().datetime({ offset: true }).or(z.string().datetime());

export const PromoCodeSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  isExclusive: z.boolean().optional().default(false),
  isActive: z.boolean().default(true),
  expiresAt: isoDateTime.nullable().optional(),
});

export const ProviderSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  website: z.string().url(),
  logoUrl: z.string().url().optional().nullable(),
  summary: z.string().optional().default(""),
  status: ProviderStatusSchema.default("active"),
  rankWeight: z.number().min(0).max(100).default(50),
  authenticityStatus: AuthenticityStatusSchema,
  priceLevel: z.array(PriceLevelSchema).min(1),
  payments: z.array(PaymentMethodSchema).min(1),
  minTopupCny: z.number().min(0),
  giftDescription: z.string().optional().default(""),
  invoiceSupport: InvoiceSupportSchema,
  invoiceNote: z.string().optional().default(""),
  stabilityScore: StabilityScoreSchema,
  imageModelSupport: z.boolean(),
  channelType: ChannelTypeSchema.optional().default("unknown"),
  channelNote: z.string().optional().default(""),
  communityUrl: z.string().url().optional().nullable(),
  affiliateDisclosure: z.string().nullable().optional(),
  lastVerifiedAt: isoDateTime,
  lastPriceUpdatedAt: isoDateTime,
  listedAt: isoDateTime,
  promoCodes: z.array(PromoCodeSchema).optional().default([]),
});

export const ModelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  family: ModelFamilySchema,
  category: ModelCategorySchema,
  isFeatured: z.boolean().optional().default(false),
  sortOrder: z.number().optional().default(0),
  status: ModelStatusSchema.default("active"),
});

export const ModelPriceSchema = z.object({
  id: z.string().optional(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  inputPriceUsd: z.number().nullable().optional(),
  outputPriceUsd: z.number().nullable().optional(),
  imagePriceUsd: z.number().nullable().optional(),
  priceUnit: PriceUnitSchema.default("per_1m_tokens"),
  currencyDisplay: CurrencyDisplaySchema.default("USD"),
  channelNote: z.string().optional().default(""),
  isAvailable: z.boolean().optional().default(true),
  lastVerifiedAt: isoDateTime.optional().nullable(),
});

export const GuideArticleSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().optional().default(""),
  contentMd: z.string().optional().default(""),
  status: z.enum(["published", "draft"]).default("published"),
  publishedAt: isoDateTime.optional().nullable(),
});

export const VerificationRecordSchema = z.object({
  id: z.string().optional(),
  providerId: z.string().min(1),
  modelId: z.string().nullable().optional(),
  result: AuthenticityStatusSchema,
  method: z.string().min(1),
  summary: z.string().min(1),
  verifiedAt: isoDateTime,
});

export type Provider = z.infer<typeof ProviderSchema>;
export type Model = z.infer<typeof ModelSchema>;
export type ModelPrice = z.infer<typeof ModelPriceSchema>;
export type GuideArticle = z.infer<typeof GuideArticleSchema>;
export type PromoCode = z.infer<typeof PromoCodeSchema>;
export type VerificationRecord = z.infer<typeof VerificationRecordSchema>;
