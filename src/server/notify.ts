import "server-only";
import { sendNotification, WebPushError } from "web-push";
import { parseMoment } from "@/lib/dates";
import type { ClubEvent } from "@/lib/types";
import type { Op } from "./store/commit";
import { newId, seoulIso } from "./store/ids";
import { cellText, type TableName } from "./store/schema";
import { readTables, runCommit } from "./store";
import { prefsFor, toNotification, toSubscription, type AppNotification } from "./domain/model";
import { planSchedule } from "./domain/schedule";

const MAX_ATTEMPTS = 3;
const CLAIM_TIMEOUT_MS = 10 * 60_000;

function vapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { subject: process.env.VAPID_SUBJECT || "mailto:crew@aftermoon.club", publicKey, privateKey };
}

function category(type: string): "membership" | "events" | "operator" {
  if (type.startsWith("op_")) return "operator";
  if (type.startsWith("event_")) return "events";
  return "membership";
}

/** Creates scheduled notifications (expiry, events, digest). Safe to run any number of times. */
export async function generateScheduled(now: number, events: ClubEvent[]): Promise<number> {
  let created = 0;
  const outcome = await runCommit(["Members", "Memberships", "Payments", "Notifications", "NotificationPrefs", "EventWatch"], (data) => {
    const planned = planSchedule(data, { now, events });
    if (!planned) return { noop: true };
    created = planned.created;
    return { commit: planned.commit };
  });
  if (!outcome.ok) throw new Error(`schedule: ${outcome.message}`);
  return created;
}

const DELIVERY_TABLES: TableName[] = ["Notifications", "PushSubscriptions", "NotificationPrefs"];

function isDue(n: AppNotification, now: number): boolean {
  const scheduled = parseMoment(n.scheduledAt)?.ms ?? 0;
  if (scheduled > now) return false;
  if (n.status === "pending") return true;
  if (n.status === "failed") return n.attempts < MAX_ATTEMPTS;
  // A run that claimed it but never finished (crash/timeout) → try again.
  if (n.status === "sending") return now - (parseMoment(n.sentAt)?.ms ?? 0) > CLAIM_TIMEOUT_MS;
  return false;
}

/**
 * Sends due notifications.
 *  1. claim: mark them "sending" under the sheet lock (checks their current status),
 *     so overlapping runs never push the same notification twice
 *  2. push to every active device of the member (if push is configured and wanted)
 *  3. record the result: sent / inapp / failed (retry later) / dead; gone devices are expired
 */
export async function deliverDue(now: number, opts: { memberIds?: string[]; limit?: number } = {}) {
  const limit = opts.limit ?? 200;
  let claimed: AppNotification[] = [];

  const claim = await runCommit(DELIVERY_TABLES, (data) => {
    const due = (data.Notifications ?? [])
      .map(toNotification)
      .filter((n) => isDue(n, now) && (!opts.memberIds || opts.memberIds.includes(n.memberId)))
      .slice(0, limit);
    claimed = due;
    if (!due.length) return { noop: true };
    const at = seoulIso(now);
    return {
      commit: {
        id: newId("C", now, 8),
        checks: due.map((n) => ({ type: "exists" as const, table: "Notifications" as const, id: n.id, fields: { status: n.status, attempts: cellText(n.raw.attempts) } })),
        ops: due.map((n): Op => ({ type: "update", table: "Notifications", id: n.id, set: { status: "sending", sent_at: at } })),
      },
    };
  });
  if (!claim.ok || !claimed.length) return { claimed: 0, sent: 0, inapp: 0, failed: 0 };

  // Fresh view of devices and preferences for the claimed members.
  const data = await readTables(["PushSubscriptions", "NotificationPrefs"], { fresh: true });
  const subs = (data.PushSubscriptions ?? []).map(toSubscription).filter((s) => s.status === "active");
  const keys = vapid();

  const results = new Map<string, { status: string; error?: string }>();
  const deviceUpdates = new Map<string, Record<string, string | number>>();

  for (const n of claimed) {
    const devices = subs.filter((s) => s.memberId === n.memberId);
    const wanted = prefsFor(data.NotificationPrefs, n.memberId)[category(n.type)];
    if (!keys || !wanted || devices.length === 0) {
      results.set(n.id, { status: "inapp" });
      continue;
    }
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url || "/", tag: n.id });
    let delivered = 0;
    let lastError = "";
    for (const device of devices) {
      try {
        await sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, {
          vapidDetails: keys,
          TTL: 24 * 3600,
          urgency: n.type.startsWith("payment") || n.type.endsWith("_d1") ? "high" : "normal",
          timeout: 10_000,
        });
        delivered++;
        deviceUpdates.set(device.id, { last_success_at: seoulIso(now), failure_count: 0 });
      } catch (error) {
        const code = error instanceof WebPushError ? error.statusCode : 0;
        if (code === 404 || code === 410) {
          deviceUpdates.set(device.id, { status: "expired" }); // browser dropped the subscription
        } else {
          lastError = `${code || "network"}: ${error instanceof Error ? error.message.slice(0, 120) : "push failed"}`;
          deviceUpdates.set(device.id, { failure_count: device.failureCount + 1 });
        }
      }
    }
    if (delivered > 0) results.set(n.id, { status: "sent" });
    else if (!lastError) results.set(n.id, { status: "inapp" }); // all devices gone
    else results.set(n.id, { status: n.attempts + 1 >= MAX_ATTEMPTS ? "dead" : "failed", error: lastError });
  }

  const at = seoulIso(now);
  await runCommit(DELIVERY_TABLES, () => ({
    commit: {
      id: newId("C", now, 8),
      checks: [],
      ops: [
        ...claimed.map((n): Op => {
          const r = results.get(n.id)!;
          const failed = r.status === "failed" || r.status === "dead";
          return {
            type: "update",
            table: "Notifications",
            id: n.id,
            set: { status: r.status, sent_at: at, attempts: failed ? n.attempts + 1 : n.attempts, last_error: r.error ?? "" },
          };
        }),
        ...[...deviceUpdates].map(([id, set]): Op => ({ type: "update", table: "PushSubscriptions", id, set })),
      ],
    },
  }));

  const count = (s: string) => [...results.values()].filter((r) => r.status === s).length;
  return { claimed: claimed.length, sent: count("sent"), inapp: count("inapp"), failed: count("failed") + count("dead") };
}
