/**
 * Date helpers for the club. Every date on the site is Asia/Seoul.
 * Korea has not observed DST since 1988, so a fixed UTC+9 offset is exact
 * and we never depend on the server's or the visitor's local timezone.
 *
 * Two representations are used throughout:
 *  - instants: epoch milliseconds (number)
 *  - day keys: "YYYY-MM-DD" strings for a Seoul calendar day
 */

export const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEKDAY_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const MONTH_EN = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
] as const;

export { WEEKDAY_EN, WEEKDAY_KO, MONTH_EN };

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Seoul day key ("YYYY-MM-DD") for an instant. */
export function toDateKey(ms: number): string {
  return new Date(ms + SEOUL_OFFSET_MS).toISOString().slice(0, 10);
}

/** Day key from calendar parts; out-of-range parts roll over (e.g. day 0). */
export function makeDateKey(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** The instant at 00:00 Seoul time on the given day. */
export function dateKeyToMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - SEOUL_OFFSET_MS;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return makeDateKey(y, m, d + days);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOfKey(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface SeoulParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

export function seoulParts(ms: number): SeoulParts {
  const d = new Date(ms + SEOUL_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

export interface ParsedMoment {
  ms: number;
  /** true when the source had no time component (e.g. "2026-11-14"). */
  dateOnly: boolean;
}

const DATE_ONLY = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/;
const DATE_TIME =
  /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

function validKey(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const key = makeDateKey(y, m, d);
  // Rejects impossible dates such as 2026-02-30 (which would roll over).
  return key === `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}` ? key : null;
}

function offsetMs(tz: string): number {
  if (tz.toUpperCase() === "Z") return 0;
  const sign = tz.startsWith("-") ? -1 : 1;
  const digits = tz.slice(1).replace(":", "");
  return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4))) * 60_000;
}

/**
 * Parses what the Google Sheet feed sends: "YYYY-MM-DD" for date-only cells,
 * or "YYYY-MM-DDTHH:mm[:ss][offset]" for date-time cells. Values without an
 * explicit offset are read as Seoul local time. Returns null when unparsable.
 */
export function parseMoment(input: unknown): ParsedMoment | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  const dateOnly = DATE_ONLY.exec(s);
  if (dateOnly) {
    const key = validKey(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
    return key ? { ms: dateKeyToMs(key), dateOnly: true } : null;
  }

  const dt = DATE_TIME.exec(s);
  if (!dt) return null;
  const [, y, mo, d, hh, mi, ss = "0", tz] = dt;
  const key = validKey(Number(y), Number(mo), Number(d));
  if (!key || Number(hh) > 23 || Number(mi) > 59 || Number(ss) > 59) return null;
  const wallClock = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss));
  return { ms: wallClock - (tz ? offsetMs(tz) : SEOUL_OFFSET_MS), dateOnly: false };
}

// ---------------------------------------------------------------------------
// Display formatting (Korean UI)
// ---------------------------------------------------------------------------

/** "11.14" */
export function formatMonthDay(ms: number): string {
  const p = seoulParts(ms);
  return `${pad2(p.month)}.${pad2(p.day)}`;
}

/** "11.14 (토)" */
export function formatDateKo(ms: number): string {
  return `${formatMonthDay(ms)} (${WEEKDAY_KO[seoulParts(ms).weekday]})`;
}

/** "11.14 (토)" for a day key */
export function formatKeyKo(key: string): string {
  return formatDateKo(dateKeyToMs(key));
}

/** "19:30" */
export function formatTime(ms: number): string {
  const p = seoulParts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** "11.14 (토) 19:30" */
export function formatDateTimeKo(ms: number): string {
  return `${formatDateKo(ms)} ${formatTime(ms)}`;
}

/** "2026년 11월 14일 토요일" */
export function formatLongDateKo(ms: number): string {
  const p = seoulParts(ms);
  return `${p.year}년 ${p.month}월 ${p.day}일 ${WEEKDAY_KO[p.weekday]}요일`;
}

/** "11월 14일 토요일" for a day key */
export function formatKeyLongKo(key: string): string {
  const p = seoulParts(dateKeyToMs(key));
  return `${p.month}월 ${p.day}일 ${WEEKDAY_KO[p.weekday]}요일`;
}

/** "2시간 30분", "45분", "3일" */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes <= 0) return "";
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}일`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  return h ? `${h}시간` : `${m}분`;
}
