import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { dotDate } from "@/components/membership-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import { accessUntil } from "@/lib/membership";
import { requireOperator } from "@/server/auth/viewer";
import { daysUntil } from "@/server/domain/operations";
import { readTables, storeMode } from "@/server/store";
import { PendingPaymentCard } from "./payment-cards";
import { AdminFrame, AdminSkeleton, Box, Pill } from "./shared";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Overview />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Overview() {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const now = await requestNow();
  const { club } = await requireOperator("/admin");
  const todayKey = toDateKey(now);
  const proposals = (await readTables(["Proposals"], { fresh: true })).Proposals ?? [];

  const pending = club.payments.filter((p) => p.status === "pending" || p.status === "matched");
  const activeMembers = club.members.filter((m) => m.status === "active");
  const expiring = activeMembers
    .map((m) => ({ member: m, until: accessUntil(club.memberships.filter((ms) => ms.memberId === m.id), todayKey) }))
    .filter((x): x is { member: typeof x.member; until: string } => x.until !== null && daysUntil(todayKey, x.until) <= 14)
    .sort((a, b) => a.until.localeCompare(b.until));
  const recentlyExpired = activeMembers
    .filter((m) => {
      const mine = club.memberships.filter((ms) => ms.memberId === m.id && ms.status === "active");
      const lastEnd = mine.map((ms) => ms.endDate).sort().at(-1);
      return lastEnd && lastEnd < todayKey && daysUntil(todayKey, lastEnd) >= -30;
    })
    .slice(0, 10);
  const newProposals = proposals.filter((p) => String(p.review_status ?? "new") === "new" || !p.review_status);

  return (
    <AdminFrame tab="overview" title="Club desk">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="입금 확인 대기" value={pending.length} href="/admin/payments" warn={pending.length > 0} />
        <Stat label="14일 내 만료" value={expiring.length} href="/admin/members?filter=expiring" />
        <Stat label="이용 중 회원" value={activeMembers.filter((m) => accessUntil(club.memberships.filter((ms) => ms.memberId === m.id), todayKey)).length} href="/admin/members" />
        <Stat label="새 제안" value={newProposals.length} href="/admin/proposals" warn={newProposals.length > 0} />
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <Box
          title="입금 확인 대기"
          action={
            <Link href="/admin/bank" className="text-[13px] font-bold text-midnight underline underline-offset-4">
              거래내역으로 확인
            </Link>
          }
        >
          {pending.length === 0 ? (
            <p className="text-[14px] text-ink-soft">기다리는 입금이 없어요.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pending.slice(0, 5).map((p) => (
                <PendingPaymentCard key={p.id} payment={p} club={club} todayKey={todayKey} />
              ))}
              {pending.length > 5 && (
                <Link href="/admin/payments" className="text-[14px] font-bold text-midnight underline underline-offset-4">
                  {pending.length - 5}건 더 보기
                </Link>
              )}
            </div>
          )}
        </Box>

        <Box title="만료 예정 회원 (14일 이내)">
          {expiring.length === 0 ? (
            <p className="text-[14px] text-ink-soft">2주 안에 만료되는 회원이 없어요.</p>
          ) : (
            <ul className="divide-y divide-plywood-400">
              {expiring.map(({ member, until }) => {
                const d = daysUntil(todayKey, until);
                const hasPending = pending.some((p) => p.memberId === member.id);
                return (
                  <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <Link href={`/admin/members/${encodeURIComponent(member.id)}`} className="text-[15px] font-bold text-midnight hover:underline">
                      {member.name}
                    </Link>
                    <span className="flex items-center gap-2 text-[13px]">
                      {hasPending && <Pill tone="ok">연장 신청</Pill>}
                      <span className="font-mono text-ink-soft">{dotDate(until)}</span>
                      <Pill tone={d <= 1 ? "warn" : "default"}>{d === 0 ? "D-DAY" : `D-${d}`}</Pill>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {recentlyExpired.length > 0 && (
            <p className="mt-3 text-[13px] text-ink-soft">
              최근 30일 안에 만료: {recentlyExpired.map((m) => m.name).join(", ")}
            </p>
          )}
        </Box>

        {club.settings.sheetUrl && (
          <a href={club.settings.sheetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg border-2 border-dashed border-midnight/40 px-4 py-3 text-[14px] font-bold text-midnight">
            원본 스프레드시트 열기 (이벤트·상품·설정 편집)
            <ArrowRight />
          </a>
        )}
      </div>
    </AdminFrame>
  );
}

function Stat({ label, value, href, warn }: { label: string; value: number; href: string; warn?: boolean }) {
  return (
    <Link href={href} className={`rounded-lg border-2 border-midnight p-3.5 ${warn ? "bg-butter" : "bg-ivory"} hover:shadow-[3px_3px_0_0_var(--color-midnight)]`}>
      <p className="text-[12px] font-semibold text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-[40px] font-extrabold leading-none text-midnight">{value}</p>
    </Link>
  );
}
