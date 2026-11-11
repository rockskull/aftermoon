import {
  dateKeyToMs,
  formatDateKo,
  formatDateTimeKo,
  formatDuration,
  formatKeyKo,
  formatTime,
  toDateKey,
} from "./dates";
import { eventDayRange } from "./status";
import type { ClubEvent } from "./types";

const isSeoulMidnight = (ms: number) => dateKeyToMs(toDateKey(ms)) === ms;

/** "19:30 – 22:00", "종일", "11.14 (토) – 11.16 (월)" */
export function eventTimeLabel(event: ClubEvent): string {
  const { first, last } = eventDayRange(event);
  if (event.allDay) {
    return first === last ? "종일" : `${formatKeyKo(first)} – ${formatKeyKo(last)}`;
  }
  if (event.end === null) return formatTime(event.start);
  return first === last
    ? `${formatTime(event.start)} – ${formatTime(event.end)}`
    : `${formatTime(event.start)} – ${formatDateTimeKo(event.end)}`;
}

/** "2시간 30분"; null for all-day events or events without an end time. */
export function eventDurationLabel(event: ClubEvent): string | null {
  if (event.allDay || event.end === null) return null;
  return formatDuration(event.end - event.start) || null;
}

/** Opening moment; a midnight open is shown as just the date. */
export function formatOpenAt(ms: number): string {
  return isSeoulMidnight(ms) ? formatDateKo(ms) : formatDateTimeKo(ms);
}

/** Closing moment; an exclusive midnight close is shown as 23:59 of the previous day. */
export function formatCloseAt(ms: number): string {
  return isSeoulMidnight(ms) ? `${formatDateKo(ms - 1)} 23:59` : formatDateTimeKo(ms);
}

/** "11.08 (일) 10:00 – 11.14 (토) 18:00" */
export function registrationWindowLabel(event: ClubEvent): string {
  const close =
    event.registrationClose !== null
      ? formatCloseAt(event.registrationClose)
      : `${formatDateTimeKo(event.start)} 시작 전까지`;
  return event.registrationOpen === null ? `~ ${close}` : `${formatOpenAt(event.registrationOpen)} – ${close}`;
}

export function eventHref(event: Pick<ClubEvent, "id">): string {
  return `/events/${encodeURIComponent(event.id)}`;
}
