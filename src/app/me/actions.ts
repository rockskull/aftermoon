"use server";

import { refresh, updateTag } from "next/cache";
import { after } from "next/server";
import { toDateKey } from "@/lib/dates";
import { deliverDue } from "@/server/notify";
import { getViewer } from "@/server/auth/viewer";
import {
  NEEDS,
  planApplication,
  planMarkRead,
  planMemberConsent,
  planPrefs,
  planSubscribe,
  planUnsubscribe,
} from "@/server/domain/operations";
import { PRIVATE_TAG, runCommit } from "@/server/store";

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  values?: Record<string, string>;
}

function afterWrite() {
  updateTag(PRIVATE_TAG);
  refresh();
}

const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/** Apply for a first membership or an extension. Creates a pending payment; nothing is activated until approval. */
export async function applyMembership(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await getViewer({ fresh: true });
  if (!viewer) return { status: "error", message: "로그인이 필요해요." };

  const values = {
    name: field(fd, "name") || viewer.member?.name || viewer.session.name,
    depositor_name: field(fd, "depositor_name"),
    plan_id: field(fd, "plan_id"),
    requested_start: field(fd, "requested_start"),
    consent: fd.get("consent") === "on" ? "on" : "",
  };
  const now = Date.now();
  const today = toDateKey(now);
  if (!values.name || values.name.length > 40) return { status: "error", message: "이름을 40자 이내로 적어 주세요.", values };
  if (!values.depositor_name || values.depositor_name.length > 20) {
    return { status: "error", message: "입금자명을 20자 이내로 적어 주세요.", values };
  }
  if (!values.plan_id) return { status: "error", message: "회원권을 골라 주세요.", values };
  if (values.requested_start && (!/^\d{4}-\d{2}-\d{2}$/.test(values.requested_start) || values.requested_start < today)) {
    return { status: "error", message: "희망 시작일은 오늘 이후 날짜로 골라 주세요.", values };
  }

  const outcome = await runCommit(NEEDS.application, (data) =>
    planApplication(data, {
      now,
      actorId: viewer.member?.id ?? "",
      email: viewer.session.email,
      input: {
        name: values.name,
        depositorName: values.depositor_name,
        planId: values.plan_id,
        requestedStart: values.requested_start || null,
        consentConfirmed: fd.get("consent") === "on",
      },
    }),
  );
  if (!outcome.ok) return { status: "error", message: outcome.message, values };
  after(() => deliverDue(Date.now()).catch((e) => console.error("[notify] immediate delivery failed", e)));
  afterWrite();
  return { status: "success" };
}

/** Existing members: confirm the 회원 등록 동의서 was submitted (recorded with a timestamp). */
export async function confirmMemberConsent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await getViewer({ fresh: true });
  if (!viewer?.member) return { status: "error", message: "회원만 확인할 수 있어요." };
  if (fd.get("consent") !== "on") return { status: "error", message: "동의서를 제출한 뒤 체크해 주세요." };
  const memberId = viewer.member.id;
  const outcome = await runCommit(NEEDS.member, (data) => planMemberConsent(data, { now: Date.now(), actorId: memberId, memberId }));
  if (!outcome.ok) return { status: "error", message: outcome.message };
  afterWrite();
  return { status: "success", message: "확인했어요. 고마워요!" };
}

export async function savePrefs(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const viewer = await getViewer({ fresh: true });
  if (!viewer?.member) return { status: "error", message: "회원만 설정할 수 있어요." };
  const memberId = viewer.member.id;
  const prefs = {
    membership: fd.get("membership") === "on",
    events: fd.get("events") === "on",
    operator: fd.get("operator") === "on",
  };
  const outcome = await runCommit(NEEDS.prefs, (data) => planPrefs(data, { now: Date.now(), actorId: memberId, memberId, prefs }));
  if (!outcome.ok) return { status: "error", message: outcome.message };
  afterWrite();
  return { status: "success", message: "저장했어요." };
}

export interface PushKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function validSubscription(sub: PushKeys): boolean {
  try {
    const url = new URL(sub.endpoint);
    return (
      url.protocol === "https:" &&
      sub.endpoint.length < 1000 &&
      /^[A-Za-z0-9_-]{20,200}$/.test(sub.keys?.p256dh ?? "") &&
      /^[A-Za-z0-9_-]{8,100}$/.test(sub.keys?.auth ?? "")
    );
  } catch {
    return false;
  }
}

export async function subscribePush(sub: PushKeys, userAgent: string): Promise<{ ok: boolean; message?: string }> {
  const viewer = await getViewer({ fresh: true });
  if (!viewer?.member) return { ok: false, message: "회원만 알림을 켤 수 있어요." };
  if (!validSubscription(sub)) return { ok: false, message: "이 브라우저의 알림 정보를 확인하지 못했어요." };
  const memberId = viewer.member.id;
  const outcome = await runCommit(NEEDS.subscriptions, (data) =>
    planSubscribe(data, {
      now: Date.now(),
      actorId: memberId,
      memberId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent.slice(0, 200),
    }),
  );
  if (!outcome.ok) return { ok: false, message: outcome.message };
  updateTag(PRIVATE_TAG);
  return { ok: true };
}

export async function unsubscribePush(endpoint: string): Promise<{ ok: boolean; message?: string }> {
  const viewer = await getViewer({ fresh: true });
  if (!viewer?.member) return { ok: false, message: "로그인이 필요해요." };
  const memberId = viewer.member.id;
  const outcome = await runCommit(NEEDS.subscriptions, (data) =>
    planUnsubscribe(data, { now: Date.now(), actorId: memberId, memberId, endpoint }),
  );
  updateTag(PRIVATE_TAG);
  return outcome.ok ? { ok: true } : { ok: true, message: outcome.message };
}

export async function markAllRead(): Promise<void> {
  const viewer = await getViewer({ fresh: true });
  if (!viewer?.member) return;
  const memberId = viewer.member.id;
  const outcome = await runCommit(NEEDS.notifications, (data) => planMarkRead(data, { now: Date.now(), actorId: memberId, memberId }));
  if (outcome.ok) afterWrite();
}
