import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { dotDate } from "@/components/membership-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { cn, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import { accessUntil } from "@/lib/membership";
import { requireOperator } from "@/server/auth/viewer";
import { daysUntil } from "@/server/domain/operations";
import { storeMode } from "@/server/store";
import { AdminFrame, AdminSkeleton, Pill, smallInput } from "../shared";

export const metadata: Metadata = { title: "회원", robots: { index: false } };

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "active", label: "이용 중" },
  { key: "expiring", label: "만료 예정" },
  { key: "expired", label: "만료" },
  { key: "applicant", label: "신청자" },
  { key: "staff", label: "운영진" },
] as const;

export default function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Members searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Members({ searchParams }: Pick<PageProps<"/admin/members">, "searchParams">) {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const now = await requestNow();
  const { club } = await requireOperator("/admin/members");
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim().toLowerCase();
  const filter = typeof params.filter === "string" ? params.filter : "all";
  const todayKey = toDateKey(now);

  const rows = club.members
    .map((member) => {
      const until = accessUntil(club.memberships.filter((m) => m.memberId === member.id), todayKey);
      const lastEnd = club.memberships
        .filter((m) => m.memberId === member.id && m.status === "active")
        .map((m) => m.endDate)
        .sort()
        .at(-1);
      const pending = club.payments.some((p) => p.memberId === member.id && (p.status === "pending" || p.status === "matched"));
      return { member, until, lastEnd, pending, left: until ? daysUntil(todayKey, until) : null };
    })
    .filter(({ member, until, left }) => {
      if (q && ![member.name, member.email, member.depositorName, member.id].some((v) => v.toLowerCase().includes(q))) return false;
      switch (filter) {
        case "active":
          return until !== null;
        case "expiring":
          return left !== null && left <= 14;
        case "expired":
          return until === null && member.status === "active";
        case "applicant":
          return member.status === "applicant";
        case "staff":
          return member.role !== "member";
        default:
          return true;
      }
    })
    .sort((a, b) => (a.until ?? "9999").localeCompare(b.until ?? "9999") || a.member.name.localeCompare(b.member.name));

  return (
    <AdminFrame tab="members" title="Members">
      <form className="flex flex-wrap items-center gap-2" role="search">
        <input type="hidden" name="filter" value={filter} />
        <input name="q" defaultValue={q} placeholder="이름, 이메일, 입금자명" aria-label="회원 검색" className={cn(smallInput, "min-w-0 flex-1 sm:max-w-xs")} />
        <button type="submit" className="h-10 rounded-md border-2 border-midnight px-3.5 text-[13px] font-bold">
          검색
        </button>
      </form>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <li key={f.key}>
            <Link
              href={`/admin/members?filter=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={filter === f.key ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border-2 px-3 text-[13px] font-bold",
                filter === f.key ? "border-midnight bg-midnight text-cream" : "border-midnight/25 text-midnight",
              )}
            >
              {f.label}
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[13px] text-ink-soft">{rows.length}명</p>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map(({ member, until, lastEnd, pending, left }) => (
          <li key={member.id}>
            <Link
              href={`/admin/members/${encodeURIComponent(member.id)}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-midnight/20 bg-ivory px-4 py-3 hover:border-midnight"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-midnight">
                  {member.name}
                  {member.role !== "member" && <Pill tone="ok">{member.role}</Pill>}
                  {member.status !== "active" && <Pill tone="warn">{member.status}</Pill>}
                  {pending && <Pill>입금 대기</Pill>}
                  {!member.consentAt && member.status !== "inactive" && <Pill tone="warn">동의서 미확인</Pill>}
                </span>
                <span className="block truncate font-mono text-[12px] text-ink-soft">
                  {member.email} · {member.depositorName}
                </span>
              </span>
              <span className="text-right text-[13px]">
                {until ? (
                  <>
                    <span className="font-mono text-midnight">~{dotDate(until)}</span>
                    <span className={cn("ml-2 font-mono", left !== null && left <= 7 ? "font-bold text-brown" : "text-ink-soft")}>D-{left}</span>
                  </>
                ) : lastEnd ? (
                  <span className="font-mono text-ink-soft">만료 {dotDate(lastEnd)}</span>
                ) : (
                  <span className="text-ink-soft">회원권 없음</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AdminFrame>
  );
}
