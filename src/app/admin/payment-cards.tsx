import Link from "next/link";
import { dotDate } from "@/components/membership-card";
import { formatDateTimeKo, parseMoment } from "@/lib/dates";
import { nextMembershipPeriod, totalMonths } from "@/lib/membership";
import { formatWon, type ClubPrivate, type Payment } from "@/server/domain/model";
import { approvePayment, cancelApproval, refundPayment, rejectPayment } from "./actions";
import { ActionForm } from "./admin-ui";
import { Pill, smallButton, smallInput, smallPrimary } from "./shared";

const when = (iso: string) => {
  const m = parseMoment(iso);
  return m ? formatDateTimeKo(m.ms) : iso;
};

/** A deposit waiting for the crew: shows the period that approval will create, then approve or reject. */
export function PendingPaymentCard({ payment, club, todayKey }: { payment: Payment; club: ClubPrivate; todayKey: string }) {
  const member = club.members.find((m) => m.id === payment.memberId);
  const plan = club.plans.find((p) => p.id === payment.planId);
  const preview = plan
    ? nextMembershipPeriod({
        existing: club.memberships.filter((m) => m.memberId === payment.memberId),
        plan,
        todayKey,
        requestedStart: payment.requestedStart || null,
      })
    : null;

  return (
    <article className="rounded-lg border-2 border-midnight/25 bg-white/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[16px] font-bold text-midnight">
            <Link href={`/admin/members/${encodeURIComponent(payment.memberId)}`} className="underline-offset-4 hover:underline">
              {member?.name ?? payment.memberId}
            </Link>
            {member?.status === "applicant" && <span className="ml-2 align-middle"><Pill tone="warn">신규</Pill></span>}
          </p>
          <p className="text-[13px] text-ink-soft">
            입금자명 <strong className="text-midnight">{payment.depositorName}</strong> · {plan?.name ?? payment.planId} ·{" "}
            <span className="font-mono font-semibold text-midnight">{formatWon(payment.amount)}</span>
            {payment.joiningFee > 0 && <span> (가입비 {formatWon(payment.joiningFee)} 포함)</span>}
          </p>
          <p className="font-mono text-[11px] text-ink-soft">
            {payment.id} · 신청 {when(payment.requestedAt)}
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-1.5">
          {member?.consentAt ? <Pill tone="ok">동의서 ✓</Pill> : <Pill tone="warn">동의서 미확인</Pill>}
          <Pill tone={payment.status === "matched" ? "ok" : "default"}>{payment.status}</Pill>
        </span>
      </div>
      {member?.consentAt ? (
        <p className="mt-1 text-[12px] text-ink-soft">
          회원 등록 동의서 제출 확인 {when(member.consentAt)} · 실제 응답은 Google Forms 응답 탭에서 성함·연락처로 대조할 수 있어요.
        </p>
      ) : (
        <p className="mt-1 text-[12px] font-medium text-brown">회원 등록 동의서 제출이 확인되지 않았어요. 승인 전에 확인해 주세요.</p>
      )}

      {preview && plan && (
        <p className="mt-3 rounded-md bg-butter-200/60 px-3 py-2 text-[13px] text-midnight">
          승인하면 <strong className="font-mono">{dotDate(preview.startDate)} – {dotDate(preview.endDate)}</strong> ({totalMonths(plan)}개월)
          {preview.extendsExisting ? " · 기존 회원권에 이어서 연장" : ""}
          {payment.requestedStart ? ` · 희망 시작일 ${dotDate(payment.requestedStart)}` : ""}
        </p>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <ActionForm action={approvePayment} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="payment_id" value={payment.id} />
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            입금일
            <input type="date" name="deposited_at" defaultValue={todayKey} max={todayKey} className={smallInput} required />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
            시작일 (바꿀 때만)
            <input type="date" name="start_date" className={smallInput} aria-describedby={`start-${payment.id}`} />
          </label>
          <button type="submit" className={smallPrimary}>
            입금 확인 · 승인
          </button>
          <span id={`start-${payment.id}`} className="sr-only">
            비워 두면 {preview ? dotDate(preview.startDate) : "자동 계산된 날짜"}부터 시작해요.
          </span>
        </ActionForm>
        <ActionForm action={rejectPayment} className="flex items-end gap-2" confirmText="이 신청을 반려할까요?">
          <input type="hidden" name="payment_id" value={payment.id} />
          <input name="reason" placeholder="반려 사유" maxLength={200} className={`${smallInput} w-36`} />
          <button type="submit" className={smallButton}>
            반려
          </button>
        </ActionForm>
      </div>
    </article>
  );
}

/** An approved payment: undo a mistaken approval, or record a refund. */
export function ApprovedPaymentRow({ payment, club }: { payment: Payment; club: ClubPrivate }) {
  const member = club.members.find((m) => m.id === payment.memberId);
  const membership = club.memberships.find((m) => m.sourcePaymentId === payment.id && m.status === "active");
  const approver = club.members.find((m) => m.id === payment.approvedBy);
  return (
    <details className="group rounded-md border border-midnight/20 bg-white/40 px-3 py-2.5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
        <span className="text-[14px]">
          <strong className="text-midnight">{member?.name ?? payment.memberId}</strong>{" "}
          <span className="text-ink-soft">
            {club.plans.find((p) => p.id === payment.planId)?.name} · {formatWon(payment.amount)}
            {payment.joiningFee > 0 && " (가입비 포함)"}
          </span>
        </span>
        <span className="font-mono text-[12px] text-ink-soft">
          {payment.depositedAt && dotDate(payment.depositedAt)} {membership && `→ ${dotDate(membership.startDate)}–${dotDate(membership.endDate)}`}
          <span className="ml-2">{approver ? `by ${approver.name}` : ""}</span>
        </span>
      </summary>
      <div className="mt-3 grid gap-3 border-t border-dashed border-midnight/20 pt-3 md:grid-cols-2">
        <ActionForm action={cancelApproval} className="flex flex-wrap items-end gap-2" confirmText="승인을 취소할까요? 회원권이 무효 처리되고 입금은 확인 대기로 돌아가요.">
          <input type="hidden" name="payment_id" value={payment.id} />
          <input name="reason" required placeholder="승인 취소 사유" maxLength={200} className={`${smallInput} flex-1`} />
          <button type="submit" className={smallButton}>
            승인 취소
          </button>
        </ActionForm>
        <ActionForm action={refundPayment} className="flex flex-wrap items-end gap-2" confirmText="환불 처리할까요? 회원권이 환불 상태로 바뀌어요.">
          <input type="hidden" name="payment_id" value={payment.id} />
          <input name="reason" required placeholder="환불 사유" maxLength={200} className={`${smallInput} flex-1`} />
          <button type="submit" className={smallButton}>
            환불
          </button>
        </ActionForm>
      </div>
    </details>
  );
}
