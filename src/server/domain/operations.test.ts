import { describe, expect, it } from "vitest";
import { applyCommit, type Commit } from "../store/commit";
import { MemoryStore } from "../store/memory";
import type { Row, Tables } from "../store/schema";
import { parsePrivate } from "./model";
import {
  planApplication,
  planApproval,
  planCancelApproval,
  planLedgerAdd,
  planLedgerEdit,
  planLedgerVoid,
  planMemberConsent,
  planMembershipEdit,
} from "./operations";

const NOW = Date.parse("2026-11-11T12:00:00+09:00");

function baseTables(): Tables {
  const member = (id: string, email: string, status = "active", role = "member"): Row => ({
    member_id: id,
    name: id,
    email,
    depositor_name: id,
    role,
    status,
    applied_at: "",
    joined_at: status === "active" ? "2026-01-01" : "",
    memo: "",
  });
  const payment = (id: string, memberId: string, planId: string, amount: number, status = "pending"): Row => ({
    payment_id: id,
    member_id: memberId,
    depositor_name: memberId,
    amount,
    plan_id: planId,
    status,
    requested_at: "",
    requested_start: "",
    deposited_at: "",
    bank_transaction_id: "",
    approved_by: "",
    approved_at: "",
    note: "",
  });
  return {
    Members: [member("OP", "op@x.dev", "active", "operator"), member("NEW", "new@x.dev", "applicant"), member("OLD", "old@x.dev")],
    Plans: [
      { plan_id: "1M", name: "1개월", price: 80000, duration_months: 1, bonus_months: 0, active: true, sort_order: 1, description: "" },
      { plan_id: "6M", name: "6개월", price: 500000, duration_months: 6, bonus_months: 1, active: true, sort_order: 2, description: "" },
    ],
    Payments: [payment("P-NEW", "NEW", "1M", 80000), payment("P-OLD-A", "OLD", "1M", 80000), payment("P-OLD-B", "OLD", "6M", 500000)],
    Memberships: [
      {
        membership_id: "MS-OLD",
        member_id: "OLD",
        plan_id: "1M",
        start_date: "2026-11-01",
        end_date: "2026-11-30",
        status: "active",
        source_payment_id: "P-OLD-0",
        created_at: "",
        updated_at: "",
        note: "",
      },
    ],
    Notifications: [],
    AuditLog: [],
  };
}

function commitOf(planned: ReturnType<typeof planApproval>): Commit {
  if ("refuse" in planned) throw new Error(`refused: ${planned.refuse}`);
  return planned.commit;
}

describe("payment approval", () => {
  it("activates a new member from today and records everything", () => {
    const t = baseTables();
    expect(applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" })))).toEqual({ ok: true });

    const club = parsePrivate(t);
    const ms = club.memberships.find((m) => m.sourcePaymentId === "P-NEW")!;
    expect([ms.startDate, ms.endDate, ms.status]).toEqual(["2026-11-11", "2026-12-10", "active"]);
    expect(club.payments.find((p) => p.id === "P-NEW")).toMatchObject({ status: "approved", approvedBy: "OP", depositedAt: "2026-11-11" });
    expect(club.members.find((m) => m.id === "NEW")).toMatchObject({ status: "active", joinedAt: "2026-11-11" });
    expect(club.notifications.map((n) => n.type)).toEqual(["payment_approved"]);
    expect(t.AuditLog).toHaveLength(1);
    expect(t.AuditLog![0]).toMatchObject({ actor_id: "OP", action: "payment.approve", target_id: "P-NEW" });
  });

  it("is never active before approval", () => {
    const club = parsePrivate(baseTables());
    expect(club.memberships.some((m) => m.memberId === "NEW")).toBe(false);
  });

  it("extension keeps the remaining days", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-B" })));
    const ms = parsePrivate(t).memberships.find((m) => m.sourcePaymentId === "P-OLD-B")!;
    // existing ends 11/30 → 6+1 months from 12/01
    expect([ms.startDate, ms.endDate]).toEqual(["2026-12-01", "2027-06-30"]);
  });

  it("refuses a second approval of the same payment", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" })));
    expect(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" })).toEqual({ refuse: "이미 승인된 입금이에요." });
  });

  it("two operators approving the same payment at once: only one lands", () => {
    const t = baseTables();
    const a = commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" }));
    const b = commitOf(planApproval(t, { now: NOW + 1000, actorId: "OP", paymentId: "P-NEW" }));
    expect(applyCommit(t, a)).toEqual({ ok: true });
    expect(applyCommit(t, b)).toMatchObject({ ok: false, error: "conflict" });
    expect(parsePrivate(t).memberships.filter((m) => m.sourcePaymentId === "P-NEW")).toHaveLength(1);
  });

  it("two payments of one member approved at once: the second is re-planned and chains after the first", () => {
    const t = baseTables();
    const a = commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-A" }));
    const stale = commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-B" }));
    expect(applyCommit(t, a)).toEqual({ ok: true });
    // Planned from the old snapshot, it would overlap — the snapshot check stops it.
    expect(applyCommit(t, stale)).toMatchObject({ ok: false, error: "conflict" });
    // Re-planning from fresh data chains correctly.
    expect(applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-B" })))).toEqual({ ok: true });
    const dates = parsePrivate(t)
      .memberships.filter((m) => m.memberId === "OLD")
      .map((m) => [m.startDate, m.endDate]);
    expect(dates).toEqual([
      ["2026-11-01", "2026-11-30"],
      ["2026-12-01", "2026-12-31"],
      ["2027-01-01", "2027-07-31"],
    ]);
  });

  it("a retried commit (same id) is applied only once", () => {
    const t = baseTables();
    const c = commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" }));
    expect(applyCommit(t, c)).toEqual({ ok: true });
    expect(applyCommit(t, c)).toEqual({ ok: true, duplicate: true });
    expect(t.Memberships!.filter((r) => r.source_payment_id === "P-NEW")).toHaveLength(1);
  });

  it("one bank transaction can only settle one payment", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW", bankTransactionId: "TX-1" })));
    expect(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-A", bankTransactionId: "TX-1" })).toEqual({
      refuse: "이 거래는 이미 다른 입금에 반영됐어요.",
    });
  });

  it("cancel approval voids the membership but keeps it for history, and allows re-approval", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW" })));
    applyCommit(t, commitOf(planCancelApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW", reason: "잘못 승인" })));
    let club = parsePrivate(t);
    expect(club.payments.find((p) => p.id === "P-NEW")!.status).toBe("pending");
    expect(club.memberships.filter((m) => m.memberId === "NEW").map((m) => m.status)).toEqual(["canceled"]);

    // Re-approve with the right start date.
    const again = planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-NEW", startOverride: "2026-12-01" });
    expect(applyCommit(t, commitOf(again))).toEqual({ ok: true });
    club = parsePrivate(t);
    expect(club.memberships.filter((m) => m.memberId === "NEW").map((m) => [m.status, m.startDate, m.endDate])).toEqual([
      ["canceled", "2026-11-11", "2026-12-10"],
      ["active", "2026-12-01", "2026-12-31"],
    ]);
    expect(t.AuditLog!.map((r) => r.action)).toEqual(["payment.approve", "payment.cancel_approval", "payment.approve"]);
  });

  it("membership edits must not overlap and are audited", () => {
    const t = baseTables();
    applyCommit(t, commitOf(planApproval(t, { now: NOW, actorId: "OP", paymentId: "P-OLD-A" })));
    const second = parsePrivate(t).memberships.find((m) => m.sourcePaymentId === "P-OLD-A")!;
    expect(
      planMembershipEdit(t, { now: NOW, actorId: "OP", membershipId: second.id, startDate: "2026-11-20", endDate: "2026-12-31", status: "active", reason: "조정" }),
    ).toEqual({ refuse: "같은 회원의 다른 회원권과 기간이 겹쳐요." });
    const ok = planMembershipEdit(t, { now: NOW, actorId: "OP", membershipId: second.id, startDate: "2026-12-01", endDate: "2027-01-05", status: "active", reason: "부상 연장" });
    expect(applyCommit(t, commitOf(ok))).toEqual({ ok: true });
    expect(t.AuditLog!.at(-1)).toMatchObject({ action: "membership.edit", target_id: second.id });
  });
});

describe("application", () => {
  const input = (consentConfirmed: boolean) => ({ name: "새 회원", depositorName: "김새회원", planId: "1M", requestedStart: null, consentConfirmed });

  it("registers a new Google account as an applicant with a pending payment and alerts operators", async () => {
    const store = new MemoryStore(baseTables());
    const data = await store.read(["Members", "Plans", "Payments", "Notifications"]);
    const planned = planApplication(data, { now: NOW, actorId: "", email: "Fresh@X.dev", input: input(true) });
    if ("refuse" in planned) throw new Error(planned.refuse);
    expect(await store.commit(planned.commit)).toEqual({ ok: true });

    const club = parsePrivate(store.tables);
    const fresh = club.members.find((m) => m.email === "fresh@x.dev")!;
    expect(fresh.status).toBe("applicant");
    expect(fresh.consentAt).toBe("2026-11-11T12:00:00+09:00");
    // First registration: 1개월 80,000 + 가입비 100,000 in one deposit.
    expect(club.payments.find((p) => p.memberId === fresh.id)).toMatchObject({ status: "pending", amount: 180000, joiningFee: 100000 });
    expect(club.notifications.filter((n) => n.type === "op_payment_pending").map((n) => n.memberId)).toEqual(["OP"]);

    const again = planApplication(store.tables, { now: NOW, actorId: "", email: "fresh@x.dev", input: input(true) });
    expect(again).toEqual({ refuse: "이미 입금 확인을 기다리는 신청이 있어요." });
  });

  it("requires the member registration consent form the first time", () => {
    const t = baseTables();
    expect(planApplication(t, { now: NOW, actorId: "", email: "fresh@x.dev", input: input(false) })).toEqual({
      refuse: "회원 등록 동의서를 먼저 작성하고, 제출했다고 체크해 주세요.",
    });
  });

  it("does not ask again once confirmed, and lets existing members confirm on their own", () => {
    const t = baseTables();
    t.Payments = [];
    // OLD registered before the site: no consent yet → must confirm first.
    expect("refuse" in planApplication(t, { now: NOW, actorId: "OLD", email: "old@x.dev", input: input(false) })).toBe(true);
    const confirm = planMemberConsent(t, { now: NOW, actorId: "OLD", memberId: "OLD" });
    if ("refuse" in confirm) throw new Error(confirm.refuse);
    expect(applyCommit(t, confirm.commit)).toEqual({ ok: true });
    expect(t.AuditLog!.at(-1)).toMatchObject({ action: "member.consent", target_id: "OLD" });
    // Now an extension goes through without the checkbox, and without a joining fee.
    const ext = planApplication(t, { now: NOW, actorId: "OLD", email: "old@x.dev", input: input(false) });
    if (!("commit" in ext)) throw new Error("expected a commit");
    expect(ext.result).toMatchObject({ amount: 80000, joiningFee: 0 });
    expect(planMemberConsent(t, { now: NOW, actorId: "OLD", memberId: "OLD" })).toEqual({ refuse: "이미 제출을 확인했어요." });
  });
});

describe("ledger", () => {
  const input = { date: "2026-11-10", category: "소모품", description: "테이프", amount: 16950, person: "", method: "모임통장", receiptUrl: "", memo: "" };
  const commit = (p: ReturnType<typeof planLedgerAdd>) => {
    if (!("commit" in p)) throw new Error("refused" in p ? p.refuse : "noop");
    return p.commit;
  };

  it("adds, edits with a reason, and voids without deleting — all audited", () => {
    const t = baseTables();
    t.Ledger = [];
    const add = planLedgerAdd(t, { now: NOW, actorId: "OP", input });
    expect(applyCommit(t, commit(add))).toEqual({ ok: true });
    const id = String(t.Ledger[0].entry_id);

    expect(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input, reason: " " })).toEqual({ refuse: "수정 사유를 적어 주세요." });
    expect(applyCommit(t, commit(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input: { ...input, amount: 15950 }, reason: "영수증 확인" })))).toEqual({ ok: true });
    expect(t.Ledger[0].amount).toBe(15950);

    expect(applyCommit(t, commit(planLedgerVoid(t, { now: NOW, actorId: "OP", entryId: id, reason: "중복" })))).toEqual({ ok: true });
    expect(t.Ledger).toHaveLength(1);
    expect(t.Ledger[0]).toMatchObject({ status: "void", memo: "무효: 중복" });
    expect(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input, reason: "x" })).toEqual({ refuse: "무효 처리된 기록은 고칠 수 없어요." });
    expect(t.AuditLog!.map((r) => r.action)).toEqual(["ledger.add", "ledger.edit", "ledger.void"]);
  });

  it("an edit planned from stale data is rejected under the lock", () => {
    const t = baseTables();
    t.Ledger = [];
    applyCommit(t, commit(planLedgerAdd(t, { now: NOW, actorId: "OP", input })));
    const id = String(t.Ledger[0].entry_id);
    const stale = commit(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input: { ...input, amount: 1 }, reason: "a" }));
    applyCommit(t, commit(planLedgerEdit(t, { now: NOW, actorId: "OP", entryId: id, input: { ...input, amount: 2 }, reason: "b" })));
    expect(applyCommit(t, stale)).toMatchObject({ ok: false, error: "conflict" });
  });
});

describe("joining fee", () => {
  const input = { name: "회원", depositorName: "입금자", planId: "6M", requestedStart: null, consentConfirmed: true };
  const result = (t: Tables, email: string) => {
    const planned = planApplication(t, { now: NOW, actorId: "", email, input });
    if (!("commit" in planned)) throw new Error("refused" in planned ? planned.refuse : "no commit");
    return planned.result as { amount: number; joiningFee: number };
  };

  it("is charged until the person has ever been approved", () => {
    const t = baseTables();
    // NEW is an applicant whose earlier request was rejected: still a first join.
    t.Payments = t.Payments!.map((p) => (p.payment_id === "P-NEW" ? { ...p, status: "rejected" } : p));
    t.Members = t.Members!.map((m) => (m.member_id === "NEW" ? { ...m, member_consent_at: "2026-11-10T10:00:00+09:00" } : m));
    expect(result(t, "new@x.dev")).toEqual(expect.objectContaining({ amount: 600000, joiningFee: 100000 }));
  });

  it("is never charged to members who joined before the site (joined_at or an existing membership)", () => {
    const t = baseTables();
    t.Payments = [];
    t.Members = [
      { member_id: "L1", name: "L1", email: "l1@x", status: "active", role: "member", joined_at: "2025-03-01", member_consent_at: "x" },
      { member_id: "L2", name: "L2", email: "l2@x", status: "active", role: "member", joined_at: "", member_consent_at: "x" },
    ];
    t.Memberships = [{ membership_id: "ML2", member_id: "L2", plan_id: "1M", start_date: "2026-01-01", end_date: "2026-01-31", status: "active" }];
    expect(result(t, "l1@x").joiningFee).toBe(0);
    expect(result(t, "l2@x").joiningFee).toBe(0);
  });

  it("follows the Settings tab (other amount, or 0 to turn it off)", () => {
    const t = baseTables();
    t.Settings = [{ key: "joining_fee", value: "50,000" }];
    expect(result(t, "a@x.dev")).toEqual(expect.objectContaining({ amount: 550000, joiningFee: 50000 }));
    t.Settings = [{ key: "joining_fee", value: 0 }];
    expect(result(t, "b@x.dev")).toEqual(expect.objectContaining({ amount: 500000, joiningFee: 0 }));
  });
});
