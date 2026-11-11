import { describe, expect, it } from "vitest";
import { buildRangeItems, eventsOnDay, layoutWeek, monthWeeks } from "./calendar";
import { addDays, dateKeyToMs, parseMoment, toDateKey } from "./dates";
import { formatCloseAt, registrationWindowLabel } from "./event-format";
import { formatFee, normalizeEnrollment, normalizeEvent, normalizeFeed, safeUrl } from "./normalize";
import { buildSampleData } from "./sample-data";
import { getEnrollmentStatus, getEventStatus } from "./status";
import type { ClubEvent } from "./types";

const seoul = (s: string) => Date.parse(`${s}+09:00`);

function event(overrides: Record<string, unknown> = {}): ClubEvent {
  const e = normalizeEvent({
    event_id: "e1",
    title: "볼더링 세션",
    start_at: "2026-11-20T19:30:00+09:00",
    end_at: "2026-11-20T22:00:00+09:00",
    visibility: "public",
    status: "published",
    ...overrides,
  });
  if (!e) throw new Error("fixture did not normalize");
  return e;
}

describe("dates (Asia/Seoul)", () => {
  it("parses date-only values as Seoul midnight", () => {
    expect(parseMoment("2026-11-14")).toEqual({ ms: seoul("2026-11-14T00:00:00"), dateOnly: true });
    expect(parseMoment("2026. 11. 14")?.ms).toBe(seoul("2026-11-14T00:00:00"));
  });

  it("reads times without an offset as Seoul local time", () => {
    expect(parseMoment("2026-11-14 19:30")?.ms).toBe(seoul("2026-11-14T19:30:00"));
    expect(parseMoment("2026-11-14T10:30:00Z")?.ms).toBe(Date.parse("2026-11-14T10:30:00Z"));
  });

  it("rejects impossible dates and junk", () => {
    expect(parseMoment("2026-02-30")).toBeNull();
    expect(parseMoment("2026-11-14 25:00")).toBeNull();
    expect(parseMoment("다음 주 금요일")).toBeNull();
    expect(parseMoment(45000)).toBeNull();
  });

  it("uses the Seoul day, not the UTC day", () => {
    // 2026-11-14 00:30 in Seoul is still 2026-11-13 in UTC.
    expect(toDateKey(seoul("2026-11-14T00:30:00"))).toBe("2026-11-14");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateKeyToMs("2026-11-14")).toBe(seoul("2026-11-14T00:00:00"));
  });
});

describe("event status", () => {
  it("is OPEN with no registration window until the event starts", () => {
    const e = event();
    expect(getEventStatus(e, seoul("2026-11-20T19:29:00"))).toBe("OPEN");
    expect(getEventStatus(e, seoul("2026-11-20T19:30:00"))).toBe("CLOSED");
    expect(getEventStatus(e, seoul("2026-11-20T22:00:00"))).toBe("FINISHED");
  });

  it("follows the registration window", () => {
    const e = event({ registration_open: "2026-11-10T12:00", registration_close: "2026-11-15" });
    expect(getEventStatus(e, seoul("2026-11-10T11:59:00"))).toBe("COMING_SOON");
    expect(getEventStatus(e, seoul("2026-11-10T12:00:00"))).toBe("OPEN");
    // A date-only close keeps registration open through the end of that day.
    expect(getEventStatus(e, seoul("2026-11-15T23:59:00"))).toBe("OPEN");
    expect(getEventStatus(e, seoul("2026-11-16T00:00:00"))).toBe("CLOSED");
    expect(formatCloseAt(e.registrationClose!)).toBe("11.15 (일) 23:59");
    expect(registrationWindowLabel(e)).toBe("11.10 (화) 12:00 – 11.15 (일) 23:59");
  });

  it("respects closed and canceled from the sheet", () => {
    const now = seoul("2026-11-12T12:00:00");
    expect(getEventStatus(event({ status: "closed" }), now)).toBe("CLOSED");
    expect(getEventStatus(event({ status: "canceled" }), now)).toBe("CANCELED");
    expect(getEventStatus(event({ status: "closed" }), seoul("2026-11-21T00:00:00"))).toBe("FINISHED");
  });

  it("treats an event without end_at as lasting until the end of its day", () => {
    const e = event({ end_at: "" });
    expect(getEventStatus(e, seoul("2026-11-20T23:59:00"))).toBe("CLOSED");
    expect(getEventStatus(e, seoul("2026-11-21T00:00:00"))).toBe("FINISHED");
  });
});

describe("public data filtering", () => {
  it("drops private, draft and unknown rows even if the feed sends them", () => {
    expect(normalizeEvent({ event_id: "x", title: "t", start_at: "2026-11-20", visibility: "private", status: "published" })).toBeNull();
    expect(normalizeEvent({ event_id: "x", title: "t", start_at: "2026-11-20", visibility: "public", status: "draft" })).toBeNull();
    expect(normalizeEvent({ event_id: "x", title: "t", start_at: "2026-11-20", status: "published" })).toBeNull();
    expect(normalizeEnrollment({ enrollment_id: "x", title: "t", start_date: "2026-11-20", status: "draft" })).toBeNull();
  });

  it("never passes non-http links through", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://forms.gle/abc")).toBe("https://forms.gle/abc");
    expect(event({ registration_url: "javascript:alert(1)" }).registrationUrl).toBeNull();
  });

  it("formats the public fee", () => {
    expect(formatFee(10000)).toBe("10,000원");
    expect(formatFee("15000")).toBe("15,000원");
    expect(formatFee(0)).toBe("무료");
    expect(formatFee("1인 5,000원 (음료 포함)")).toBe("1인 5,000원 (음료 포함)");
    expect(formatFee("")).toBeNull();
  });

  it("dedupes ids and sorts by start", () => {
    const feed = normalizeFeed({
      events: [
        { event_id: "b", title: "B", start_at: "2026-11-21", visibility: "public", status: "published" },
        { event_id: "a", title: "A", start_at: "2026-11-20", visibility: "public", status: "published" },
        { event_id: "a", title: "dup", start_at: "2026-11-22", visibility: "public", status: "published" },
      ],
    });
    expect(feed.events.map((e) => e.title)).toEqual(["A", "B"]);
  });
});

describe("calendar layout", () => {
  it("builds Sunday-first weeks covering the whole month", () => {
    const weeks = monthWeeks(2026, 11);
    expect(weeks[0][0]).toBe("2026-11-01"); // Nov 1st 2026 is a Sunday
    expect(weeks.at(-1)?.at(-1)).toBe("2026-12-05");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("splits a period across weeks and stacks overlapping bars in lanes", () => {
    const [, week2, week3] = monthWeeks(2026, 11); // 11/08–11/14, 11/15–11/21
    const ranges = [
      { id: "en", kind: "enrollment" as const, refId: "en", label: "등록", startKey: "2026-11-12", endKey: "2026-11-17", muted: false },
      { id: "re", kind: "registration" as const, refId: "e", label: "신청", startKey: "2026-11-10", endKey: "2026-11-13", muted: false },
    ];
    const w2 = layoutWeek(week2, ranges);
    expect(w2.find((s) => s.id === "en")).toMatchObject({ startCol: 4, span: 3, lane: 0, continuesAfter: true });
    expect(w2.find((s) => s.id === "re")).toMatchObject({ startCol: 2, span: 4, lane: 1 });
    const w3 = layoutWeek(week3, ranges);
    expect(w3).toHaveLength(1);
    expect(w3[0]).toMatchObject({ id: "en", startCol: 0, span: 3, continuesBefore: true, continuesAfter: false });
  });

  it("only draws registration bars when registration_open is set", () => {
    const now = seoul("2026-11-12T12:00:00");
    const withWindow = event({ event_id: "w", registration_open: "2026-11-10", registration_close: "2026-11-18" });
    const ranges = buildRangeItems([event(), withWindow], [], now);
    expect(ranges).toEqual([
      expect.objectContaining({ kind: "registration", refId: "w", startKey: "2026-11-10", endKey: "2026-11-18" }),
    ]);
  });

  it("puts multi-day events on every day they span", () => {
    const camp = event({ start_at: "2026-11-20", end_at: "2026-11-22" });
    expect(eventsOnDay([camp], "2026-11-19")).toHaveLength(0);
    expect(eventsOnDay([camp], "2026-11-22")).toHaveLength(1);
    expect(eventsOnDay([camp], "2026-11-23")).toHaveLength(0);
  });

  it("enrollment status uses inclusive Seoul days", () => {
    const en = normalizeEnrollment({ enrollment_id: "m", title: "등록", start_date: "2026-11-10", end_date: "2026-11-20", status: "published" })!;
    expect(getEnrollmentStatus(en, "2026-11-09")).toBe("COMING_SOON");
    expect(getEnrollmentStatus(en, "2026-11-20")).toBe("OPEN");
    expect(getEnrollmentStatus(en, "2026-11-21")).toBe("CLOSED");
  });
});

describe("sample data", () => {
  it("shows every status and hides the private row", () => {
    const now = seoul("2026-11-11T12:00:00");
    const data = buildSampleData(now);
    const statuses = new Set(data.events.map((e) => getEventStatus(e, now)));
    expect(statuses).toEqual(new Set(["OPEN", "COMING_SOON", "CLOSED", "FINISHED", "CANCELED"]));
    expect(data.events.some((e) => e.id === "sample-private")).toBe(false);
    expect(data.enrollments).toHaveLength(2);
  });
});
