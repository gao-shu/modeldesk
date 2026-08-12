/** Browser helpers for radar-api via Next rewrite `/proxy/radar/*`. */

export type RadarEnvelope<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
  meta?: unknown;
};

export type RadarPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type RadarProviderListItem = {
  id: string;
  name: string;
  website: string;
  logoUrl: string | null;
  authenticityStatus: string;
  priceLevel: string[];
  payments: string[];
  minTopupCny: number;
  giftDescription: string;
  invoiceSupport: string;
  stabilityScore: string;
  imageModelSupport: boolean;
  channelType: string;
  lastVerifiedAt: string;
  lastPriceUpdatedAt: string;
  promoCodes: { code: string; label: string; isExclusive: boolean }[];
  affiliateDisclosure: string | null;
  compositeScore: number;
};

export type RadarModelListItem = {
  id: string;
  name: string;
  family: string;
  category: string;
  isFeatured: boolean;
  sortOrder: number;
};

async function parseEnvelope<T>(res: Response): Promise<T> {
  let json: RadarEnvelope<T>;
  try {
    json = (await res.json()) as RadarEnvelope<T>;
  } catch {
    throw new Error(`Radar 响应不是 JSON（HTTP ${res.status}）`);
  }
  if (!res.ok || json.error) {
    throw new Error(
      json.error?.message || `Radar 请求失败（HTTP ${res.status}）`,
    );
  }
  if (json.data == null) {
    throw new Error("Radar 返回空 data");
  }
  return json.data;
}

export async function radarGet<T>(path: string): Promise<T> {
  const res = await fetch(`/proxy/radar${path.startsWith("/") ? path : `/${path}`}`, {
    cache: "no-store",
  });
  return parseEnvelope<T>(res);
}

export async function radarPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/proxy/radar${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseEnvelope<T>(res);
}
