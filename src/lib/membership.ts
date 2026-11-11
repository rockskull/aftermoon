import { addDays, daysInMonth, makeDateKey } from "./dates";

/**
 * Membership period engine. Pure functions on Seoul day keys ("YYYY-MM-DD").
 *
 * Period rule (Korean Civil Act art. 160, counting the first day):
 *  - the start day is included, the end day is included;
 *  - a period of N months ends the day before the same day-of-month N months
 *    later (2026-11-11 + 1 month → 2026-12-10);
 *  - if that day does not exist in the final month, the period ends on the last
 *    day of that month (2026-01-31 + 1 month → 2026-02-28; leap years handled).
 */
export function membershipEndDate(startKey: string, months: number): string {
  if (!Number.isInteger(months) || months < 1) throw new RangeError(`months must be a positive integer, got ${months}`);
  const [y, m, d] = startKey.split("-").map(Number);
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = (targetMonthIndex % 12) + 1;
  if (d > daysInMonth(ty, tm)) return makeDateKey(ty, tm, daysInMonth(ty, tm));
  return addDays(makeDateKey(ty, tm, d), -1);
}

/** Inclusive number of days in [start, end]. */
export function inclusiveDays(startKey: string, endKey: string): number {
  return Math.round((Date.parse(`${endKey}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) / 86_400_000) + 1;
}

export interface PlanTerms {
  durationMonths: number;
  bonusMonths: number;
}

export function totalMonths(plan: PlanTerms): number {
  return plan.durationMonths + plan.bonusMonths;
}

/** Stored state of a membership row. Validity (active/expired) is derived from dates. */
export type MembershipRecordStatus = "active" | "canceled" | "refunded";
export type MembershipPhase = "scheduled" | "active" | "expired" | "canceled" | "refunded";

export interface MembershipPeriod {
  id: string;
  startDate: string;
  endDate: string;
  status: MembershipRecordStatus;
}

export function membershipPhase(m: MembershipPeriod, todayKey: string): MembershipPhase {
  if (m.status !== "active") return m.status;
  if (todayKey < m.startDate) return "scheduled";
  if (todayKey > m.endDate) return "expired";
  return "active";
}

/** Only rows that still grant access (not canceled/refunded). */
function valid<T extends MembershipPeriod>(memberships: T[]): T[] {
  return memberships.filter((m) => m.status === "active");
}

/**
 * The membership to show the member: the one in effect today, else the next
 * scheduled one, else the most recently ended one.
 */
export function currentMembership<T extends MembershipPeriod>(memberships: T[], todayKey: string): T | null {
  const rows = valid(memberships);
  const inEffect = rows.filter((m) => m.startDate <= todayKey && todayKey <= m.endDate);
  if (inEffect.length) return inEffect.sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const upcoming = rows.filter((m) => m.startDate > todayKey).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming.length) return upcoming[0];
  const past = rows.sort((a, b) => b.endDate.localeCompare(a.endDate));
  return past[0] ?? null;
}

/** Last day of access across all valid memberships (null if none reaches today). */
export function accessUntil(memberships: MembershipPeriod[], todayKey: string): string | null {
  const ends = valid(memberships)
    .filter((m) => m.endDate >= todayKey)
    .map((m) => m.endDate)
    .sort();
  return ends.at(-1) ?? null;
}

/** Days of access left including today (today = last day → 1). 0 when not in effect. */
export function daysLeft(m: MembershipPeriod, todayKey: string): number {
  if (membershipPhase(m, todayKey) !== "active") return 0;
  return inclusiveDays(todayKey, m.endDate);
}

export interface NextPeriod {
  startDate: string;
  endDate: string;
  /** true when chained after an existing membership, so remaining days are kept. */
  extendsExisting: boolean;
}

/**
 * Period for a newly approved payment.
 *  - Member still has access (now or scheduled): starts the day after the last
 *    valid end date, so no remaining day is lost.
 *  - Otherwise (new or expired member): starts on `requestedStart` if the crew
 *    chose one, else today.
 * An explicit `startOverride` from the crew always wins.
 */
export function nextMembershipPeriod(args: {
  existing: MembershipPeriod[];
  plan: PlanTerms;
  todayKey: string;
  requestedStart?: string | null;
  startOverride?: string | null;
}): NextPeriod {
  const months = totalMonths(args.plan);
  const lastEnd = accessUntil(args.existing, args.todayKey);

  if (args.startOverride) {
    return {
      startDate: args.startOverride,
      endDate: membershipEndDate(args.startOverride, months),
      extendsExisting: lastEnd !== null && args.startOverride === addDays(lastEnd, 1),
    };
  }
  if (lastEnd) {
    const startDate = addDays(lastEnd, 1);
    return { startDate, endDate: membershipEndDate(startDate, months), extendsExisting: true };
  }
  const startDate = args.requestedStart && args.requestedStart >= args.todayKey ? args.requestedStart : args.todayKey;
  return { startDate, endDate: membershipEndDate(startDate, months), extendsExisting: false };
}

/** Valid memberships whose dates overlap [start, end]; used to warn the crew before saving. */
export function overlapping<T extends MembershipPeriod>(memberships: T[], startKey: string, endKey: string, ignoreId?: string): T[] {
  return valid(memberships).filter((m) => m.id !== ignoreId && m.startDate <= endKey && startKey <= m.endDate);
}
