import { formatKeyKo, toDateKey } from "@/lib/dates";
import { nextMembershipPeriod, overlapping, totalMonths } from "@/lib/membership";
import { pickText, type Check, type Op } from "../store/commit";
import { newId, seoulIso } from "../store/ids";
import { deliveryTime } from "./quiet";
import { cellText, type Row, type TableName, type Tables } from "../store/schema";
import {
  formatWon,
  isFirstJoin,
  normalizeEmail,
  parsePrivate,
  toMember,
  toMembership,
  toPayment,
  type Member,
  type Membership,
  type Payment,
  type Role,
} from "./model";

/**
 * Business rules for every write. Each `plan*` function reads the freshly
 * loaded tables and returns either a commit (with the checks that make it safe
 * to apply under the sheet lock) or a refusal message for the user.
 * They are pure, so tests run them against the in-memory store.
 */

type Planned = { commit: { id: string; checks: Check[]; ops: Op[] }; result?: unknown } | { refuse: string };

const MEMBERSHIP_FIELDS = ["start_date", "end_date", "status"];

interface Ctx {
  now: number;
  /** member_id of the person doing this (or "system" for the scheduler). */
  actorId: string;
}

function audit(ctx: Ctx, commitId: string, action: string, targetId: string, before: unknown, after: unknown): Op {
  return {
    type: "append",
    table: "AuditLog",
    row: {
      log_id: newId("LOG", ctx.now, 6),
      commit_id: commitId,
      actor_id: ctx.actorId,
      action,
      target_id: targetId,
      before_value: before === null || before === undefined ? "" : JSON.stringify(before),
      after_value: after === null || after === undefined ? "" : JSON.stringify(after),
      created_at: seoulIso(ctx.now),
    },
  };
}

export function notificationRow(args: {
  now: number;
  memberId: string;
  type: string;
  title: string;
  body: string;
  url: string;
  dedupKey: string;
  scheduledAt?: number;
}): Row {
  return {
    notification_id: newId("N", args.now, 6),
    member_id: args.memberId,
    type: args.type,
    title: args.title,
    body: args.body,
    url: args.url,
    scheduled_at: seoulIso(args.scheduledAt ?? args.now),
    sent_at: "",
    status: "pending",
    attempts: 0,
    last_error: "",
    deduplication_key: args.dedupKey,
    created_at: seoulIso(args.now),
    read_at: "",
  };
}

/** Heads-up for every active operator (delivered outside quiet hours). */
function notifyOperators(data: Tables, ctx: Ctx, n: { type: string; title: string; body: string; url: string; key: string }) {
  const checks: Check[] = [];
  const ops: Op[] = [];
  for (const op of operatorsOf(data)) {
    const r = notify(
      data,
      notificationRow({
        now: ctx.now,
        memberId: op.id,
        type: n.type,
        title: n.title,
        body: n.body,
        url: n.url,
        dedupKey: `${n.key}:${op.id}`,
        scheduledAt: deliveryTime(ctx.now),
      }),
    );
    checks.push(...r.checks);
    ops.push(...r.ops);
  }
  return { checks, ops };
}

/** Appends a notification unless one with the same dedup key already exists. */
function notify(data: Tables, row: Row): { checks: Check[]; ops: Op[] } {
  const key = cellText(row.deduplication_key);
  if ((data.Notifications ?? []).some((n) => cellText(n.deduplication_key) === key)) return { checks: [], ops: [] };
  return {
    checks: [{ type: "absent", table: "Notifications", where: { deduplication_key: key } }],
    ops: [{ type: "append", table: "Notifications", row }],
  };
}

function operatorsOf(data: Tables): Member[] {
  return (data.Members ?? []).map(toMember).filter((m) => (m.role === "operator" || m.role === "admin") && m.status === "active");
}

function memberMemberships(data: Tables, memberId: string): Membership[] {
  return (data.Memberships ?? []).map(toMembership).filter((m) => m.memberId === memberId);
}

/** Guards against a concurrent change to this member's memberships between read and write. */
function membershipSnapshot(data: Tables, memberId: string): Check {
  const rows = (data.Memberships ?? []).filter((r) => cellText(r.member_id) === memberId);
  return {
    type: "snapshot",
    table: "Memberships",
    where: { member_id: memberId },
    rows: Object.fromEntries(rows.map((r) => [cellText(r.membership_id), pickText(r, MEMBERSHIP_FIELDS)])),
  };
}

function paymentCheck(p: Payment, statuses: Payment["status"][]): Check {
  return { type: "exists", table: "Payments", id: p.id, fields: { status: statuses.length === 1 ? statuses[0] : statuses } };
}

// ---------------------------------------------------------------------------
// Member: apply for / extend a membership
// ---------------------------------------------------------------------------

export function planApplication(
  data: Tables,
  ctx: Ctx & {
    email: string;
    input: {
      name: string;
      depositorName: string;
      planId: string;
      requestedStart: string | null;
      /** The applicant ticked "I submitted the 회원 등록 동의서". */
      consentConfirmed: boolean;
    };
  },
): Planned {
  const club = parsePrivate(data);
  const email = normalizeEmail(ctx.email);
  const existing = club.members.find((m) => m.email === email);
  const plan = club.plans.find((p) => p.id === ctx.input.planId && p.active);
  if (!plan) return { refuse: "선택한 회원권을 찾을 수 없어요. 새로고침 후 다시 골라 주세요." };
  if (existing?.status === "inactive") return { refuse: "이용이 중지된 계정이에요. 운영진에게 문의해 주세요." };
  if (existing && club.payments.some((p) => p.memberId === existing.id && (p.status === "pending" || p.status === "matched"))) {
    return { refuse: "이미 입금 확인을 기다리는 신청이 있어요." };
  }
  const needsConsent = !existing?.consentAt;
  if (needsConsent && !ctx.input.consentConfirmed) {
    return { refuse: "회원 등록 동의서를 먼저 작성하고, 제출했다고 체크해 주세요." };
  }

  const commitId = newId("C", ctx.now, 8);
  const memberId = existing?.id ?? newId("M", ctx.now);
  const consentAt = needsConsent ? seoulIso(ctx.now) : "";
  const checks: Check[] = [];
  const ops: Op[] = [];

  if (existing) {
    // joined_at is part of the check: the joining-fee decision must still hold when this is written.
    checks.push({
      type: "exists",
      table: "Members",
      id: existing.id,
      fields: { status: ["applicant", "active"], joined_at: cellText(existing.raw.joined_at) },
    });
    checks.push({ type: "absent", table: "Payments", where: { member_id: existing.id, status: "pending" } });
    const set: Row = {};
    if (existing.depositorName !== ctx.input.depositorName) set.depositor_name = ctx.input.depositorName;
    if (consentAt) set.member_consent_at = consentAt;
    if (Object.keys(set).length) ops.push({ type: "update", table: "Members", id: existing.id, set });
  } else {
    checks.push({ type: "absent", table: "Members", where: { email } });
    ops.push({
      type: "append",
      table: "Members",
      row: {
        member_id: memberId,
        name: ctx.input.name,
        email,
        depositor_name: ctx.input.depositorName,
        role: "member",
        status: "applicant",
        applied_at: seoulIso(ctx.now),
        joined_at: "",
        member_consent_at: consentAt,
        memo: "",
      },
    });
  }

  // First registration pays the one-time joining fee on top of the plan (one deposit, one total).
  const joiningFee = isFirstJoin(club, existing) ? club.settings.joiningFee : 0;
  const amount = plan.price + joiningFee;

  const paymentId = newId("PAY", ctx.now);
  const payment: Row = {
    payment_id: paymentId,
    member_id: memberId,
    depositor_name: ctx.input.depositorName,
    amount,
    joining_fee: joiningFee,
    plan_id: plan.id,
    status: "pending",
    requested_at: seoulIso(ctx.now),
    requested_start: ctx.input.requestedStart ?? "",
    deposited_at: "",
    bank_transaction_id: "",
    approved_by: "",
    approved_at: "",
    note: "",
  };
  ops.push({ type: "append", table: "Payments", row: payment });
  ops.push(
    audit({ ...ctx, actorId: memberId }, commitId, existing ? "payment.request" : "member.apply", paymentId, null, {
      ...payment,
      ...(consentAt ? { member_consent_at: consentAt } : {}),
    }),
  );

  const heads = notifyOperators(data, ctx, {
    type: "op_payment_pending",
    title: "입금 확인 대기",
    body: `${ctx.input.name}(${ctx.input.depositorName}) · ${plan.name} ${formatWon(amount)}${joiningFee ? " (가입비 포함)" : ""}`,
    url: "/admin/payments",
    key: `op_payment_pending:${paymentId}`,
  });
  checks.push(...heads.checks);
  ops.push(...heads.ops);

  return { commit: { id: commitId, checks, ops }, result: { paymentId, memberId, amount, joiningFee } };
}

/** An existing member (e.g. registered before the site) confirms they submitted the 회원 등록 동의서. */
export function planMemberConsent(data: Tables, ctx: Ctx & { memberId: string }): Planned {
  const member = (data.Members ?? []).map(toMember).find((m) => m.id === ctx.memberId);
  if (!member) return { refuse: "회원 정보를 찾을 수 없어요." };
  if (member.consentAt) return { refuse: "이미 제출을 확인했어요." };
  const commitId = newId("C", ctx.now, 8);
  const at = seoulIso(ctx.now);
  return {
    commit: {
      id: commitId,
      checks: [{ type: "exists", table: "Members", id: member.id, fields: { member_consent_at: "" } }],
      ops: [
        { type: "update", table: "Members", id: member.id, set: { member_consent_at: at } },
        audit(ctx, commitId, "member.consent", member.id, null, { member_consent_at: at }),
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Operator: approve / reject / cancel / refund
// ---------------------------------------------------------------------------

export function planApproval(
  data: Tables,
  ctx: Ctx & {
    paymentId: string;
    startOverride?: string | null;
    depositedAt?: string | null;
    bankTransactionId?: string | null;
  },
): Planned {
  const club = parsePrivate(data);
  const payment = club.payments.find((p) => p.id === ctx.paymentId);
  if (!payment) return { refuse: "입금 기록을 찾을 수 없어요." };
  if (payment.status === "approved") return { refuse: "이미 승인된 입금이에요." };
  if (payment.status !== "pending" && payment.status !== "matched") return { refuse: `${payment.status} 상태라서 승인할 수 없어요.` };
  const member = club.members.find((m) => m.id === payment.memberId);
  if (!member) return { refuse: "회원 정보를 찾을 수 없어요." };
  if (member.status === "inactive") return { refuse: "이용 중지된 회원이에요. 먼저 회원 상태를 바꿔 주세요." };
  const plan = club.plans.find((p) => p.id === payment.planId);
  if (!plan) return { refuse: "회원권 상품을 찾을 수 없어요." };
  if (club.memberships.some((m) => m.sourcePaymentId === payment.id && m.status === "active")) {
    return { refuse: "이 입금으로 만든 회원권이 이미 있어요." };
  }
  const tx = ctx.bankTransactionId?.trim() || "";
  if (tx && club.payments.some((p) => p.bankTransactionId === tx)) return { refuse: "이 거래는 이미 다른 입금에 반영됐어요." };

  const todayKey = toDateKey(ctx.now);
  const existing = memberMemberships(data, member.id);
  const period = nextMembershipPeriod({
    existing,
    plan,
    todayKey,
    requestedStart: payment.requestedStart || null,
    startOverride: ctx.startOverride || null,
  });
  if (ctx.startOverride && overlapping(existing, period.startDate, period.endDate).length) {
    return { refuse: "지정한 기간이 기존 회원권과 겹쳐요. 시작일을 다시 확인해 주세요." };
  }

  const commitId = newId("C", ctx.now, 8);
  const membershipId = newId("MS", ctx.now);
  const nowIso = seoulIso(ctx.now);
  const membershipRow: Row = {
    membership_id: membershipId,
    member_id: member.id,
    plan_id: plan.id,
    start_date: period.startDate,
    end_date: period.endDate,
    status: "active",
    source_payment_id: payment.id,
    created_at: nowIso,
    updated_at: nowIso,
    note: period.extendsExisting ? "기존 회원권에 이어서 연장" : "",
  };
  const paymentSet: Row = {
    status: "approved",
    approved_by: ctx.actorId,
    approved_at: nowIso,
    deposited_at: ctx.depositedAt || payment.depositedAt || todayKey,
    ...(tx ? { bank_transaction_id: tx } : {}),
  };

  const checks: Check[] = [
    paymentCheck(payment, ["pending", "matched"]),
    { type: "absent", table: "Memberships", where: { source_payment_id: payment.id, status: "active" } },
    membershipSnapshot(data, member.id),
    { type: "exists", table: "Members", id: member.id, fields: { status: ["applicant", "active"] } },
  ];
  if (tx) checks.push({ type: "absent", table: "Payments", where: { bank_transaction_id: tx } });

  const ops: Op[] = [
    { type: "append", table: "Memberships", row: membershipRow },
    { type: "update", table: "Payments", id: payment.id, set: paymentSet },
  ];
  if (member.status !== "active" || !member.joinedAt) {
    ops.push({
      type: "update",
      table: "Members",
      id: member.id,
      set: { status: "active", ...(member.joinedAt ? {} : { joined_at: period.startDate }) },
    });
  }
  const n = notify(
    data,
    notificationRow({
      now: ctx.now,
      memberId: member.id,
      type: "payment_approved",
      title: "회비 입금이 확인됐어요",
      body: `${plan.name} 회원권 · ${formatKeyKo(period.startDate)} – ${formatKeyKo(period.endDate)}`,
      url: "/me",
      dedupKey: `payment_approved:${payment.id}`,
    }),
  );
  checks.push(...n.checks);
  ops.push(...n.ops);
  ops.push(
    audit(ctx, commitId, "payment.approve", payment.id, pickText(payment.raw, ["status", "deposited_at", "bank_transaction_id"]), {
      ...paymentSet,
      membership: membershipRow,
    }),
  );

  return { commit: { id: commitId, checks, ops }, result: { membershipId, ...period, months: totalMonths(plan) } };
}

export function planRejection(data: Tables, ctx: Ctx & { paymentId: string; reason: string }): Planned {
  const payment = (data.Payments ?? []).map(toPayment).find((p) => p.id === ctx.paymentId);
  if (!payment) return { refuse: "입금 기록을 찾을 수 없어요." };
  if (payment.status !== "pending" && payment.status !== "matched") return { refuse: "확인 대기 중인 입금만 반려할 수 있어요." };
  const commitId = newId("C", ctx.now, 8);
  const set = { status: "rejected", note: ctx.reason, approved_by: ctx.actorId, approved_at: seoulIso(ctx.now) };
  const n = notify(
    data,
    notificationRow({
      now: ctx.now,
      memberId: payment.memberId,
      type: "payment_rejected",
      title: "회비 신청을 확인하지 못했어요",
      body: ctx.reason || "자세한 내용은 운영진에게 문의해 주세요.",
      url: "/me",
      dedupKey: `payment_rejected:${payment.id}`,
    }),
  );
  return {
    commit: {
      id: commitId,
      checks: [paymentCheck(payment, ["pending", "matched"]), ...n.checks],
      ops: [
        { type: "update", table: "Payments", id: payment.id, set },
        ...n.ops,
        audit(ctx, commitId, "payment.reject", payment.id, pickText(payment.raw, ["status", "note"]), set),
      ],
    },
  };
}

/** Undo an approval made by mistake: the membership is voided (kept for history) and the payment goes back to pending. */
export function planCancelApproval(data: Tables, ctx: Ctx & { paymentId: string; reason: string }): Planned {
  const payment = (data.Payments ?? []).map(toPayment).find((p) => p.id === ctx.paymentId);
  if (!payment || payment.status !== "approved") return { refuse: "승인된 입금만 취소할 수 있어요." };
  const memberships = (data.Memberships ?? []).map(toMembership).filter((m) => m.sourcePaymentId === payment.id && m.status === "active");
  const commitId = newId("C", ctx.now, 8);
  const nowIso = seoulIso(ctx.now);
  const paymentSet = { status: "pending", approved_by: "", approved_at: "", bank_transaction_id: "", note: `승인 취소: ${ctx.reason}` };
  return {
    commit: {
      id: commitId,
      checks: [
        paymentCheck(payment, ["approved"]),
        ...memberships.map((m): Check => ({ type: "exists", table: "Memberships", id: m.id, fields: pickText(m.raw, MEMBERSHIP_FIELDS) })),
      ],
      ops: [
        ...memberships.map((m): Op => ({ type: "update", table: "Memberships", id: m.id, set: { status: "canceled", updated_at: nowIso, note: `승인 취소: ${ctx.reason}` } })),
        { type: "update", table: "Payments", id: payment.id, set: paymentSet },
        audit(ctx, commitId, "payment.cancel_approval", payment.id, pickText(payment.raw, ["status", "approved_by", "approved_at", "bank_transaction_id"]), {
          ...paymentSet,
          canceledMemberships: memberships.map((m) => m.id),
        }),
      ],
    },
  };
}

export function planRefund(data: Tables, ctx: Ctx & { paymentId: string; reason: string }): Planned {
  const payment = (data.Payments ?? []).map(toPayment).find((p) => p.id === ctx.paymentId);
  if (!payment || payment.status !== "approved") return { refuse: "승인된 입금만 환불 처리할 수 있어요." };
  const memberships = (data.Memberships ?? []).map(toMembership).filter((m) => m.sourcePaymentId === payment.id && m.status === "active");
  const commitId = newId("C", ctx.now, 8);
  const nowIso = seoulIso(ctx.now);
  return {
    commit: {
      id: commitId,
      checks: [
        paymentCheck(payment, ["approved"]),
        ...memberships.map((m): Check => ({ type: "exists", table: "Memberships", id: m.id, fields: pickText(m.raw, MEMBERSHIP_FIELDS) })),
      ],
      ops: [
        ...memberships.map((m): Op => ({ type: "update", table: "Memberships", id: m.id, set: { status: "refunded", updated_at: nowIso, note: `환불: ${ctx.reason}` } })),
        { type: "update", table: "Payments", id: payment.id, set: { status: "refunded", note: `환불: ${ctx.reason}` } },
        audit(ctx, commitId, "payment.refund", payment.id, { status: "approved" }, { status: "refunded", reason: ctx.reason, memberships: memberships.map((m) => m.id) }),
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Operator: edit memberships and members
// ---------------------------------------------------------------------------

export function planMembershipEdit(
  data: Tables,
  ctx: Ctx & { membershipId: string; startDate: string; endDate: string; status: Membership["status"]; reason: string },
): Planned {
  const membership = (data.Memberships ?? []).map(toMembership).find((m) => m.id === ctx.membershipId);
  if (!membership) return { refuse: "회원권을 찾을 수 없어요." };
  if (ctx.endDate < ctx.startDate) return { refuse: "종료일이 시작일보다 빨라요." };
  if (!ctx.reason.trim()) return { refuse: "변경 사유를 적어 주세요." };
  if (ctx.status === "active") {
    const others = memberMemberships(data, membership.memberId);
    if (overlapping(others, ctx.startDate, ctx.endDate, membership.id).length) {
      return { refuse: "같은 회원의 다른 회원권과 기간이 겹쳐요." };
    }
  }
  const commitId = newId("C", ctx.now, 8);
  const set = {
    start_date: ctx.startDate,
    end_date: ctx.endDate,
    status: ctx.status,
    updated_at: seoulIso(ctx.now),
    note: ctx.reason,
  };
  return {
    commit: {
      id: commitId,
      checks: [{ type: "exists", table: "Memberships", id: membership.id, fields: pickText(membership.raw, MEMBERSHIP_FIELDS) }],
      ops: [
        { type: "update", table: "Memberships", id: membership.id, set },
        audit(ctx, commitId, "membership.edit", membership.id, pickText(membership.raw, [...MEMBERSHIP_FIELDS, "note"]), set),
      ],
    },
  };
}

export function planMemberEdit(
  data: Tables,
  ctx: Ctx & {
    memberId: string;
    actorRole: Role;
    set: Partial<{ name: string; depositor_name: string; status: string; memo: string; role: Role }>;
  },
): Planned {
  const member = (data.Members ?? []).map(toMember).find((m) => m.id === ctx.memberId);
  if (!member) return { refuse: "회원을 찾을 수 없어요." };
  if (ctx.set.role !== undefined && ctx.set.role !== member.role) {
    if (ctx.actorRole !== "admin") return { refuse: "운영진 권한은 admin만 바꿀 수 있어요." };
    if (member.id === ctx.actorId && ctx.set.role !== "admin") return { refuse: "자기 자신의 admin 권한은 해제할 수 없어요." };
  }
  if ((member.role === "admin" || member.role === "operator") && ctx.actorRole !== "admin" && member.id !== ctx.actorId) {
    return { refuse: "다른 운영진 정보는 admin만 수정할 수 있어요." };
  }
  const changed = Object.fromEntries(Object.entries(ctx.set).filter(([k, v]) => v !== undefined && cellText(member.raw[k]) !== v)) as Row;
  if (!Object.keys(changed).length) return { refuse: "바뀐 내용이 없어요." };
  const commitId = newId("C", ctx.now, 8);
  return {
    commit: {
      id: commitId,
      checks: [{ type: "exists", table: "Members", id: member.id, fields: pickText(member.raw, Object.keys(changed)) }],
      ops: [
        { type: "update", table: "Members", id: member.id, set: changed },
        audit(ctx, commitId, changed.role ? "member.role" : "member.edit", member.id, pickText(member.raw, Object.keys(changed)), changed),
      ],
    },
  };
}

/** A visitor's event idea → private Proposals tab, plus a heads-up for operators. */
export function planProposal(data: Tables, ctx: Ctx & { payload: Record<string, string | number> }): Planned {
  const commitId = newId("C", ctx.now, 8);
  const proposalId = newId("PR", ctx.now);
  const row: Row = {
    proposal_id: proposalId,
    submitted_at: seoulIso(ctx.now),
    ...ctx.payload,
    review_status: "new",
    review_notes: "",
  };
  const heads = notifyOperators(data, ctx, {
    type: "op_proposal_new",
    title: "새 이벤트 제안",
    body: String(ctx.payload.event_title ?? ""),
    url: "/admin/proposals",
    key: `op_proposal_new:${proposalId}`,
  });
  const checks: Check[] = [...heads.checks];
  const ops: Op[] = [{ type: "append", table: "Proposals", row }, ...heads.ops];
  // No personal data in the audit log, just the fact that a proposal arrived.
  ops.push(audit(ctx, commitId, "proposal.submit", proposalId, null, { event_title: ctx.payload.event_title }));
  return { commit: { id: commitId, checks, ops } };
}

export function planProposalReview(
  data: Tables,
  ctx: Ctx & { proposalId: string; status: string; notes: string },
): Planned {
  const row = (data.Proposals ?? []).find((r) => cellText(r.proposal_id) === ctx.proposalId);
  if (!row) return { refuse: "제안을 찾을 수 없어요." };
  const commitId = newId("C", ctx.now, 8);
  const set = { review_status: ctx.status, review_notes: ctx.notes };
  return {
    commit: {
      id: commitId,
      checks: [{ type: "exists", table: "Proposals", id: ctx.proposalId }],
      ops: [
        { type: "update", table: "Proposals", id: ctx.proposalId, set },
        audit(ctx, commitId, "proposal.review", ctx.proposalId, pickText(row, ["review_status", "review_notes"]), set),
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Member: notification settings and devices
// ---------------------------------------------------------------------------

export function planPrefs(data: Tables, ctx: Ctx & { memberId: string; prefs: { membership: boolean; events: boolean; operator: boolean } }): Planned {
  const exists = (data.NotificationPrefs ?? []).some((r) => cellText(r.member_id) === ctx.memberId);
  const row = { ...ctx.prefs, updated_at: seoulIso(ctx.now) };
  return {
    commit: {
      id: newId("C", ctx.now, 8),
      checks: exists ? [] : [{ type: "absent", table: "NotificationPrefs", where: { member_id: ctx.memberId } }],
      ops: [
        exists
          ? { type: "update", table: "NotificationPrefs", id: ctx.memberId, set: row }
          : { type: "append", table: "NotificationPrefs", row: { member_id: ctx.memberId, ...row } },
      ],
    },
  };
}

export function planSubscribe(
  data: Tables,
  ctx: Ctx & { memberId: string; endpoint: string; p256dh: string; auth: string; userAgent: string },
): Planned {
  const rows = data.PushSubscriptions ?? [];
  const sameEndpoint = rows.find((r) => cellText(r.endpoint) === ctx.endpoint);
  const set = {
    member_id: ctx.memberId,
    p256dh: ctx.p256dh,
    auth: ctx.auth,
    user_agent: ctx.userAgent.slice(0, 200),
    status: "active",
    failure_count: 0,
  };
  if (sameEndpoint) {
    // The same browser may be re-subscribed, or handed to another member who signed in on it.
    return {
      commit: {
        id: newId("C", ctx.now, 8),
        checks: [],
        ops: [{ type: "update", table: "PushSubscriptions", id: cellText(sameEndpoint.subscription_id), set }],
      },
    };
  }
  return {
    commit: {
      id: newId("C", ctx.now, 8),
      checks: [{ type: "absent", table: "PushSubscriptions", where: { endpoint: ctx.endpoint } }],
      ops: [
        {
          type: "append",
          table: "PushSubscriptions",
          row: {
            subscription_id: newId("SUB", ctx.now),
            endpoint: ctx.endpoint,
            created_at: seoulIso(ctx.now),
            last_success_at: "",
            ...set,
          },
        },
      ],
    },
  };
}

export function planUnsubscribe(data: Tables, ctx: Ctx & { memberId: string; endpoint: string }): Planned {
  const row = (data.PushSubscriptions ?? []).find(
    (r) => cellText(r.endpoint) === ctx.endpoint && cellText(r.member_id) === ctx.memberId,
  );
  if (!row) return { refuse: "이 기기는 이미 알림이 꺼져 있어요." };
  return {
    commit: {
      id: newId("C", ctx.now, 8),
      checks: [],
      ops: [{ type: "update", table: "PushSubscriptions", id: cellText(row.subscription_id), set: { status: "revoked" } }],
    },
  };
}

export function planMarkRead(data: Tables, ctx: Ctx & { memberId: string }): Planned {
  const unread = (data.Notifications ?? []).filter(
    (r) => cellText(r.member_id) === ctx.memberId && !cellText(r.read_at) && ["sent", "inapp"].includes(cellText(r.status)),
  );
  if (!unread.length) return { refuse: "" };
  const at = seoulIso(ctx.now);
  return {
    commit: {
      id: newId("C", ctx.now, 8),
      checks: [],
      ops: unread.map((r): Op => ({ type: "update", table: "Notifications", id: cellText(r.notification_id), set: { read_at: at } })),
    },
  };
}

/** Tables each operation needs to read. */
export const NEEDS = {
  application: ["Members", "Plans", "Payments", "Memberships", "Notifications", "Settings"],
  approval: ["Members", "Plans", "Payments", "Memberships", "Notifications"],
  payments: ["Payments", "Memberships", "Notifications"],
  membership: ["Memberships"],
  member: ["Members"],
  proposals: ["Proposals"],
  proposalSubmit: ["Members", "Notifications"],
  prefs: ["NotificationPrefs"],
  subscriptions: ["PushSubscriptions"],
  notifications: ["Notifications"],
} satisfies Record<string, TableName[]>;

/** Days from today until a day key (Seoul); negative when it is in the past. */
export function daysUntil(todayKey: string, key: string): number {
  return Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86_400_000);
}
