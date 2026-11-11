import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { dotDate } from "@/components/membership-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import { membershipPhase } from "@/lib/membership";
import { requireOperator } from "@/server/auth/viewer";
import { formatWon } from "@/server/domain/model";
import { storeMode } from "@/server/store";
import { editMember, editMembership } from "../../actions";
import { ActionForm } from "../../admin-ui";
import { ApprovedPaymentRow, PendingPaymentCard } from "../../payment-cards";
import { AdminFrame, AdminSkeleton, Box, Pill, smallButton, smallInput, smallPrimary } from "../../shared";

export const metadata: Metadata = { title: "회원 상세", robots: { index: false } };

export default function MemberPage({ params }: PageProps<"/admin/members/[id]">) {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <MemberDetail params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function MemberDetail({ params }: Pick<PageProps<"/admin/members/[id]">, "params">) {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const { id } = await params;
  const now = await requestNow();
  const viewer = await requireOperator(`/admin/members/${id}`);
  const { club } = viewer;
  const member = club.members.find((m) => m.id === decodeURIComponent(id));
  if (!member) notFound();
  const todayKey = toDateKey(now);
  const isAdmin = viewer.member.role === "admin";

  const memberships = club.memberships.filter((m) => m.memberId === member.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const payments = club.payments.filter((p) => p.memberId === member.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const planName = (pid: string) => club.plans.find((p) => p.id === pid)?.name ?? pid;

  return (
    <AdminFrame tab="members" title={member.name || member.id}>
      <Link href="/admin/members" className="text-[13px] font-bold text-ink-soft hover:text-midnight">
        ← 회원 목록
      </Link>
      <div className="mt-4 flex flex-col gap-6">
        <Box title="회원 정보">
          <p className="mb-1 font-mono text-[12px] text-ink-soft">
            {member.id} · {member.email} · 가입 {member.joinedAt ? dotDate(member.joinedAt) : "—"}
          </p>
          <p className="mb-3 text-[13px]">
            회원 등록 동의서:{" "}
            {member.consentAt ? (
              <span className="font-medium text-midnight">제출 확인 {member.consentAt.slice(0, 10).replace(/-/g, ".")}</span>
            ) : (
              <span className="font-medium text-brown">미확인 (회원이 MY 화면에서 제출 후 확인해야 해요)</span>
            )}
          </p>
          <ActionForm action={editMember} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="member_id" value={member.id} />
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
              이름
              <input name="name" defaultValue={member.name} maxLength={40} className={smallInput} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
              입금자명
              <input name="depositor_name" defaultValue={member.depositorName} maxLength={20} className={smallInput} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
              계정 상태
              <select name="status" defaultValue={member.status} className={smallInput}>
                <option value="applicant">applicant (신청자)</option>
                <option value="active">active (회원)</option>
                <option value="inactive">inactive (이용 중지)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
              권한 {isAdmin ? "" : "(admin만 변경)"}
              <select name="role" defaultValue={member.role} disabled={!isAdmin} className={smallInput}>
                <option value="member">member</option>
                <option value="operator">operator (운영진)</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft sm:col-span-2">
              운영 메모 (회원에게 보이지 않음)
              <input name="memo" defaultValue={member.memo} maxLength={300} className={smallInput} />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={smallPrimary}>
                저장
              </button>
            </div>
          </ActionForm>
        </Box>

        <Box title="회원권">
          {memberships.length === 0 ? (
            <p className="text-[14px] text-ink-soft">회원권 기록이 없어요. 입금이 승인되면 생겨요.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {memberships.map((m) => (
                <li key={m.id} className="rounded-md border border-midnight/20 bg-white/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[15px] font-bold text-midnight">
                      {planName(m.planId)} <span className="font-mono text-[13px] font-normal">{dotDate(m.startDate)} – {dotDate(m.endDate)}</span>
                    </span>
                    <Pill tone={membershipPhase(m, todayKey) === "active" ? "ok" : "muted"}>{membershipPhase(m, todayKey)}</Pill>
                  </div>
                  {m.note && <p className="mt-1 text-[12px] text-ink-soft">{m.note}</p>}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[13px] font-bold text-midnight">기간·상태 수정</summary>
                    <ActionForm action={editMembership} className="mt-2 flex flex-wrap items-end gap-2" confirmText="회원권을 수정할까요? 변경 이력이 남아요.">
                      <input type="hidden" name="membership_id" value={m.id} />
                      <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
                        시작일
                        <input type="date" name="start_date" defaultValue={m.startDate} required className={smallInput} />
                      </label>
                      <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
                        종료일
                        <input type="date" name="end_date" defaultValue={m.endDate} required className={smallInput} />
                      </label>
                      <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
                        상태
                        <select name="status" defaultValue={m.status} className={smallInput}>
                          <option value="active">active</option>
                          <option value="canceled">canceled</option>
                          <option value="refunded">refunded</option>
                        </select>
                      </label>
                      <label className="flex min-w-40 flex-1 flex-col gap-1 text-[12px] font-medium text-ink-soft">
                        변경 사유 (필수)
                        <input name="reason" required maxLength={200} placeholder="예: 부상으로 2주 연장" className={smallInput} />
                      </label>
                      <button type="submit" className={smallButton}>
                        수정
                      </button>
                    </ActionForm>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Box>

        <Box title="회비">
          {payments.length === 0 ? (
            <p className="text-[14px] text-ink-soft">회비 기록이 없어요.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {payments.map((p) =>
                p.status === "pending" || p.status === "matched" ? (
                  <PendingPaymentCard key={p.id} payment={p} club={club} todayKey={todayKey} />
                ) : p.status === "approved" ? (
                  <ApprovedPaymentRow key={p.id} payment={p} club={club} />
                ) : (
                  <p key={p.id} className="flex justify-between rounded-md border border-dashed border-midnight/20 px-3 py-2 text-[14px]">
                    <span>
                      {planName(p.planId)} · {formatWon(p.amount)} {p.note && <span className="text-ink-soft">({p.note})</span>}
                    </span>
                    <Pill tone="muted">{p.status}</Pill>
                  </p>
                ),
              )}
            </div>
          )}
        </Box>
      </div>
    </AdminFrame>
  );
}
