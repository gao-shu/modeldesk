import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  GuideArticleSchema,
  ModelPriceSchema,
  ModelSchema,
  ProviderSchema,
  VerificationRecordSchema,
} from "@modeldesk/radar-types";
import { createDb, repoRoot } from "../db/client.js";
import {
  guides,
  metaKv,
  modelPrices,
  models,
  promoCodes,
  providers,
  verificationRecords,
} from "../db/schema.js";

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export async function runSeed(dbPath?: string) {
  const { db, sqlite, dbPath: resolved } = createDb(dbPath);
  const seedDir = path.join(repoRoot, "data", "seed");
  const now = new Date().toISOString();

  sqlite.exec(`
    DELETE FROM promo_codes;
    DELETE FROM model_prices;
    DELETE FROM verification_records;
    DELETE FROM guides;
    DELETE FROM models;
    DELETE FROM providers;
    DELETE FROM meta_kv;
  `);
  // Drop legacy table if present (free-offers feature removed).
  try {
    sqlite.exec(`DROP TABLE IF EXISTS free_offers`);
  } catch {
    /* ignore */
  }

  const providerList = readJson<unknown[]>(
    path.join(seedDir, "providers.sample.json"),
  ).map((p) => ProviderSchema.parse(p));
  const modelList = readJson<unknown[]>(
    path.join(seedDir, "models.sample.json"),
  ).map((m) => ModelSchema.parse(m));
  const priceList = readJson<unknown[]>(
    path.join(seedDir, "prices.sample.json"),
  ).map((p) => ModelPriceSchema.parse(p));
  const guideList = readJson<unknown[]>(
    path.join(seedDir, "guides.sample.json"),
  ).map((g) => GuideArticleSchema.parse(g));
  const verList = readJson<unknown[]>(
    path.join(seedDir, "verifications.sample.json"),
  ).map((v) => VerificationRecordSchema.parse(v));

  for (const p of providerList) {
    await db.insert(providers).values({
      id: p.id,
      name: p.name,
      website: p.website,
      logoUrl: p.logoUrl ?? null,
      summary: p.summary ?? "",
      status: p.status,
      rankWeight: p.rankWeight,
      authenticityStatus: p.authenticityStatus,
      priceLevelJson: JSON.stringify(p.priceLevel),
      paymentsJson: JSON.stringify(p.payments),
      minTopupCny: p.minTopupCny,
      giftDescription: p.giftDescription ?? "",
      invoiceSupport: p.invoiceSupport,
      invoiceNote: p.invoiceNote ?? "",
      stabilityScore: p.stabilityScore,
      imageModelSupport: p.imageModelSupport,
      channelType: p.channelType ?? "unknown",
      channelNote: p.channelNote ?? "",
      communityUrl: p.communityUrl ?? null,
      affiliateDisclosure: p.affiliateDisclosure ?? null,
      lastVerifiedAt: p.lastVerifiedAt,
      lastPriceUpdatedAt: p.lastPriceUpdatedAt,
      listedAt: p.listedAt,
      updatedAt: now,
    });

    for (const code of p.promoCodes ?? []) {
      await db.insert(promoCodes).values({
        id: randomUUID(),
        providerId: p.id,
        code: code.code,
        label: code.label,
        isExclusive: code.isExclusive ?? false,
        isActive: code.isActive,
        expiresAt: code.expiresAt ?? null,
      });
    }
  }

  for (const m of modelList) {
    await db.insert(models).values({
      id: m.id,
      name: m.name,
      family: m.family,
      category: m.category,
      isFeatured: m.isFeatured ?? false,
      sortOrder: m.sortOrder ?? 0,
      status: m.status,
    });
  }

  for (const price of priceList) {
    await db.insert(modelPrices).values({
      id: price.id ?? randomUUID(),
      providerId: price.providerId,
      modelId: price.modelId,
      inputPriceUsd: price.inputPriceUsd ?? null,
      outputPriceUsd: price.outputPriceUsd ?? null,
      imagePriceUsd: price.imagePriceUsd ?? null,
      priceUnit: price.priceUnit,
      currencyDisplay: price.currencyDisplay,
      channelNote: price.channelNote ?? "",
      isAvailable: price.isAvailable ?? true,
      lastVerifiedAt: price.lastVerifiedAt ?? null,
    });
  }

  for (const g of guideList) {
    await db.insert(guides).values({
      slug: g.slug,
      title: g.title,
      category: g.category,
      summary: g.summary ?? "",
      contentMd: g.contentMd ?? "",
      status: g.status,
      publishedAt: g.publishedAt ?? null,
    });
  }

  for (const v of verList) {
    await db.insert(verificationRecords).values({
      id: v.id ?? randomUUID(),
      providerId: v.providerId,
      modelId: v.modelId ?? null,
      result: v.result,
      method: v.method,
      summary: v.summary,
      verifiedAt: v.verifiedAt,
    });
  }

  await db.insert(metaKv).values([
    {
      key: "seeded_at",
      value: new Date().toISOString(),
    },
  ]);

  console.log(
    JSON.stringify(
      {
        dbPath: resolved,
        providers: providerList.length,
        models: modelList.length,
        prices: priceList.length,
        guides: guideList.length,
        verifications: verList.length,
      },
      null,
      2,
    ),
  );

  sqlite.close();
}

const isDirect =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirect) {
  await runSeed();
}
