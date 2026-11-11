import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { matchDeposits, parseBankFile, parseBankRows } from "./bank";
import { parsePrivate } from "./model";

/** A statement shaped like a typical Korean bank export: title rows, then a header. */
function statement(rows: unknown[][]): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["카카오뱅크 거래내역"],
    ["예금주", "애프터문"],
    ["조회기간", "2026.11.01 ~ 2026.11.11"],
    [],
    ["거래일시", "구분", "거래금액", "거래 후 잔액", "거래구분", "내용", "메모"],
    ...rows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "거래내역");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

const FILE_ROWS = [
  ["2026.11.10 14:22:05", "입금", "80,000", "1,280,000", "일반입금", "김수아", ""],
  ["2026.11.10 18:01:44", "출금", "-35,000", "1,245,000", "체크카드", "초크 구매", ""],
  ["2026.11.11 09:12:30", "입금", "500,000", "1,745,000", "일반입금", "이지민", "연장"],
  ["2026.11.11 10:00:00", "입금", "40,000", "1,785,000", "일반입금", "최현우", ""],
  ["2026.11.11 11:30:00", "입금", "80,000", "1,865,000", "일반입금", "박엄마", "대리입금"],
];

const club = () =>
  parsePrivate({
    Members: [
      { member_id: "SUA", name: "수아", email: "s@x", depositor_name: "김수아", role: "member", status: "applicant" },
      { member_id: "JIMIN", name: "지민", email: "j@x", depositor_name: "이지민", role: "member", status: "active" },
      { member_id: "HW", name: "현우", email: "h@x", depositor_name: "최현우", role: "member", status: "active" },
      { member_id: "KID", name: "박하늘", email: "k@x", depositor_name: "박하늘", role: "member", status: "applicant" },
    ],
    Plans: [
      { plan_id: "1M", name: "1개월", price: 80000, duration_months: 1, bonus_months: 0, active: true },
      { plan_id: "6M", name: "6개월", price: 500000, duration_months: 6, bonus_months: 1, active: true },
    ],
    Payments: [
      { payment_id: "P-SUA", member_id: "SUA", depositor_name: "김수아", amount: 80000, plan_id: "1M", status: "pending", requested_at: "2026-11-09T20:00:00+09:00" },
      { payment_id: "P-JIMIN", member_id: "JIMIN", depositor_name: "이지민", amount: 500000, plan_id: "6M", status: "approved", bank_transaction_id: "" },
      { payment_id: "P-HW", member_id: "HW", depositor_name: "최현우", amount: 80000, plan_id: "1M", status: "pending", requested_at: "2026-11-10T20:00:00+09:00" },
      { payment_id: "P-KID", member_id: "KID", depositor_name: "박하늘", amount: 80000, plan_id: "1M", status: "pending", requested_at: "2026-11-10T21:00:00+09:00" },
    ],
  });

describe("bank statement parsing", () => {
  it("finds the header below title rows and keeps deposits only", () => {
    const deposits = parseBankFile(statement(FILE_ROWS));
    expect(deposits.map((d) => [d.dateKey, d.name, d.amount])).toEqual([
      ["2026-11-10", "김수아", 80000],
      ["2026-11-11", "이지민", 500000],
      ["2026-11-11", "최현우", 40000],
      ["2026-11-11", "박엄마", 80000],
    ]);
    expect(deposits[0].at).toBe(Date.parse("2026-11-10T14:22:05+09:00"));
  });

  it("gives the same transaction keys when the same file is uploaded again", () => {
    const a = parseBankFile(statement(FILE_ROWS)).map((d) => d.key);
    const b = parseBankFile(statement(FILE_ROWS)).map((d) => d.key);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });

  it("supports separate 입금액/출금액 columns", () => {
    const deposits = parseBankRows([
      ["거래일자", "거래시간", "적요", "출금액", "입금액", "잔액"],
      ["2026-11-11", "09:00:00", "김수아", "0", "80000", "100000"],
      ["2026-11-11", "10:00:00", "관리비", "50000", "0", "50000"],
    ]);
    expect(deposits).toHaveLength(1);
    expect(deposits[0]).toMatchObject({ name: "김수아", amount: 80000, dateKey: "2026-11-11" });
  });

  it("explains when the layout is not recognized", () => {
    expect(() => parseBankRows([["이름", "전화번호"], ["a", "b"]])).toThrow(/거래일시와 금액/);
  });
});

describe("deposit matching", () => {
  const deposits = () => parseBankFile(statement(FILE_ROWS));

  it("suggests exact name+amount matches, flags partial and proxy deposits", () => {
    const result = matchDeposits(deposits(), club(), "2026-11-11");
    const byName = Object.fromEntries(result.map((m) => [m.deposit.name, m]));

    expect(byName["김수아"]).toMatchObject({ kind: "exact", candidates: [{ paymentId: "P-SUA" }] });
    expect(byName["최현우"].kind).toBe("review");
    expect(byName["최현우"].candidates[0].notes[0]).toMatch(/부분 입금/);
    expect(byName["박엄마"].kind).toBe("review"); // same amount, different name → proxy deposit?
    expect(byName["박엄마"].candidates.map((c) => c.paymentId)).toContain("P-KID");
    expect(byName["이지민"].kind).toBe("unmatched"); // her payment is already approved
  });

  it("marks deposits already used by an approval so re-uploads never apply twice", () => {
    const data = club();
    const sua = deposits().find((d) => d.name === "김수아")!;
    data.payments[0] = { ...data.payments[0], status: "approved", bankTransactionId: sua.key };
    const result = matchDeposits(deposits(), data, "2026-11-11");
    expect(result.find((m) => m.deposit.key === sua.key)).toMatchObject({ kind: "applied", appliedTo: { paymentId: "P-SUA" } });
  });
});
