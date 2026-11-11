import { DAY_MS, parseMoment, toDateKey } from "./dates";
import type {
  ClubEvent,
  Enrollment,
  PublicEnrollmentStatus,
  PublicEventStatus,
} from "./types";

/**
 * Turns the Apps Script feed into typed data.
 *
 * The Apps Script already filters out private rows and columns. This is a
 * second line of defence: anything that is not explicitly public, or that is
 * malformed, is dropped here as well.
 */

const PUBLIC_EVENT_STATUSES: readonly PublicEventStatus[] = ["published", "closed", "canceled"];
const PUBLIC_ENROLLMENT_STATUSES: readonly PublicEnrollmentStatus[] = ["published", "closed"];

type RawRecord = Record<string, unknown>;

function isRecord(v: unknown): v is RawRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function optionalText(v: unknown): string | null {
  return text(v) || null;
}

/** Only http(s) links are allowed out of the sheet (no javascript:, data:, …). */
export function safeUrl(v: unknown): string | null {
  const s = text(v);
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function positiveInt(v: unknown): number | null {
  const digits = text(v).replace(/[^\d]/g, "");
  const n = digits ? Number(digits) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const withCommas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** 10000 → "10,000원", 0 → "무료", free text is kept as typed. */
export function formatFee(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v <= 0 ? "무료" : `${withCommas(Math.round(v))}원`;
  }
  const s = text(v);
  if (!s) return null;
  if (/^\d[\d,]*$/.test(s)) {
    const n = Number(s.replace(/,/g, ""));
    return n === 0 ? "무료" : `${withCommas(n)}원`;
  }
  return s;
}

export function normalizeEvent(raw: unknown): ClubEvent | null {
  if (!isRecord(raw)) return null;
  if (text(raw.visibility).toLowerCase() !== "public") return null;
  const status = text(raw.status).toLowerCase() as PublicEventStatus;
  if (!PUBLIC_EVENT_STATUSES.includes(status)) return null;

  const id = text(raw.event_id);
  const title = text(raw.title);
  const start = parseMoment(raw.start_at);
  if (!id || !title || !start) return null;

  // A date-only end ("2026-11-15") means "through the end of that day".
  const endParsed = parseMoment(raw.end_at);
  let end = endParsed ? endParsed.ms + (endParsed.dateOnly ? DAY_MS : 0) : null;
  if (end !== null && end <= start.ms) end = null;

  // A date-only close means "until the end of that day"; a date-only open means "from 00:00".
  const open = parseMoment(raw.registration_open);
  const close = parseMoment(raw.registration_close);
  const registrationClose = close ? close.ms + (close.dateOnly ? DAY_MS : 0) : null;

  return {
    id,
    title,
    shortTitle: text(raw.short_title) || title,
    description: text(raw.description),
    category: optionalText(raw.category),
    start: start.ms,
    end,
    allDay: start.dateOnly,
    registrationOpen: open ? open.ms : null,
    registrationClose,
    capacity: positiveInt(raw.capacity),
    fee: formatFee(raw.public_fee),
    registrationUrl: safeUrl(raw.registration_url),
    host: optionalText(raw.host),
    audience: optionalText(raw.audience),
    location: optionalText(raw.location),
    notes: optionalText(raw.notes),
    status,
  };
}

export function normalizeEnrollment(raw: unknown): Enrollment | null {
  if (!isRecord(raw)) return null;
  const status = text(raw.status).toLowerCase() as PublicEnrollmentStatus;
  if (!PUBLIC_ENROLLMENT_STATUSES.includes(status)) return null;

  const id = text(raw.enrollment_id);
  const title = text(raw.title);
  const start = parseMoment(raw.start_date);
  const end = parseMoment(raw.end_date) ?? start;
  if (!id || !title || !start || !end) return null;

  const startDate = toDateKey(start.ms);
  const endDate = toDateKey(end.ms);
  if (endDate < startDate) return null;

  return {
    id,
    title,
    description: text(raw.description),
    startDate,
    endDate,
    applicationUrl: safeUrl(raw.application_url),
    status,
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

export function normalizeFeed(raw: unknown): { events: ClubEvent[]; enrollments: Enrollment[] } {
  const feed = isRecord(raw) ? raw : {};
  const events = (Array.isArray(feed.events) ? feed.events : [])
    .map(normalizeEvent)
    .filter((e): e is ClubEvent => e !== null)
    .sort((a, b) => a.start - b.start);
  const enrollments = (Array.isArray(feed.enrollments) ? feed.enrollments : [])
    .map(normalizeEnrollment)
    .filter((e): e is Enrollment => e !== null)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return { events: uniqueById(events), enrollments: uniqueById(enrollments) };
}
