import { describe, expect, it } from "vitest";
import { entriesFromPayments, kindOf, summarize, toCsv, type MoneyEntry } from "./ledger";

let seq = 0;
const e = (date: string, category: string, amount: number, extra: Partial<MoneyEntry> = {}): MoneyEntry => ({
  id: `L${++seq}`,
  date,
  kind: kindOf(category)!,
  category,
  description: category,
  amount,
  person: "",
  method: "모임통장",
  receiptUrl: "",
  memo: "",
  source: "ledger",
  voided: false,
  ...extra,
});

describe("club money summary", () => {
  // Shape of the crew's existing sheet: contributions, then setup costs.
  const entries = [
    e("2026-10-24", "출자금", 5_000_000, { person: "A" }),
    e("2026-10-24", "출자금", 5_000_000, { person: "B" }),
    e("2026-10-24", "출자금", 100_000, { person: "C" }),
    e("2026-10-26", "보증금", 1_500_000),
    e("2026-10-30", "보증금", 3_000_000),
    e("2026-10-30", "임대료·관리비", 513_000),
    e("2026-11-08", "시설·공사", 1_400_000),
    e("2026-11-11", "장비·용품", 1_747_000),
    e("2026-11-11", "소모품", 99_999, { voided: true }),
  ];

  it("computes the balance like the old sheet (contributions − spending), ignoring voided lines", () => {
    const s = summarize(entries);
    expect(s.income).toBe(10_100_000);
    expect(s.expense).toBe(8_160_000);
    expect(s.balance).toBe(1_940_000);
    expect(s.refundable).toBe(4_500_000);
    expect(s.operatingExpense).toBe(3_660_000);
  });

  it("rolls the balance forward month by month", () => {
    expect(summarize(entries).byMonth).toEqual([
      { month: "2026-10", income: 10_100_000, expense: 5_013_000, balance: 5_087_000 },
      { month: "2026-11", income: 0, expense: 3_147_000, balance: 1_940_000 },
    ]);
  });

  it("ranks spending by category and totals contributions per person", () => {
    const s = summarize(entries);
    expect(s.expenseByCategory.map((c) => c.category)).toEqual(["보증금", "장비·용품", "시설·공사", "임대료·관리비"]);
    expect(s.expenseByCategory[0].share).toBeCloseTo(4_500_000 / 8_160_000);
    expect(s.contributors).toEqual([
      { person: "A", amount: 5_000_000 },
      { person: "B", amount: 5_000_000 },
      { person: "C", amount: 100_000 },
    ]);
  });
});

describe("membership deposits as income", () => {
  const names = { member: (id: string) => `회원${id}`, plan: () => "1개월" };

  it("splits an approved deposit into 회비 and 가입비, and skips anything not approved", () => {
    const lines = entriesFromPayments(
      [
        { id: "P1", memberId: "1", amount: 180_000, joiningFee: 100_000, planId: "1M", status: "approved", depositedAt: "2026-11-11", approvedAt: "" },
        { id: "P2", memberId: "2", amount: 80_000, joiningFee: 0, planId: "1M", status: "pending", depositedAt: "", approvedAt: "" },
        { id: "P3", memberId: "3", amount: 80_000, joiningFee: 0, planId: "1M", status: "refunded", depositedAt: "2026-11-01", approvedAt: "" },
      ],
      names,
    );
    expect(lines.map((l) => [l.category, l.amount, l.person, l.date])).toEqual([
      ["회비", 80_000, "회원1", "2026-11-11"],
      ["가입비", 100_000, "회원1", "2026-11-11"],
    ]);
    expect(summarize(lines).income).toBe(180_000);
  });
});

describe("CSV export", () => {
  it("has a BOM, signs expenses negative and neutralizes formulas", () => {
    const csv = toCsv([e("2026-11-01", "소모품", 5000, { description: "=HYPERLINK(\"x\")" }), e("2026-11-01", "출자금", 100)]);
    expect(csv.startsWith("﻿날짜,구분")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(",-5000,");
  });
});
