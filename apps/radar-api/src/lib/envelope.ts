import { randomUUID } from "node:crypto";

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export function ok<T>(data: T, requestId = randomUUID()) {
  return {
    data,
    error: null as null,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export function fail(
  code: string,
  message: string,
  details?: unknown,
  requestId = randomUUID(),
) {
  return {
    data: null as null,
    error: { code, message, details } satisfies ApiErrorBody,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export function parsePage(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  let pageSize = Number(query.pageSize ?? 20) || 20;
  pageSize = Math.min(100, Math.max(1, pageSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const slice = items.slice((page - 1) * pageSize, page * pageSize);
  return {
    items: slice,
    pagination: { page, pageSize, total, totalPages },
  };
}
