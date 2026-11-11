import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { CopyButton, InstallHint } from "@/components/client-bits";
import { dotDate, MembershipCard, summarizeMembership } from "@/components/membership-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, cn, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import { membershipPhase, totalMonths } from "@/lib/membership";
import { isOperator, requireViewer } from "@/server/auth/viewer";
import { formatWon, isFirstJoin, type Payment } from "@/server/domain/model";
import { storeMode } from "@/server/store";
import { ApplyForm, ConsentConfirm } from "./apply-form";

export const metadata: Metadata = { title: "My membership", robots: { index: false } };

export default function MePage() {
  return (
    <>
      <SiteHeader current="me" />
      <main className="paper flex-1">
        <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
          <Suspense fallback={<MeSkeleton />}>
            <MyMembership />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

const PAYMENT_LABEL: Record<Payment["status"], string> = {
  pending: "입금 확인 대기",
  matched: "입금 확인 중",
  approved: "승인 완료",
  rejected: "반려",
  refunded: "환불",
};

async function MyMembership() {
  if (storeMode() === "unconfigured") return <NotReady />;
  const now = await requestNow();
  const viewer = await requireViewer("/me");
  const { member, club, session } = viewer;
  const todayKey = toDateKey(now);

  const summary = summarizeMembership({
    memberId: member?.id ?? null,
    memberships: club.memberships,
    payments: club.payments,
    plans: club.plans,
    todayKey,
  });
  const myPayments = club.payments
    .filter((p) => p.memberId === member?.id)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const myMemberships = club.memberships
    .filter((m) => m.memberId === member?.id)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const planName = (id: string) => club.plans.find((p) => p.id === id)?.name ?? id;
  const activePlans = club.plans.filter((p) => p.active);
  const inactive = member?.status === "inactive";
  const joiningFee = isFirstJoin(club, member) ? club.settings.joiningFee : 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">My membership</p>
          <h1 className="mt-1 text-[24px] font-extrabold text-midnight">{member?.name ?? session.name}님</h1>
          <p className="font-mono text-[12px] text-ink-soft">{session.email}</p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="h-10 font-label text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft underline underline-offset-4 hover:text-midnight">
            Logout
          </button>
        </form>
      </div>

      <MembershipCard member={member} summary={summary} />

      {summary.pending && <DepositGuide payment={summary.pending} planName={planName(summary.pending.planId)} settings={club.settings} />}

      {member && summary.current && (
        <Panel title="이용 정보">
          <dl className="divide-y divide-plywood-400 text-[15px]">
            <Row label="회원권">{planName(summary.current.planId)}</Row>
            <Row label="이용 시작일">
              <span className="font-mono">{dotDate(summary.current.startDate)}</span>
            </Row>
            <Row label="만료일">
              <span className="font-mono">{dotDate(summary.validUntil ?? summary.current.endDate)}</span>
              {summary.validUntil && summary.validUntil !== summary.current.endDate && (
                <span className="ml-2 text-[13px] text-ink-soft">(연장분 포함)</span>
              )}
            </Row>
            <Row label="남은 이용일">
              <span className="font-mono">{summary.phase === "active" ? `${summary.daysLeft}일` : "—"}</span>
            </Row>
            <Row label="회비 납부">{myPayments[0] ? PAYMENT_LABEL[myPayments[0].status] : "—"}</Row>
          </dl>
        </Panel>
      )}

      {member && !member.consentAt && !inactive && (
        <Panel title="회원 등록 동의서">
          <p className="mb-4 text-[14px] leading-relaxed text-ink-soft">
            아직 회원 등록 동의서 제출이 확인되지 않았어요. 동의서를 제출하고 확인해 주세요. 확인 후 회원권을 신청·연장할 수 있어요.
          </p>
          <ConsentConfirm url={club.settings.consent.member} />
        </Panel>
      )}

      {inactive ? (
        <p className="rounded-md border-2 border-brown bg-ivory px-4 py-3 text-[14px] text-brown">
          이용이 중지된 계정이에요. 운영진에게 문의해 주세요.
        </p>
      ) : (
        !summary.pending &&
        activePlans.length > 0 &&
        (!member || member.consentAt) && (
          <Panel title={summary.phase === "active" || summary.phase === "scheduled" ? "회원권 연장 신청" : "회원권 신청"}>
            <p className="mb-5 text-[14px] leading-relaxed text-ink-soft">
              신청 후 모임통장으로 회비를 보내 주세요. 운영진이 입금을 확인하면 회원권이 시작돼요.
            </p>
            <ApplyForm
              plans={activePlans.map((p) => ({
                id: p.id,
                name: p.name,
                priceLabel: formatWon(p.price),
                totalLabel: joiningFee ? formatWon(p.price + joiningFee) : null,
                totalMonths: totalMonths(p),
                bonusMonths: p.bonusMonths,
                description: p.description,
              }))}
              isExtension={summary.phase === "active" || summary.phase === "scheduled"}
              defaultName={session.name}
              defaultDepositor={member?.depositorName || member?.name || session.name}
              needsName={!member}
              today={todayKey}
              consentUrl={member ? null : club.settings.consent.member}
              joiningFeeLabel={joiningFee ? formatWon(joiningFee) : null}
            />
          </Panel>
        )
      )}

      {(myMemberships.length > 0 || myPayments.length > 0) && (
        <Panel title="기록">
          <ul className="flex flex-col gap-2 text-[14px]">
            {myMemberships.map((m) => (
              <li key={m.id} className={cn("flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-ivory px-3 py-2.5", m.status !== "active" && "opacity-60")}>
                <span className="font-medium">
                  {planName(m.planId)} 회원권
                  <span className="ml-2 font-mono text-[11px] uppercase text-ink-soft">{membershipPhase(m, todayKey)}</span>
                </span>
                <span className="font-mono text-[13px] text-ink-soft">
                  {dotDate(m.startDate)} – {dotDate(m.endDate)}
                </span>
              </li>
            ))}
            {myPayments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-dashed border-midnight/20 px-3 py-2.5">
                <span>
                  {planName(p.planId)} · {formatWon(p.amount)}
                  {p.joiningFee > 0 && <span className="ml-1 text-[12px] text-ink-soft">(가입비 포함)</span>}
                </span>
                <span className="text-[13px] text-ink-soft">
                  {PAYMENT_LABEL[p.status]}
                  {p.depositedAt && <span className="ml-1.5 font-mono">{dotDate(p.depositedAt)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <InstallHint />

      <nav aria-label="회원 메뉴" className="flex flex-col divide-y divide-plywood-400 rounded-lg border-2 border-midnight bg-ivory">
        <MenuLink href="/notifications">알림 목록 · 알림 설정</MenuLink>
        {isOperator(member) && <MenuLink href="/admin">운영진 관리 화면</MenuLink>}
      </nav>
    </div>
  );
}

function DepositGuide({ payment, planName, settings }: { payment: Payment; planName: string; settings: { bankName: string; accountNumber: string; accountHolder: string; depositNotice: string } }) {
  return (
    <section aria-labelledby="deposit-title" className="rounded-lg border-2 border-midnight bg-butter-200/70 p-5 shadow-[4px_4px_0_0_var(--color-midnight)]">
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.28em] text-brown">Deposit</p>
      <h2 id="deposit-title" className="mt-1 text-[19px] font-extrabold text-midnight">
        모임통장으로 회비를 보내 주세요
      </h2>
      <dl className="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[15px]">
        <dt className="text-ink-soft">입금 계좌</dt>
        <dd className="text-midnight">
          <span className="block text-[13px] text-ink-soft">{settings.bankName}</span>
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[17px] font-semibold">{settings.accountNumber || "운영진에게 문의"}</span>
            {settings.accountNumber && <CopyButton text={settings.accountNumber.replace(/[^\d]/g, "")} label="계좌 복사" />}
          </span>
          {settings.accountHolder && <span className="block text-[13px] text-ink-soft">예금주 {settings.accountHolder}</span>}
        </dd>
        <dt className="text-ink-soft">금액</dt>
        <dd className="text-midnight">
          <span className="font-mono text-[17px] font-semibold">{formatWon(payment.amount)}</span>
          <span className="block text-[13px] text-ink-soft">
            {payment.joiningFee > 0
              ? `${planName} ${formatWon(payment.amount - payment.joiningFee)} + 가입비 ${formatWon(payment.joiningFee)}`
              : planName}
          </span>
        </dd>
        <dt className="text-ink-soft">입금자명</dt>
        <dd className="font-semibold text-midnight">{payment.depositorName}</dd>
        <dt className="text-ink-soft">상태</dt>
        <dd className="text-midnight">{PAYMENT_LABEL[payment.status]}</dd>
      </dl>
      {settings.depositNotice && <p className="mt-4 text-[13px] leading-relaxed text-brown">{settings.depositNotice}</p>}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border-2 border-midnight bg-ivory/80 p-5">
      <h2 className="mb-4 border-b-2 border-midnight pb-2 text-[18px] font-extrabold text-midnight">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 py-2.5">
      <dt className="text-[13px] font-medium text-ink-soft">{label}</dt>
      <dd className="text-midnight">{children}</dd>
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="flex h-14 items-center justify-between px-4 text-[15px] font-semibold text-midnight hover:bg-butter-200/50">
      {children}
      <ArrowRight className="size-4" />
    </Link>
  );
}

function MeSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="회원 정보를 불러오는 중">
      <div className="h-16 w-48 animate-pulse rounded bg-ivory/60" />
      <div className="h-[260px] animate-pulse rounded-xl bg-midnight/80" />
      <div className="h-40 animate-pulse rounded-lg bg-ivory/60" />
    </div>
  );
}
