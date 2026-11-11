import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requireOperator } from "@/server/auth/viewer";
import { storeMode } from "@/server/store";
import { AdminFrame, AdminSkeleton } from "../shared";
import { BankImport } from "./bank-import";

export const metadata: Metadata = { title: "거래내역 가져오기", robots: { index: false } };

export default function BankPage() {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Bank />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Bank() {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  await requireOperator("/admin/bank");
  return (
    <AdminFrame tab="bank" title="Statement">
      <p className="mb-5 max-w-2xl text-[14px] leading-relaxed text-ink-soft">
        카카오뱅크 앱에서 모임통장 거래내역을 엑셀로 내려받아 올려 주세요. 입금만 골라 신청 내역과 입금자명·금액을 비교해 후보를
        보여줘요. 자동 매칭은 제안일 뿐이고, 승인은 항상 운영진이 직접 해요. 동명이인·대리 입금·부분 입금은 꼭 확인해 주세요.
      </p>
      <BankImport />
    </AdminFrame>
  );
}
