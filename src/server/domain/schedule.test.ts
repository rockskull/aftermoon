import { describe, expect, it } from "vitest";
import { normalizeEvent } from "@/lib/normalize";
import type { ClubEvent } from "@/lib/types";
import { applyCommit } from "../store/commit";
import type { Tables } from "../store/schema";
import { deliveryTime, planSchedule } from "./schedule";

const at = (s: string) => Date.parse(`${s}+09:00`);

function tables(): Tables {
  return {
    Members: [
      { member_id: "A", name: "A", email: "a@x", role: "member", status: "active" },
      { member_id: "OP", name: "OP", email: "op@x", role: "operator", status: "active" },
    ],
    Memberships: [
      { membership_id: "MA", member_id: "A", plan_id: "1M", start_date: "2026-10-20", end_date: "2026-11-18", status: "active" },
      { membership_id: "MO", member_id: "OP", plan_id: "12M", start_date: "2026-01-01", end_date: "2027-02-28", status: "active" },
    ],
    Payments: [],
    Notifications: [],
    NotificationPrefs: [],
    EventWatch: [],
  };
}

const event = (o: Record<string, unknown> = {}): ClubEvent =>
  normalizeEvent({
    event_id: "E1",
    title: "세션",
    start_at: "2026-11-20T19:00:00+09:00",
    end_at: "2026-11-20T21:00:00+09:00",
    registration_open: "2026-11-11T10:00:00+09:00",
    visibility: "public",
    status: "published",
    ...o,
  })!;

/** Runs the scheduler and returns member A's notifications (operator digests are tested separately). */
function run(t: Tables, now: number, events: ClubEvent[]) {
  const planned = planSchedule(t, { now, events });
  if (planned) expect(applyCommit(t, planned.commit)).toMatchObject({ ok: true });
  return (t.Notifications ?? []).filter((n) => n.member_id === "A").map((n) => `${n.type}:${n.member_id}`);
}

describe("notification schedule", () => {
  it("sends D-7 once, then D-1, and never twice", () => {
    const t = tables();
    expect(run(t, at("2026-11-11T12:00:00"), [])).toEqual(["membership_d7:A"]);
    expect(run(t, at("2026-11-11T18:00:00"), [])).toEqual(["membership_d7:A"]); // rerun: nothing new
    expect(run(t, at("2026-11-17T12:00:00"), [])).toEqual(["membership_d7:A", "membership_d1:A"]);
  });

  it("first run only remembers existing events; later runs announce new, changed and canceled ones", () => {
    const t = tables();
    t.Memberships = []; // no expiry noise
    run(t, at("2026-11-05T12:00:00"), [event({ registration_open: "2026-11-15T10:00:00+09:00" })]);
    expect(t.Notifications).toHaveLength(0);
    expect(t.EventWatch).toHaveLength(1);

    run(t, at("2026-11-06T12:00:00"), [
      event({ registration_open: "2026-11-15T10:00:00+09:00" }),
      event({ event_id: "E2", title: "LP 나잇", registration_open: "2026-11-15T10:00:00+09:00" }),
    ]);
    expect(t.Notifications!.map((n) => `${n.type}:${n.member_id}`).sort()).toEqual(["event_new:A", "event_new:OP"]);

    run(t, at("2026-11-07T12:00:00"), [event({ start_at: "2026-11-21T19:00:00+09:00", end_at: "2026-11-21T21:00:00+09:00", registration_open: "2026-11-15T10:00:00+09:00" })]);
    run(t, at("2026-11-08T12:00:00"), [event({ status: "canceled", start_at: "2026-11-21T19:00:00+09:00", end_at: "2026-11-21T21:00:00+09:00" })]);
    const types = t.Notifications!.filter((n) => n.member_id === "A").map((n) => n.type);
    expect(types).toEqual(["event_new", "event_changed", "event_canceled"]);
  });

  it("announces registration opening and closing within 24h", () => {
    const t = tables();
    t.Memberships = [];
    run(t, at("2026-11-10T12:00:00"), [event()]); // first run: just remembers the event
    const e = event({ registration_close: "2026-11-12T12:00:00+09:00" });
    run(t, at("2026-11-11T13:00:00"), [e]);
    const types = t.Notifications!.filter((n) => n.member_id === "A").map((n) => n.type);
    expect(types).toContain("event_open");
    expect(types).toContain("event_closing");
  });

  it("respects member preferences", () => {
    const t = tables();
    t.NotificationPrefs = [{ member_id: "A", membership: false, events: true, operator: true }];
    expect(run(t, at("2026-11-11T12:00:00"), [])).toEqual([]);
  });

  it("holds night-time notifications until 09:00 KST", () => {
    expect(deliveryTime(at("2026-11-11T23:30:00"))).toBe(at("2026-11-12T09:00:00"));
    expect(deliveryTime(at("2026-11-11T03:00:00"))).toBe(at("2026-11-11T09:00:00"));
    expect(deliveryTime(at("2026-11-11T15:00:00"))).toBe(at("2026-11-11T15:00:00"));
  });

  it("sends operators one digest a day when something needs attention", () => {
    const t = tables();
    t.Payments = [{ payment_id: "P", member_id: "A", amount: 80000, plan_id: "1M", status: "pending" }];
    run(t, at("2026-11-11T12:00:00"), []);
    run(t, at("2026-11-11T16:00:00"), []);
    expect(t.Notifications!.filter((n) => n.type === "op_digest").map((n) => n.member_id)).toEqual(["OP"]);
  });
});
