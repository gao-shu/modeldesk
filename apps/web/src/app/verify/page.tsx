import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { VerifyClient } from "@/components/VerifyClient";

export default function VerifyPage() {
  return (
    <div>
      <PageHeader title="性能测试" />
      <Suspense
        fallback={
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            加载中…
          </div>
        }
      >
        <VerifyClient />
      </Suspense>
    </div>
  );
}
