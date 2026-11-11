import Image from "next/image";
import moon from "@/app/icon.png";
import { accessUntil, currentMembership, inclusiveDays, membershipPhase } from "@/lib/membership";
import type { Member, Membership, Payment, Plan } from "@/server/domain/model";
import { cn } from "./ui";

export const dotDate = (key: string) => key.replace(/-/g, ".");

export interface MembershipSummary {
  phase: "active" | "scheduled" | "expired" | "pending" | "none";
  current: Membership | null;
  plan: Plan | null;
  /** Last day of access across chained memberships. */
  validUntil: string | null;
  daysLeft: number;
  pending: Payment | null;
}

export function summarizeMembership(args: {
  memberId: string | null;
  memberships: Membership[];
  payments: Payment[];
  plans: Plan[];
  todayKey: string;
}): MembershipSummary {
  const mine = args.memberships.filter((m) => m.memberId === args.memberId);
  const current = currentMembership(mine, args.todayKey);
  const pending = args.payments.find((p) => p.memberId === args.memberId && (p.status === "pending" || p.status === "matched")) ?? null;
  const until = accessUntil(mine, args.todayKey);
  const plan = args.plans.find((p) => p.id === current?.planId) ?? null;

  if (current) {
    const phase = membershipPhase(current, args.todayKey);
    if (phase === "active") {
      return { phase: "active", current, plan, validUntil: until, daysLeft: inclusiveDays(args.todayKey, until!), pending };
    }
    if (phase === "scheduled") return { phase: "scheduled", current, plan, validUntil: until, daysLeft: 0, pending };
  }
  if (pending) return { phase: "pending", current, plan, validUntil: null, daysLeft: 0, pending };
  if (current) return { phase: "expired", current, plan, validUntil: current.endDate, daysLeft: 0, pending };
  return { phase: "none", current: null, plan: null, validUntil: null, daysLeft: 0, pending: null };
}

/** Club membership card: MY MEMBERSHIP / ACTIVE / 42 DAYS LEFT / VALID UNTIL 2026.12.31 */
export function MembershipCard({ member, summary, compact = false }: { member: Member | null; summary: MembershipSummary; compact?: boolean }) {
  const { phase } = summary;
  const status = {
    active: "Active",
    scheduled: "Starts soon",
    expired: "Expired",
    pending: "Pending",
    none: "No membership",
  }[phase];

  let headline: string;
  let detail: string | null = null;
  switch (phase) {
    case "active":
      headline = summary.daysLeft === 1 ? "Last day" : `${summary.daysLeft} days left`;
      detail = `Valid until ${dotDate(summary.validUntil!)}`;
      break;
    case "scheduled":
      headline = `Starts ${dotDate(summary.current!.startDate)}`;
      detail = `Valid until ${dotDate(summary.validUntil!)}`;
      break;
    case "expired":
      headline = "See you again";
      detail = `Ended ${dotDate(summary.current!.endDate)}`;
      break;
    case "pending":
      headline = "Checking deposit";
      detail = "입금 확인 중";
      break;
    default:
      headline = "Join the club";
      detail = "회원권을 신청해 주세요";
  }

  return (
    <section
      aria-label="내 회원권"
      className={cn(
        "night relative isolate overflow-hidden rounded-xl text-cream shadow-[4px_4px_0_0_var(--color-midnight)]",
        compact ? "p-4" : "p-5 sm:p-6",
      )}
    >
      {/* Printed-card frame */}
      <div className="pointer-events-none absolute inset-2 -z-10 rounded-lg border border-cream/15" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-cream/70">My membership</p>
          <p
            className={cn(
              "mt-2 inline-flex items-center gap-2 font-mono text-[13px] font-semibold uppercase tracking-[0.14em]",
              phase === "active" || phase === "scheduled" ? "text-butter" : "text-cream/70",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                phase === "active" ? "bg-butter" : phase === "scheduled" || phase === "pending" ? "border border-butter" : "bg-cream/40",
              )}
              aria-hidden="true"
            />
            {status}
          </p>
        </div>
        <Image src={moon} alt="" width={compact ? 36 : 44} height={compact ? 36 : 44} className="rounded-full" />
      </div>

      <p
        className={cn(
          "mt-3 font-display font-extrabold uppercase leading-[0.9]",
          compact ? "text-[40px]" : "text-[52px] sm:text-[60px]",
          phase === "expired" || phase === "none" ? "text-cream/80" : "text-cream",
        )}
      >
        {headline}
      </p>
      {detail && (
        <p
          className={cn(
            "mt-2 text-[13px] text-cream/80",
            // Dates/English read like a printed card; Korean stays in the normal face.
            /^[\x20-\x7E]*$/.test(detail) ? "font-mono uppercase tracking-[0.1em]" : "font-medium",
          )}
        >
          {detail}
        </p>
      )}

      {!compact && (
        <div className="mt-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-t border-dashed border-cream/25 pt-3 text-[13px]">
          <p className="font-medium">{member?.name ?? "—"}</p>
          <p className="font-mono text-[12px] text-cream/60">
            {summary.plan ? `${summary.plan.name} · ` : ""}
            {member?.id ?? "NOT REGISTERED"}
          </p>
        </div>
      )}
    </section>
  );
}
