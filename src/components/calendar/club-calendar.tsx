"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  buildRangeItems,
  eventsOnDay,
  layoutWeek,
  monthWeeks,
  rangesOnDay,
  type RangeItem,
  type WeekSegment,
} from "@/lib/calendar";
import {
  MONTH_EN,
  WEEKDAY_EN,
  formatKeyKo,
  formatKeyLongKo,
  makeDateKey,
  toDateKey,
  weekdayOfKey,
} from "@/lib/dates";
import { eventHref, eventTimeLabel, formatCloseAt, registrationWindowLabel } from "@/lib/event-format";
import { getEnrollmentStatus, getEventStatus, isMuted } from "@/lib/status";
import type { ClubEvent, Enrollment, EventDisplayStatus } from "@/lib/types";
import { ArrowRight, ArrowUpRight, cn, StatusBadge } from "../ui";

/** Bars beyond this many lanes per week are still listed in the day panel. */
const MAX_LANES = 3;

interface Props {
  events: ClubEvent[];
  enrollments: Enrollment[];
  /** Request time from the server, so server and client render the same day. */
  now: number;
}

export function ClubCalendar({ events, enrollments, now }: Props) {
  const todayKey = toDateKey(now);
  const [view, setView] = useState(() => ({
    year: Number(todayKey.slice(0, 4)),
    month: Number(todayKey.slice(5, 7)),
  }));
  const [selectedKey, setSelectedKey] = useState(todayKey);

  const statusById = useMemo(
    () => new Map<string, EventDisplayStatus>(events.map((e) => [e.id, getEventStatus(e, now)])),
    [events, now],
  );
  const ranges = useMemo(() => buildRangeItems(events, enrollments, now), [events, enrollments, now]);
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const enrollmentsById = useMemo(() => new Map(enrollments.map((e) => [e.id, e])), [enrollments]);
  const weeks = useMemo(() => monthWeeks(view.year, view.month), [view]);
  const monthPrefix = `${view.year}-${String(view.month).padStart(2, "0")}`;
  const isCurrentMonth = todayKey.startsWith(monthPrefix);

  function showMonth(year: number, month: number) {
    const normalized = new Date(Date.UTC(year, month - 1, 1));
    const next = { year: normalized.getUTCFullYear(), month: normalized.getUTCMonth() + 1 };
    setView(next);
    const prefix = `${next.year}-${String(next.month).padStart(2, "0")}`;
    setSelectedKey(todayKey.startsWith(prefix) ? todayKey : makeDateKey(next.year, next.month, 1));
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border-2 border-midnight bg-ivory shadow-[4px_4px_0_0_var(--color-midnight)]">
        {/* Month header */}
        <div className="flex items-center gap-2 border-b-2 border-midnight px-2 py-2 sm:px-3">
          <MonthButton direction="prev" onClick={() => showMonth(view.year, view.month - 1)} />
          <h3 className="flex-1 text-center" aria-live="polite">
            <span className="font-display text-[28px] font-extrabold uppercase leading-none text-midnight sm:text-[32px]">
              {MONTH_EN[view.month - 1]}
            </span>
            <span className="ml-2 font-mono text-[13px] font-medium text-ink-soft">{view.year}</span>
          </h3>
          <MonthButton direction="next" onClick={() => showMonth(view.year, view.month + 1)} />
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 border-b border-plywood-400 bg-plywood-200/60" aria-hidden="true">
          {WEEKDAY_EN.map((d, i) => (
            <div
              key={d}
              className={cn(
                "py-1.5 text-center font-mono text-[10px] font-semibold tracking-[0.12em] sm:text-[11px]",
                i === 0 ? "text-brown" : "text-ink-soft",
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div role="group" aria-label={`${view.year}년 ${view.month}월 일정`}>
          {weeks.map((week) => (
            <WeekRow
              key={week[0]}
              week={week}
              events={events}
              ranges={ranges}
              statusById={statusById}
              monthPrefix={monthPrefix}
              todayKey={todayKey}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          ))}
        </div>

        <Legend />
      </div>

      {!isCurrentMonth && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => showMonth(Number(todayKey.slice(0, 4)), Number(todayKey.slice(5, 7)))}
            className="font-label text-xs font-semibold uppercase tracking-[0.2em] text-midnight underline decoration-butter decoration-2 underline-offset-4"
          >
            Back to today
          </button>
        </div>
      )}

      <DayPanel
        dayKey={selectedKey}
        isToday={selectedKey === todayKey}
        events={eventsOnDay(events, selectedKey)}
        ranges={rangesOnDay(ranges, selectedKey)}
        eventsById={eventsById}
        enrollmentsById={enrollmentsById}
        statusById={statusById}
        todayKey={todayKey}
      />
    </div>
  );
}

function MonthButton({ direction, onClick }: { direction: "prev" | "next"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "이전 달" : "다음 달"}
      className="grid size-11 shrink-0 place-items-center rounded-md text-midnight hover:bg-plywood-200 active:bg-plywood-400"
    >
      <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
        <path
          d={direction === "prev" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"}
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="square"
        />
      </svg>
    </button>
  );
}

interface WeekRowProps {
  week: string[];
  events: ClubEvent[];
  ranges: RangeItem[];
  statusById: Map<string, EventDisplayStatus>;
  monthPrefix: string;
  todayKey: string;
  selectedKey: string;
  onSelect: (key: string) => void;
}

function WeekRow({ week, events, ranges, statusById, monthPrefix, todayKey, selectedKey, onSelect }: WeekRowProps) {
  const segments = layoutWeek(week, ranges).filter((s) => s.lane < MAX_LANES);
  const laneCount = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);

  return (
    <div
      className="relative grid grid-cols-7 border-b border-plywood-400 last:border-b-0 [--lane-h:5px] [--lane-step:9px] md:[--lane-h:16px] md:[--lane-step:19px]"
      style={{ "--lanes": laneCount } as CSSProperties}
    >
      {week.map((key, col) => {
        const dayEvents = eventsOnDay(events, key);
        const dayRanges = rangesOnDay(ranges, key);
        return (
          <DayCell
            key={key}
            dayKey={key}
            lastColumn={col === week.length - 1}
            events={dayEvents}
            hasEnrollment={dayRanges.some((r) => r.kind === "enrollment")}
            hasRegistration={dayRanges.some((r) => r.kind === "registration")}
            statusById={statusById}
            inMonth={key.startsWith(monthPrefix)}
            isToday={key === todayKey}
            isPast={key < todayKey}
            selected={key === selectedKey}
            onSelect={onSelect}
          />
        );
      })}

      {laneCount > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-[5px] grid grid-cols-7 [grid-auto-rows:var(--lane-h)] [row-gap:calc(var(--lane-step)_-_var(--lane-h))]"
        >
          {segments.map((segment) => (
            <RangeBar key={segment.id} segment={segment} />
          ))}
        </div>
      )}
    </div>
  );
}

function RangeBar({ segment }: { segment: WeekSegment }) {
  const isEnrollment = segment.kind === "enrollment";
  const showLabel = !segment.continuesBefore || segment.startCol === 0;
  return (
    <div
      style={{ gridColumn: `${segment.startCol + 1} / span ${segment.span}`, gridRow: segment.lane + 1 }}
      className={cn(
        "flex min-w-0 items-center overflow-hidden",
        !segment.continuesBefore && "ml-1 rounded-l-full",
        !segment.continuesAfter && "mr-1 rounded-r-full",
        isEnrollment
          ? "bg-butter shadow-[inset_0_0_0_1px_rgba(12,22,32,0.28)]"
          : "dash-orange md:bg-none md:border-[1.5px] md:border-dashed md:border-orange md:bg-ivory",
        !isEnrollment && "h-[3px] self-center md:h-auto md:self-stretch",
        segment.muted && "opacity-40",
      )}
    >
      {showLabel && (
        <span
          className={cn(
            "hidden truncate px-2 text-[10.5px] font-semibold leading-none md:block",
            isEnrollment ? "text-midnight" : "text-brown",
          )}
        >
          {isEnrollment ? segment.label : `신청 · ${segment.label}`}
        </span>
      )}
    </div>
  );
}

interface DayCellProps {
  dayKey: string;
  lastColumn: boolean;
  events: ClubEvent[];
  hasEnrollment: boolean;
  hasRegistration: boolean;
  statusById: Map<string, EventDisplayStatus>;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  selected: boolean;
  onSelect: (key: string) => void;
}

function DayCell({
  dayKey,
  lastColumn,
  events,
  hasEnrollment,
  hasRegistration,
  statusById,
  inMonth,
  isToday,
  isPast,
  selected,
  onSelect,
}: DayCellProps) {
  const day = Number(dayKey.slice(8, 10));
  const isSunday = weekdayOfKey(dayKey) === 0;

  const summary = [
    formatKeyLongKo(dayKey),
    isToday && "오늘",
    events.length > 0 && `이벤트 ${events.length}개`,
    hasRegistration && "이벤트 신청기간",
    hasEnrollment && "멤버 등록기간",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={() => onSelect(dayKey)}
      aria-pressed={selected}
      aria-current={isToday ? "date" : undefined}
      aria-label={summary}
      className={cn(
        "relative flex min-h-[50px] min-w-0 flex-col items-center px-0.5 pt-1.5 text-midnight transition-colors md:min-h-[94px] md:items-stretch md:px-1.5",
        "pb-[calc(var(--lanes)*var(--lane-step)_+_8px)]",
        !lastColumn && "border-r border-plywood-400",
        selected ? "bg-butter-200/50" : "hover:bg-plywood-200/60",
        selected && "after:pointer-events-none after:absolute after:inset-0 after:z-10 after:ring-2 after:ring-inset after:ring-midnight",
      )}
    >
      <span
        className={cn(
          "grid size-7 place-items-center rounded-full font-display text-[17px] font-bold leading-none md:size-8 md:text-[19px]",
          isToday && "bg-butter text-midnight ring-[1.5px] ring-midnight",
          !isToday && isSunday && "text-brown",
          !isToday && isPast && "text-ink-soft/70",
          !inMonth && "opacity-35",
        )}
      >
        {day}
      </span>

      {/* Mobile: compact markers. */}
      {events.length > 0 && (
        <span className="mt-1 flex items-center gap-[3px] md:hidden" aria-hidden="true">
          {events.slice(0, 3).map((event) => {
            const status = statusById.get(event.id) ?? "OPEN";
            return (
              <span
                key={event.id}
                className={cn(
                  "size-[7px] rounded-[2px]",
                  status === "CANCELED"
                    ? "border border-plywood-600"
                    : isMuted(status)
                      ? "bg-plywood-600"
                      : "bg-midnight",
                  !inMonth && "opacity-40",
                )}
              />
            );
          })}
          {events.length > 3 && <span className="text-[9px] font-semibold leading-none text-ink-soft">+</span>}
        </span>
      )}

      {/* Desktop: short event names. */}
      {events.length > 0 && (
        <span className="mt-1 hidden min-w-0 flex-col gap-[3px] md:flex" aria-hidden="true">
          {events.slice(0, 2).map((event) => {
            const status = statusById.get(event.id) ?? "OPEN";
            const muted = isMuted(status);
            return (
              <span
                key={event.id}
                className={cn(
                  "truncate rounded-[3px] px-1.5 py-[3px] text-left text-[11px] font-medium leading-tight",
                  muted ? "bg-plywood-400/60 text-ink-soft" : "bg-midnight text-cream",
                  status === "CANCELED" && "bg-transparent line-through",
                  !inMonth && "opacity-50",
                )}
              >
                {event.shortTitle}
              </span>
            );
          })}
          {events.length > 2 && (
            <span className="px-1 text-left font-mono text-[10px] text-ink-soft">+{events.length - 2}</span>
          )}
        </span>
      )}
    </button>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 border-t-2 border-midnight bg-plywood-200/60 px-3 py-2.5 text-[12px] text-ink-soft">
      <li className="flex items-center gap-1.5">
        <span className="h-[7px] w-6 rounded-full bg-butter shadow-[inset_0_0_0_1px_rgba(12,22,32,0.28)]" />
        멤버 등록기간
      </li>
      <li className="flex items-center gap-1.5">
        <span className="dash-orange h-[3px] w-6" />
        이벤트 신청기간
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-[7px] rounded-[2px] bg-midnight" />
        이벤트 날
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-3.5 rounded-full bg-butter ring-[1.5px] ring-midnight" />
        오늘
      </li>
    </ul>
  );
}

interface DayPanelProps {
  dayKey: string;
  isToday: boolean;
  events: ClubEvent[];
  ranges: RangeItem[];
  eventsById: Map<string, ClubEvent>;
  enrollmentsById: Map<string, Enrollment>;
  statusById: Map<string, EventDisplayStatus>;
  todayKey: string;
}

/** Everything happening on the selected day, grouped by type so they can't be confused. */
function DayPanel({ dayKey, isToday, events, ranges, eventsById, enrollmentsById, statusById, todayKey }: DayPanelProps) {
  const registrations = ranges.filter((r) => r.kind === "registration");
  const enrollmentRanges = ranges.filter((r) => r.kind === "enrollment");
  const empty = events.length === 0 && registrations.length === 0 && enrollmentRanges.length === 0;

  return (
    <section aria-live="polite" aria-label="선택한 날짜의 일정" className="mt-5">
      <div className="flex items-baseline gap-2">
        <h3 className="font-display text-[26px] font-extrabold leading-none text-midnight">{formatKeyKo(dayKey)}</h3>
        {isToday && (
          <span className="rounded-[4px] bg-midnight px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] text-butter">
            TODAY
          </span>
        )}
      </div>

      {empty && <p className="mt-3 text-[15px] text-ink-soft">이날은 예정된 일정이 없어요.</p>}

      {events.length > 0 && (
        <PanelGroup title="이벤트" swatch={<span className="size-[9px] rounded-[2px] bg-midnight" />}>
          {events.map((event) => {
            const status = statusById.get(event.id) ?? "OPEN";
            return (
              <li key={event.id}>
                <Link
                  href={eventHref(event)}
                  className={cn(
                    "group flex items-center gap-3 rounded-md border bg-ivory px-3 py-3",
                    isMuted(status) ? "border-midnight/10 opacity-70" : "border-midnight/25 hover:border-midnight",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={status} />
                      <span className="font-mono text-[12px] text-ink-soft">{eventTimeLabel(event)}</span>
                    </div>
                    <p
                      className={cn(
                        "mt-1.5 text-[16px] font-bold leading-snug text-midnight",
                        status === "CANCELED" && "line-through decoration-brown/60",
                      )}
                    >
                      {event.title}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-midnight transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </PanelGroup>
      )}

      {registrations.length > 0 && (
        <PanelGroup title="이벤트 신청기간" swatch={<span className="dash-orange h-[3px] w-5" />}>
          {registrations.map((range) => {
            const event = eventsById.get(range.refId);
            if (!event) return null;
            const status = statusById.get(event.id) ?? "OPEN";
            return (
              <li key={range.id}>
                <Link
                  href={eventHref(event)}
                  className={cn(
                    "group flex items-center gap-3 rounded-md border border-dashed border-orange bg-ivory px-3 py-3",
                    range.muted && "opacity-60",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={status} />
                      {event.registrationClose !== null && status === "OPEN" && (
                        <span className="text-[12px] font-medium text-brown">
                          {formatCloseAt(event.registrationClose)} 마감
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[15px] font-bold leading-snug text-midnight">{event.title} 신청</p>
                    <p className="mt-0.5 font-mono text-[12px] text-ink-soft">{registrationWindowLabel(event)}</p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-midnight transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </PanelGroup>
      )}

      {enrollmentRanges.length > 0 && (
        <PanelGroup
          title="멤버 등록기간"
          swatch={<span className="h-[7px] w-5 rounded-full bg-butter shadow-[inset_0_0_0_1px_rgba(12,22,32,0.28)]" />}
        >
          {enrollmentRanges.map((range) => {
            const enrollment = enrollmentsById.get(range.refId);
            if (!enrollment) return null;
            const status = getEnrollmentStatus(enrollment, todayKey);
            return (
              <li
                key={range.id}
                className={cn(
                  "rounded-md border border-midnight/25 bg-ivory px-3 py-3",
                  range.muted && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={status} kind="enrollment" withKo />
                  <span className="font-mono text-[12px] text-ink-soft">
                    {formatKeyKo(enrollment.startDate)} – {formatKeyKo(enrollment.endDate)}
                  </span>
                </div>
                <p className="mt-1.5 text-[15px] font-bold leading-snug text-midnight">{enrollment.title}</p>
                {enrollment.description && (
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{enrollment.description}</p>
                )}
                {status === "OPEN" && enrollment.applicationUrl && (
                  <a
                    href={enrollment.applicationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-flex h-10 items-center gap-1.5 rounded-[6px] border-2 border-midnight bg-butter px-4 font-label text-[12px] font-semibold uppercase tracking-[0.16em] text-midnight"
                  >
                    등록하기
                    <ArrowUpRight />
                    <span className="sr-only">(새 창)</span>
                  </a>
                )}
              </li>
            );
          })}
        </PanelGroup>
      )}
    </section>
  );
}

function PanelGroup({ title, swatch, children }: { title: string; swatch: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="flex items-center gap-2 font-label text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {swatch}
        {title}
      </h4>
      <ul className="mt-2 flex flex-col gap-2">{children}</ul>
    </div>
  );
}
