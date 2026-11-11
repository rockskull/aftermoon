/**
 * Club money (회계). Pure functions — no I/O.
 *
 * Two sources, never double-counted:
 *  - Ledger tab: everything entered by the crew (출자금, 일일 이용료, all expenses…)
 *  - Payments tab: approved membership deposits are income automatically
 *    (split into 회비 and 가입비), so nobody types them twice.
 */

export const INCOME_CATEGORIES = ["출자금", "일일 이용료", "이벤트 참가비", "기타 수입"] as const;
export const EXPENSE_CATEGORIES = [
  "임대료·관리비",
  "보증금",
  "시설·공사",
  "장비·용품",
  "소모품",
  "운송",
  "보험",
  "수수료",
  "식음료",
  "기타 지출",
] as const;
/** Categories filled automatically from approved payments (not selectable by hand). */
export const AUTO_INCOME_CATEGORIES = ["회비", "가입비"] as const;
export const METHODS = ["모임통장", "개인 결제", "현금", "기타"] as const;

/** 보증금 comes back when the lease ends: shown apart from running costs. */
export const REFUNDABLE_CATEGORY = "보증금";

export type MoneyKind = "income" | "expense";

export function kindOf(category: string): MoneyKind | null {
  if ((INCOME_CATEGORIES as readonly string[]).includes(category)) return "income";
  if ((AUTO_INCOME_CATEGORIES as readonly string[]).includes(category)) return "income";
  if ((EXPENSE_CATEGORIES as readonly string[]).includes(category)) return "expense";
  return null;
}

export interface MoneyEntry {
  id: string;
  /** Seoul day key */
  date: string;
  kind: MoneyKind;
  category: string;
  description: string;
  /** Always positive; `kind` gives the direction. */
  amount: number;
  person: string;
  method: string;
  receiptUrl: string;
  memo: string;
  source: "ledger" | "payment";
  /** For payment-derived income: the payment and member it came from. */
  paymentId?: string;
  memberId?: string;
  voided: boolean;
}

export interface PaymentLike {
  id: string;
  memberId: string;
  amount: number;
  joiningFee: number;
  planId: string;
  status: string;
  depositedAt: string;
  approvedAt: string;
}

/** Approved deposits as income lines: one for the plan (회비), one for the joining fee (가입비). */
export function entriesFromPayments(
  payments: PaymentLike[],
  names: { member: (id: string) => string; plan: (id: string) => string },
): MoneyEntry[] {
  const out: MoneyEntry[] = [];
  for (const p of payments) {
    if (p.status !== "approved" || p.amount <= 0) continue;
    const date = p.depositedAt || p.approvedAt.slice(0, 10);
    const fee = Math.min(Math.max(p.joiningFee, 0), p.amount);
    const base = {
      date,
      kind: "income" as const,
      person: names.member(p.memberId),
      method: "모임통장",
      receiptUrl: "",
      memo: "",
      source: "payment" as const,
      paymentId: p.id,
      memberId: p.memberId,
      voided: false,
    };
    if (p.amount - fee > 0) {
      out.push({ ...base, id: `${p.id}:fee`, category: "회비", description: `${names.plan(p.planId)} 회원권`, amount: p.amount - fee });
    }
    if (fee > 0) {
      out.push({ ...base, id: `${p.id}:join`, category: "가입비", description: "첫 등록 가입비", amount: fee });
    }
  }
  return out;
}

export interface CategoryTotal {
  category: string;
  amount: number;
  /** 0–1 share of the kind's total */
  share: number;
  count: number;
}

export interface MonthRow {
  /** "YYYY-MM" */
  month: string;
  income: number;
  expense: number;
  /** Balance at the end of the month (cumulative). */
  balance: number;
}

export interface MoneySummary {
  income: number;
  expense: number;
  balance: number;
  /** Paid out as 보증금 (refundable), part of `expense`. */
  refundable: number;
  /** Expenses without 보증금. */
  operatingExpense: number;
  byMonth: MonthRow[];
  incomeByCategory: CategoryTotal[];
  expenseByCategory: CategoryTotal[];
  contributors: Array<{ person: string; amount: number }>;
}

function byCategory(entries: MoneyEntry[]): CategoryTotal[] {
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const map = new Map<string, { amount: number; count: number }>();
  for (const e of entries) {
    const cur = map.get(e.category) ?? { amount: 0, count: 0 };
    map.set(e.category, { amount: cur.amount + e.amount, count: cur.count + 1 });
  }
  return [...map]
    .map(([category, v]) => ({ category, amount: v.amount, count: v.count, share: total ? v.amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

export function summarize(all: MoneyEntry[]): MoneySummary {
  const entries = all.filter((e) => !e.voided && e.amount > 0);
  const income = entries.filter((e) => e.kind === "income");
  const expense = entries.filter((e) => e.kind === "expense");
  const sum = (xs: MoneyEntry[]) => xs.reduce((s, e) => s + e.amount, 0);
  const refundable = sum(expense.filter((e) => e.category === REFUNDABLE_CATEGORY));

  const months = [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort();
  let running = 0;
  const byMonth = months.map((month) => {
    const inMonth = entries.filter((e) => e.date.startsWith(month));
    const mi = sum(inMonth.filter((e) => e.kind === "income"));
    const me = sum(inMonth.filter((e) => e.kind === "expense"));
    running += mi - me;
    return { month, income: mi, expense: me, balance: running };
  });

  const contributors = new Map<string, number>();
  for (const e of income.filter((x) => x.category === "출자금")) {
    const who = e.person || "(이름 없음)";
    contributors.set(who, (contributors.get(who) ?? 0) + e.amount);
  }

  return {
    income: sum(income),
    expense: sum(expense),
    balance: sum(income) - sum(expense),
    refundable,
    operatingExpense: sum(expense) - refundable,
    byMonth,
    incomeByCategory: byCategory(income),
    expenseByCategory: byCategory(expense),
    contributors: [...contributors].map(([person, amount]) => ({ person, amount })).sort((a, b) => b.amount - a.amount),
  };
}

/** Newest first; same day → expenses after income, then by description. */
export function sortEntries(entries: MoneyEntry[]): MoneyEntry[] {
  return [...entries].sort(
    (a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind) || a.description.localeCompare(b.description),
  );
}

/** A spreadsheet app must never run a cell from this file as a formula. */
function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && typeof value !== "number") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 CSV with BOM so Excel opens Korean text correctly. Expenses are negative. */
export function toCsv(entries: MoneyEntry[]): string {
  const header = ["날짜", "구분", "항목", "내용", "금액", "관련인", "결제수단", "메모", "출처"];
  const rows = sortEntries(entries.filter((e) => !e.voided))
    .reverse()
    .map((e) => [
      e.date,
      e.kind === "income" ? "수입" : "지출",
      e.category,
      e.description,
      e.kind === "income" ? e.amount : -e.amount,
      e.person,
      e.method,
      e.memo,
      e.source === "payment" ? `회비 승인(${e.paymentId})` : "장부",
    ]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
