import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  website: text("website").notNull(),
  logoUrl: text("logo_url"),
  summary: text("summary").notNull().default(""),
  status: text("status").notNull().default("active"),
  rankWeight: integer("rank_weight").notNull().default(50),
  authenticityStatus: text("authenticity_status").notNull(),
  priceLevelJson: text("price_level_json").notNull(),
  paymentsJson: text("payments_json").notNull(),
  minTopupCny: real("min_topup_cny").notNull(),
  giftDescription: text("gift_description").notNull().default(""),
  invoiceSupport: text("invoice_support").notNull(),
  invoiceNote: text("invoice_note").notNull().default(""),
  stabilityScore: text("stability_score").notNull(),
  imageModelSupport: integer("image_model_support", { mode: "boolean" }).notNull(),
  channelType: text("channel_type").notNull().default("unknown"),
  channelNote: text("channel_note").notNull().default(""),
  communityUrl: text("community_url"),
  affiliateDisclosure: text("affiliate_disclosure"),
  lastVerifiedAt: text("last_verified_at").notNull(),
  lastPriceUpdatedAt: text("last_price_updated_at").notNull(),
  listedAt: text("listed_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const promoCodes = sqliteTable("promo_codes", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  code: text("code").notNull(),
  label: text("label").notNull(),
  isExclusive: integer("is_exclusive", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  expiresAt: text("expires_at"),
});

export const models = sqliteTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  family: text("family").notNull(),
  category: text("category").notNull(),
  isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("active"),
});

export const modelPrices = sqliteTable("model_prices", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  modelId: text("model_id").notNull(),
  inputPriceUsd: real("input_price_usd"),
  outputPriceUsd: real("output_price_usd"),
  imagePriceUsd: real("image_price_usd"),
  priceUnit: text("price_unit").notNull(),
  currencyDisplay: text("currency_display").notNull(),
  channelNote: text("channel_note").notNull().default(""),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  lastVerifiedAt: text("last_verified_at"),
});

export const guides = sqliteTable("guides", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  summary: text("summary").notNull().default(""),
  contentMd: text("content_md").notNull().default(""),
  status: text("status").notNull().default("published"),
  publishedAt: text("published_at"),
});

export const verificationRecords = sqliteTable("verification_records", {
  id: text("id").primaryKey(),
  providerId: text("provider_id").notNull(),
  modelId: text("model_id"),
  result: text("result").notNull(),
  method: text("method").notNull(),
  summary: text("summary").notNull(),
  verifiedAt: text("verified_at").notNull(),
});

export const metaKv = sqliteTable("meta_kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** 用户自测公开报告快照（不含 API Key） */
export const probeReports = sqliteTable("probe_reports", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  payloadJson: text("payload_json").notNull(),
});
