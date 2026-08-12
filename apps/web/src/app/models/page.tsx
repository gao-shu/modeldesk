"use client";

import { ModelsPageClient } from "./ModelsPageClient";

/** Client-only — avoid force-dynamic SQLite work on every soft navigation. */
export default function ModelsPage() {
  return <ModelsPageClient />;
}
