import { addDays, daysInMonth, makeDateKey, toDateKey, weekdayOfKey } from "./dates";
import {
  eventDayRange,
  getEnrollmentStatus,
  getEventStatus,
  isMuted,
  registrationCloseMs,
} from "./status";
import type { ClubEvent, Enrollment } from "./types";

/** Weeks (Sunday first) covering the month; each week is 7 day keys. */
export function monthWeeks(year: number, month: number): string[][] {
  const first = makeDateKey(year, month, 1);
  const last = makeDateKey(year, month, daysInMonth(year, month));
  const gridStart = addDays(first, -weekdayOfKey(first));
  const gridEnd = addDays(last, 6 - weekdayOfKey(last));

  const weeks: string[][] = [];
  for (let weekStart = gridStart; weekStart <= gridEnd; weekStart = addDays(weekStart, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));
  }
  return weeks;
}

export type RangeKind = "enrollment" | "registration";

/** A multi-day period drawn as a bar: member enrollment or an event's sign-up window. */
export interface RangeItem {
  id: string;
  kind: RangeKind;
  /** event id or enrollment id */
  refId: string;
  label: string;
  startKey: string;
  /** inclusive */
  endKey: string;
  muted: boolean;
}

/**
 * Member enrollment periods and event registration windows.
 * A registration bar is only drawn when the crew set registration_open;
 * otherwise there is no meaningful "period" to show.
 */
export function buildRangeItems(events: ClubEvent[], enrollments: Enrollment[], now: number): RangeItem[] {
  const todayKey = toDateKey(now);
  const ranges: RangeItem[] = enrollments.map((en) => ({
    id: `enrollment:${en.id}`,
    kind: "enrollment",
    refId: en.id,
    label: en.title,
    startKey: en.startDate,
    endKey: en.endDate,
    muted: isMuted(getEnrollmentStatus(en, todayKey)),
  }));

  for (const event of events) {
    if (event.registrationOpen === null || event.status === "canceled") continue;
    const startKey = toDateKey(event.registrationOpen);
    const endKey = toDateKey(registrationCloseMs(event) - 1);
    if (endKey < startKey) continue;
    ranges.push({
      id: `registration:${event.id}`,
      kind: "registration",
      refId: event.id,
      label: event.shortTitle,
      startKey,
      endKey,
      muted: isMuted(getEventStatus(event, now)),
    });
  }
  return ranges;
}

export interface WeekSegment extends RangeItem {
  /** 0–6 */
  startCol: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

const KIND_ORDER: Record<RangeKind, number> = { enrollment: 0, registration: 1 };

/**
 * Places the ranges that touch this week into stacked lanes so overlapping
 * bars never cover each other. Enrollment periods get the top lanes.
 */
export function layoutWeek(week: string[], ranges: RangeItem[]): WeekSegment[] {
  const weekStart = week[0];
  const weekEnd = week[week.length - 1];
  const touching = ranges
    .filter((r) => r.startKey <= weekEnd && r.endKey >= weekStart)
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.startKey.localeCompare(b.startKey) ||
        b.endKey.localeCompare(a.endKey) ||
        a.id.localeCompare(b.id),
    );

  const laneEnds: number[] = [];
  return touching.map((range) => {
    const continuesBefore = range.startKey < weekStart;
    const continuesAfter = range.endKey > weekEnd;
    const startCol = continuesBefore ? 0 : week.indexOf(range.startKey);
    const endCol = continuesAfter ? week.length - 1 : week.indexOf(range.endKey);

    let lane = laneEnds.findIndex((end) => end < startCol);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endCol);
    } else {
      laneEnds[lane] = endCol;
    }

    return { ...range, startCol, span: endCol - startCol + 1, lane, continuesBefore, continuesAfter };
  });
}

/** Events taking place on the given day (multi-day events count on every day). */
export function eventsOnDay(events: ClubEvent[], key: string): ClubEvent[] {
  return events
    .filter((event) => {
      const { first, last } = eventDayRange(event);
      return first <= key && key <= last;
    })
    .sort((a, b) => a.start - b.start);
}

export function rangesOnDay(ranges: RangeItem[], key: string): RangeItem[] {
  return ranges.filter((r) => r.startKey <= key && key <= r.endKey);
}
