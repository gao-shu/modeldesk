import { z } from "zod";

export const ProviderStatusSchema = z.enum(["active", "hidden", "delisted"]);
export const AuthenticityStatusSchema = z.enum(["pass", "fail", "unknown"]);
export const PriceLevelSchema = z.enum(["low", "mid", "high"]);
export const PaymentMethodSchema = z.enum([
  "alipay",
  "wechat",
  "usdt",
  "card",
  "paypal",
  "stripe",
]);
export const InvoiceSupportSchema = z.enum(["yes", "no", "conditional"]);
export const StabilityScoreSchema = z.enum([
  "excellent",
  "fair",
  "poor",
  "unknown",
]);
export const ChannelTypeSchema = z.enum([
  "official",
  "mixed",
  "reverse_suspected",
  "unknown",
]);
export const ModelFamilySchema = z.enum([
  "openai",
  "claude",
  "gemini",
  "grok",
  "image",
  "other",
]);
export const ModelCategorySchema = z.enum([
  "chat",
  "image",
  "audio",
  "embedding",
]);
export const ModelStatusSchema = z.enum(["active", "deprecated"]);
export const PriceUnitSchema = z.enum([
  "per_1m_tokens",
  "per_image",
  "per_request",
]);
export const CurrencyDisplaySchema = z.enum(["USD", "CNY"]);
export const ProviderSortSchema = z.enum([
  "composite",
  "price",
  "verified",
  "updated",
]);

export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
export type AuthenticityStatus = z.infer<typeof AuthenticityStatusSchema>;
export type PriceLevel = z.infer<typeof PriceLevelSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type InvoiceSupport = z.infer<typeof InvoiceSupportSchema>;
export type StabilityScore = z.infer<typeof StabilityScoreSchema>;
export type ChannelType = z.infer<typeof ChannelTypeSchema>;
export type ModelFamily = z.infer<typeof ModelFamilySchema>;
export type ModelCategory = z.infer<typeof ModelCategorySchema>;
export type ProviderSort = z.infer<typeof ProviderSortSchema>;
