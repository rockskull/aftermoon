import { formatDateTimeKo, toDateKey } from "@/lib/dates";
import { eventHref } from "@/lib/event-format";
import { accessUntil } from "@/lib/membership";
import { getEventStatus, registrationCloseMs } from "@/lib/status";
import type { ClubEvent } from "@/lib/types";
import type { Check, Op } from "../store/commit";
import { newId, seoulIso } from "../store/ids";
import { cellText, type Row, type Tables } from "../store/schema";
import { prefsFor, toMember, toMembership, toPayment, type Member } from "./model";
import { daysUntil, notificationRow } from "./operations";
import { deliveryTime } from "./quiet";

export { deliveryTime };

/**
 * What the scheduler should create on this run. Pure: same input → same
 * notifications, and dedup keys make every run safe to repeat.
 *
 *  member:   membership D-7 / D-1, new event, registration opens, registration
 *            closes within 24h, event changed / canceled
 *  operator: one daily digest (pending deposits, memberships ending within 7 days)
 *
 * Generated during quiet hours (22:00–09:00 KST) they are scheduled for 09:00.
 */

export function eventFingerprint(e: ClubEvent): string {
  return [e.start, e.end ?? "", e.status].join("|");
}

function shortHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function planSchedule(data: Tables, ctx: { now: number; events: ClubEvent[] }) {
  const { now } = ctx;
  const todayKey = toDateKey(now);
  const at = deliveryTime(now);
  const existingKeys = new Set((data.Notifications ?? []).map((n) => cellText(n.deduplication_key)));
  const members = (data.Members ?? []).map(toMember).filter((m) => m.status === "active");
  const memberships = (data.Memberships ?? []).map(toMembership);
  const prefs = (m: Member) => prefsFor(data.NotificationPrefs, m.id);

  const checks: Check[] = [];
  const ops: Op[] = [];
  const add = (row: Row) => {
    const key = cellText(row.deduplication_key);
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    checks.push({ type: "absent", table: "Notifications", where: { deduplication_key: key } });
    ops.push({ type: "append", table: "Notifications", row });
  };
  const note = (memberId: string, type: string, title: string, body: string, url: string, dedupKey: string) =>
    add(notificationRow({ now, memberId, type, title, body, url, dedupKey, scheduledAt: at }));

  // Membership expiry (robust to missed runs: anything inside the window that wasn't sent yet).
  for (const member of members) {
    if (!prefs(member).membership) continue;
    const until = accessUntil(memberships.filter((m) => m.memberId === member.id), todayKey);
    if (!until) continue;
    const d = daysUntil(todayKey, until);
    const dot = until.replace(/-/g, ".");
    if (d <= 7 && d > 1) {
      note(member.id, "membership_d7", "회원권 만료 7일 전이에요", `${dot}에 회원권이 끝나요. 연장은 MY에서 신청할 수 있어요.`, "/me", `membership_d7:${member.id}:${until}`);
    } else if (d <= 1 && d >= 0) {
      note(member.id, "membership_d1", d === 0 ? "오늘 회원권이 끝나요" : "내일 회원권이 끝나요", `${dot}까지 이용할 수 있어요. 연장은 MY에서 신청해 주세요.`, "/me", `membership_d1:${member.id}:${until}`);
    }
  }

  // Events: compare with what we saw last time (EventWatch).
  const watch = new Map((data.EventWatch ?? []).map((r) => [cellText(r.event_id), r]));
  const firstRun = watch.size === 0;
  const eventFans = members.filter((m) => prefs(m).events);
  const nowIso = seoulIso(now);

  for (const event of ctx.events) {
    const fingerprint = eventFingerprint(event);
    const seen = watch.get(event.id);
    const upcoming = getEventStatus(event, now) !== "FINISHED";
    const label = `${event.title} · ${formatDateTimeKo(event.start)}`;

    if (!seen) {
      ops.push({ type: "append", table: "EventWatch", row: { event_id: event.id, fingerprint, status: event.status, first_seen_at: nowIso, updated_at: nowIso } });
      checks.push({ type: "absent", table: "EventWatch", where: { event_id: event.id } });
      if (!firstRun && upcoming && event.status !== "canceled") {
        for (const m of eventFans) note(m.id, "event_new", `새 이벤트: ${event.title}`, label, eventHref(event), `event_new:${event.id}:${m.id}`);
      }
    } else if (cellText(seen.fingerprint) !== fingerprint) {
      ops.push({ type: "update", table: "EventWatch", id: event.id, set: { fingerprint, status: event.status, updated_at: nowIso } });
      if (upcoming || event.status === "canceled") {
        const canceled = event.status === "canceled";
        for (const m of eventFans) {
          note(
            m.id,
            canceled ? "event_canceled" : "event_changed",
            canceled ? `이벤트 취소: ${event.title}` : `일정 변경: ${event.title}`,
            canceled ? "이 이벤트는 취소되었어요." : `바뀐 일정 · ${formatDateTimeKo(event.start)}`,
            eventHref(event),
            canceled ? `event_canceled:${event.id}:${m.id}` : `event_changed:${event.id}:${shortHash(fingerprint)}:${m.id}`,
          );
        }
      }
    }

    if (getEventStatus(event, now) !== "OPEN") continue;
    if (event.registrationOpen !== null && event.registrationOpen <= now && now - event.registrationOpen < 26 * 3_600_000) {
      for (const m of eventFans) note(m.id, "event_open", `신청 시작: ${event.title}`, label, eventHref(event), `event_open:${event.id}:${m.id}`);
    }
    const close = registrationCloseMs(event);
    if (close > now && close - now <= 24 * 3_600_000) {
      for (const m of eventFans) note(m.id, "event_closing", `신청 마감 임박: ${event.title}`, `${formatDateTimeKo(close)} 마감`, eventHref(event), `event_closing:${event.id}:${m.id}`);
    }
  }

  // Operator digest, once a day.
  const pending = (data.Payments ?? []).map(toPayment).filter((p) => p.status === "pending" || p.status === "matched").length;
  const expiringSoon = members.filter((m) => {
    const until = accessUntil(memberships.filter((ms) => ms.memberId === m.id), todayKey);
    return until !== null && daysUntil(todayKey, until) <= 7;
  }).length;
  if (pending > 0 || expiringSoon > 0) {
    for (const op of members.filter((m) => (m.role === "operator" || m.role === "admin") && prefs(m).operator)) {
      note(op.id, "op_digest", "오늘의 운영 현황", `입금 확인 대기 ${pending}건 · 7일 안에 만료 ${expiringSoon}명`, "/admin", `op_digest:${toDateKey(at)}:${op.id}`);
    }
  }

  return ops.length ? { commit: { id: newId("C", now, 8), checks, ops }, created: ops.filter((o) => o.table === "Notifications").length } : null;
}
