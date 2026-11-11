import Link from "next/link";
import { MONTH_EN, WEEKDAY_EN, seoulParts } from "@/lib/dates";
import { eventHref, eventTimeLabel } from "@/lib/event-format";
import { isMuted } from "@/lib/status";
import type { ClubEvent, EventDisplayStatus } from "@/lib/types";
import { ArrowUpRight, buttonPrimary, buttonSecondary, cn, StatusBadge } from "./ui";

export function DateStamp({ ms, muted, className }: { ms: number; muted?: boolean; className?: string }) {
  const p = seoulParts(ms);
  return (
    <div
      className={cn(
        "flex w-[58px] shrink-0 flex-col items-center rounded-md pb-2 pt-1.5 text-center",
        muted ? "bg-plywood-400/70 text-ink-soft" : "night text-cream",
        className,
      )}
    >
      <span className="font-mono text-[10px] font-medium tracking-[0.14em]">{MONTH_EN[p.month - 1].slice(0, 3)}</span>
      <span className="font-display text-[32px] font-extrabold leading-[0.95]">{p.day}</span>
      <span className={cn("font-mono text-[10px] font-medium tracking-[0.14em]", !muted && "text-butter")}>
        {WEEKDAY_EN[p.weekday]}
      </span>
    </div>
  );
}

export function EventMeta({ event, className }: { event: ClubEvent; className?: string }) {
  if (!event.capacity && !event.fee) return null;
  return (
    <dl className={cn("flex flex-wrap gap-x-4 gap-y-1 text-[13px]", className)}>
      {event.capacity && (
        <div className="flex gap-1.5">
          <dt className="text-ink-soft">정원</dt>
          <dd className="font-mono font-medium text-midnight">{event.capacity}명</dd>
        </div>
      )}
      {event.fee && (
        <div className="flex gap-1.5">
          <dt className="text-ink-soft">참가비</dt>
          <dd className="font-medium text-midnight">{event.fee}</dd>
        </div>
      )}
    </dl>
  );
}

/** Upcoming-event card: date, title, short intro, capacity, fee, status, VIEW EVENT / JOIN. */
export function EventCard({ event, status }: { event: ClubEvent; status: EventDisplayStatus }) {
  const muted = isMuted(status);
  const canJoin = status === "OPEN" && event.registrationUrl !== null;

  return (
    <article
      className={cn(
        "relative flex gap-3.5 rounded-lg border p-3.5 sm:gap-4 sm:p-4",
        muted ? "border-midnight/10 bg-ivory/55" : "border-midnight/20 bg-ivory shadow-[0_2px_0_0_rgba(12,22,32,0.08)]",
      )}
    >
      <DateStamp ms={event.start} muted={muted} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge status={status} />
          <span className="font-mono text-[12px] text-ink-soft">{eventTimeLabel(event)}</span>
        </div>
        <h3
          className={cn(
            "mt-2 text-[17px] font-bold leading-snug",
            muted ? "text-ink-soft" : "text-midnight",
            status === "CANCELED" && "line-through decoration-brown/60",
          )}
        >
          <Link href={eventHref(event)} className="after:absolute after:inset-0 after:rounded-lg">
            {event.title}
          </Link>
        </h3>
        {event.description && (
          <p className={cn("mt-1 line-clamp-2 text-[14px] leading-relaxed", muted ? "text-ink-soft/80" : "text-ink-soft")}>
            {event.description}
          </p>
        )}
        <EventMeta event={event} className="mt-2.5" />
        <div className="relative z-10 mt-3.5 flex gap-2">
          <Link href={eventHref(event)} className={cn(buttonSecondary, "h-10 flex-1 px-3 text-[12px]")}>
            View event
          </Link>
          {canJoin && (
            <a
              href={event.registrationUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonPrimary, "h-10 flex-1 px-3 text-[12px]")}
            >
              Join
              <ArrowUpRight />
              <span className="sr-only">(새 창에서 신청 폼 열기)</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
