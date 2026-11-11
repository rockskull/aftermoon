"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { toDateKey } from "@/lib/dates";
import { deliverDue } from "@/server/notify";
import { operatorForAction } from "@/server/auth/viewer";
import { matchDeposits, parseBankFile, type DepositMatch } from "@/server/domain/bank";
import { parsePrivate, type Membership, type Role } from "@/server/domain/model";
import {
  NEEDS,
  planApproval,
  planCancelApproval,
  planMemberEdit,
  planMembershipEdit,
  planProposalReview,
  planRefund,
  planRejection,
} from "@/server/domain/operations";
import { PRIVATE_TAG, readTables, runCommit } from "@/server/store";

export interface AdminState {
  status: "idle" | "success" | "error";
  message?: string;
}

const DENIED: AdminState = { status: "error", message: "운영진만 할 수 있어요." };
const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function done(message: string): AdminState {
  updateTag(PRIVATE_TAG);
  refresh();
  return { status: "success", message };
}

/** Push the member's notification right after the response instead of waiting for the scheduler. */
function sendSoon() {
  after(() => deliverDue(Date.now()).catch((e) => console.error("[notify] immediate delivery failed", e)));
}

export async function approvePayment(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const startOverride = field(fd, "start_date");
  const depositedAt = field(fd, "deposited_at");
  if ((startOverride && !isDay(startOverride)) || (depositedAt && !isDay(depositedAt))) {
    return { status: "error", message: "날짜 형식을 확인해 주세요." };
  }
  const outcome = await runCommit<{ startDate: string; endDate: string }>(NEEDS.approval, (data) =>
    planApproval(data, {
      now: Date.now(),
      actorId: op.member.id,
      paymentId: field(fd, "payment_id"),
      startOverride: startOverride || null,
      depositedAt: depositedAt || null,
      bankTransactionId: field(fd, "bank_transaction_id") || null,
    }),
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };
  const r = outcome.result;
  sendSoon();
  return done(outcome.duplicate ? "이미 반영된 승인이에요." : `승인했어요. ${r ? `${r.startDate} – ${r.endDate}` : ""}`);
}

export async function rejectPayment(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const reason = field(fd, "reason");
  const outcome = await runCommit(NEEDS.payments, (data) =>
    planRejection(data, { now: Date.now(), actorId: op.member.id, paymentId: field(fd, "payment_id"), reason }),
  );
  if (!outcome.ok) return { status: "error", message: outcome.message };
  sendSoon();
  return done("반려했어요.");
}

export async function cancelApproval(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const reason = field(fd, "reason");
  if (!reason) return { status: "error", message: "취소 사유를 적어 주세요." };
  const outcome = await runCommit(NEEDS.payments, (data) =>
    planCancelApproval(data, { now: Date.now(), actorId: op.member.id, paymentId: field(fd, "payment_id"), reason }),
  );
  return outcome.ok ? done("승인을 취소했어요. 입금은 다시 확인 대기 상태예요.") : { status: "error", message: outcome.message };
}

export async function refundPayment(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const reason = field(fd, "reason");
  if (!reason) return { status: "error", message: "환불 사유를 적어 주세요." };
  const outcome = await runCommit(NEEDS.payments, (data) =>
    planRefund(data, { now: Date.now(), actorId: op.member.id, paymentId: field(fd, "payment_id"), reason }),
  );
  return outcome.ok ? done("환불 처리했어요.") : { status: "error", message: outcome.message };
}

export async function editMembership(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const startDate = field(fd, "start_date");
  const endDate = field(fd, "end_date");
  const status = field(fd, "status") as Membership["status"];
  if (!isDay(startDate) || !isDay(endDate)) return { status: "error", message: "날짜 형식을 확인해 주세요." };
  if (!["active", "canceled", "refunded"].includes(status)) return { status: "error", message: "상태를 골라 주세요." };
  const outcome = await runCommit(NEEDS.membership, (data) =>
    planMembershipEdit(data, {
      now: Date.now(),
      actorId: op.member.id,
      membershipId: field(fd, "membership_id"),
      startDate,
      endDate,
      status,
      reason: field(fd, "reason"),
    }),
  );
  return outcome.ok ? done("회원권을 수정했어요.") : { status: "error", message: outcome.message };
}

export async function editMember(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const role = field(fd, "role") as Role;
  const status = field(fd, "status");
  if (role && !["member", "operator", "admin"].includes(role)) return { status: "error", message: "권한 값을 확인해 주세요." };
  if (status && !["applicant", "active", "inactive"].includes(status)) return { status: "error", message: "상태 값을 확인해 주세요." };
  const outcome = await runCommit(NEEDS.member, (data) =>
    planMemberEdit(data, {
      now: Date.now(),
      actorId: op.member.id,
      actorRole: op.member.role,
      memberId: field(fd, "member_id"),
      set: {
        name: field(fd, "name") || undefined,
        depositor_name: field(fd, "depositor_name") || undefined,
        status: status || undefined,
        memo: fd.has("memo") ? field(fd, "memo") : undefined,
        role: role || undefined,
      },
    }),
  );
  return outcome.ok ? done("회원 정보를 저장했어요.") : { status: "error", message: outcome.message };
}

export async function reviewProposal(_prev: AdminState, fd: FormData): Promise<AdminState> {
  const op = await operatorForAction();
  if (!op) return DENIED;
  const status = field(fd, "review_status");
  if (!["new", "reviewing", "accepted", "declined"].includes(status)) return { status: "error", message: "상태를 골라 주세요." };
  const outcome = await runCommit(NEEDS.proposals, (data) =>
    planProposalReview(data, {
      now: Date.now(),
      actorId: op.member.id,
      proposalId: field(fd, "proposal_id"),
      status,
      notes: field(fd, "review_notes").slice(0, 1000),
    }),
  );
  return outcome.ok ? done("저장했어요.") : { status: "error", message: outcome.message };
}

export interface BankState {
  status: "idle" | "success" | "error";
  message?: string;
  matches?: DepositMatch[];
  fileName?: string;
}

const MAX_BANK_FILE = 4 * 1024 * 1024;

/**
 * Reads an uploaded KakaoBank statement in memory and proposes matches.
 * The file itself is never stored; only approvals the operator confirms are
 * written (with the transaction key, which blocks re-applying it later).
 */
export async function analyzeBankFile(_prev: BankState, fd: FormData): Promise<BankState> {
  const op = await operatorForAction();
  if (!op) return { status: "error", message: DENIED.message };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "거래내역 파일을 골라 주세요." };
  if (file.size > MAX_BANK_FILE) return { status: "error", message: "파일이 너무 커요. (최대 4MB)" };

  try {
    const deposits = parseBankFile(new Uint8Array(await file.arrayBuffer()));
    if (deposits.length === 0) return { status: "error", message: "입금 거래를 찾지 못했어요. 파일 형식을 확인해 주세요." };
    const club = parsePrivate(await readTables(NEEDS.approval, { fresh: true }));
    const matches = matchDeposits(deposits, club, toDateKey(Date.now()));
    return { status: "success", matches, fileName: file.name };
  } catch (error) {
    console.error("[bank] could not parse statement:", error);
    return {
      status: "error",
      message: error instanceof Error && error.message.startsWith("BANK:") ? error.message.slice(5) : "파일을 읽지 못했어요.",
    };
  }
}
