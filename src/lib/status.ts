import { addDays, dateKeyToMs, toDateKey } from "./dates";
import type {
  ClubEvent,
  Enrollment,
  EnrollmentDisplayStatus,
  EventDisplayStatus,
} from "./types";

/** When the event is over. Without end_at, the event lasts until the end of its start day. */
export function eventEndMs(event: ClubEvent): number {
  return event.end ?? dateKeyToMs(addDays(toDateKey(event.start), 1));
}

/** First and last Seoul day the event occupies on the calendar. */
export function eventDayRange(event: ClubEvent): { first: string; last: string } {
  const first = toDateKey(event.start);
  const last = toDateKey(eventEndMs(event) - 1);
  return { first, last: last < first ? first : last };
}

/** Registration closes at registration_close, or when the event starts if none was given. */
export function registrationCloseMs(event: ClubEvent): number {
  return event.registrationClose ?? event.start;
}

export function getEventStatus(event: ClubEvent, now: number): EventDisplayStatus {
  if (event.status === "canceled") return "CANCELED";
  if (now >= eventEndMs(event)) return "FINISHED";
  if (event.status === "closed") return "CLOSED"; // closed by the crew, e.g. full
  if (event.registrationOpen !== null && now < event.registrationOpen) return "COMING_SOON";
  if (now >= registrationCloseMs(event)) return "CLOSED";
  return "OPEN";
}

export function getEnrollmentStatus(enrollment: Enrollment, todayKey: string): EnrollmentDisplayStatus {
  if (enrollment.status === "closed") return "CLOSED";
  if (todayKey < enrollment.startDate) return "COMING_SOON";
  if (todayKey > enrollment.endDate) return "CLOSED";
  return "OPEN";
}

/** Closed, finished and canceled items are drawn visually weaker. */
export function isMuted(status: EventDisplayStatus | EnrollmentDisplayStatus): boolean {
  return status === "CLOSED" || status === "FINISHED" || status === "CANCELED";
}

export const EVENT_STATUS_LABEL: Record<EventDisplayStatus, { en: string; ko: string }> = {
  COMING_SOON: { en: "COMING SOON", ko: "신청 전" },
  OPEN: { en: "OPEN", ko: "신청 가능" },
  CLOSED: { en: "CLOSED", ko: "신청 마감" },
  FINISHED: { en: "FINISHED", ko: "종료" },
  CANCELED: { en: "CANCELED", ko: "취소" },
};

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentDisplayStatus, { en: string; ko: string }> = {
  COMING_SOON: { en: "COMING SOON", ko: "등록 예정" },
  OPEN: { en: "OPEN", ko: "등록 중" },
  CLOSED: { en: "CLOSED", ko: "등록 마감" },
};

/** Upcoming first (soonest on top), then past events (most recent on top). */
export function splitUpcoming(events: ClubEvent[], now: number) {
  const upcoming = events.filter((e) => now < eventEndMs(e)).sort((a, b) => a.start - b.start);
  const past = events.filter((e) => now >= eventEndMs(e)).sort((a, b) => b.start - a.start);
  return { upcoming, past };
}
