import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import { requireOperator } from "@/server/auth/viewer";
import { formatWon } from "@/server/domain/model";
import { storeMode } from "@/server/store";
import { ApprovedPaymentRow, PendingPaymentCard } from "../payment-cards";
import { AdminFrame, AdminSkeleton, Box, Pill } from "../shared";

export const metadata: Metadata = { title: "입금 확인", robots: { index: false } };

export default function PaymentsPage() {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Payments />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Payments() {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const now = await requestNow();
  const { club } = await requireOperator("/admin/payments");
  const todayKey = toDateKey(now);
  const byRequested = (a: { requestedAt: string }, b: { requestedAt: string }) => a.requestedAt.localeCompare(b.requestedAt);

  const pending = club.payments.filter((p) => p.status === "pending" || p.status === "matched").sort(byRequested);
  const approved = club.payments
    .filter((p) => p.status === "approved")
    .sort((a, b) => b.approvedAt.localeCompare(a.approvedAt))
    .slice(0, 30);
  const closed = club.payments
    .filter((p) => p.status === "rejected" || p.status === "refunded")
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .slice(0, 20);

  return (
    <AdminFrame tab="payments" title="Deposits">
      <p className="mb-5 max-w-2xl text-[14px] leading-relaxed text-ink-soft">
        모임통장 앱에서 입금을 확인한 뒤 승인하세요. 승인하는 순간 회원권 기간이 계산되어 생성되고, 회원에게 알림이 가요.
        같은 입금은 두 번 승인되지 않아요.
      </p>
      <div className="flex flex-col gap-6">
        <Box title={`확인 대기 ${pending.length}건`}>
          {pending.length === 0 ? (
            <p className="text-[14px] text-ink-soft">기다리는 입금이 없어요.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map((p) => (
                <PendingPaymentCard key={p.id} payment={p} club={club} todayKey={todayKey} />
              ))}
            </div>
          )}
        </Box>

        <Box title="최근 승인">
          {approved.length === 0 ? (
            <p className="text-[14px] text-ink-soft">아직 승인한 입금이 없어요.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {approved.map((p) => (
                <ApprovedPaymentRow key={p.id} payment={p} club={club} />
              ))}
            </div>
          )}
        </Box>

        {closed.length > 0 && (
          <Box title="반려 · 환불">
            <ul className="divide-y divide-plywood-400 text-[14px]">
              {closed.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {club.members.find((m) => m.id === p.memberId)?.name ?? p.memberId} · {formatWon(p.amount)}
                    {p.note && <span className="ml-2 text-ink-soft">{p.note}</span>}
                  </span>
                  <Pill tone="muted">{p.status}</Pill>
                </li>
              ))}
            </ul>
          </Box>
        )}
      </div>
    </AdminFrame>
  );
}
