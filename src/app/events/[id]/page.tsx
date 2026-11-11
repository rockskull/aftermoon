import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DateStamp } from "@/components/event-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowUpRight, buttonDisabled, buttonPrimary, cn, StatusBadge } from "@/components/ui";
import { getClubData, requestNow } from "@/lib/club-data";
import { formatLongDateKo } from "@/lib/dates";
import {
  eventDurationLabel,
  eventTimeLabel,
  formatOpenAt,
  registrationWindowLabel,
} from "@/lib/event-format";
import { getEventStatus, isMuted } from "@/lib/status";
import type { ClubEvent, EventDisplayStatus } from "@/lib/types";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function findEvent(params: PageProps<"/events/[id]">["params"]) {
  const { id } = await params;
  await requestNow();
  const data = await getClubData();
  const decoded = safeDecode(id);
  return data.events.find((event) => event.id === id || event.id === decoded) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const event = await findEvent(params);
  if (!event) return { title: "Event not found" };
  const description = event.description.replace(/\s+/g, " ").slice(0, 140) || undefined;
  return {
    title: event.title,
    description,
    openGraph: { title: event.title, description },
  };
}

export default function EventPage({ params }: PageProps<"/events/[id]">) {
  return (
    <>
      <SiteHeader current="events" />
      <main className="paper flex-1">
        <Suspense fallback={<DetailSkeleton />}>
          <EventDetail params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function EventDetail({ params }: { params: PageProps<"/events/[id]">["params"] }) {
  const event = await findEvent(params);
  if (!event) notFound();
  const status = getEventStatus(event, await requestNow());
  const muted = isMuted(status);
  const duration = eventDurationLabel(event);

  return (
    <article className="mx-auto max-w-3xl px-4 pb-32 pt-6 md:px-6 md:pb-16 md:pt-10">
      <Link
        href="/#calendar"
        className="inline-flex h-10 items-center gap-1.5 font-label text-[12px] font-semibold uppercase tracking-[0.2em] text-ink-soft hover:text-midnight"
      >
        <span aria-hidden="true">←</span> Calendar
      </Link>

      <header className="mt-3 flex gap-4">
        <DateStamp ms={event.start} muted={muted} className="w-[66px]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} withKo />
            {event.category && (
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">{event.category}</span>
            )}
          </div>
          <h1
            className={cn(
              "mt-2 text-[26px] font-extrabold leading-tight text-midnight md:text-[34px]",
              status === "CANCELED" && "line-through decoration-brown/60",
            )}
          >
            {event.title}
          </h1>
        </div>
      </header>

      <div className="mt-6 rounded-lg border-2 border-midnight bg-ivory shadow-[4px_4px_0_0_var(--color-midnight)]">
        <dl className="divide-y divide-plywood-400 text-[15px]">
          <InfoRow label="일시">
            <p className="font-medium">{formatLongDateKo(event.start)}</p>
            <p className="font-mono text-[14px] text-ink-soft">
              {eventTimeLabel(event)}
              {duration && ` · ${duration}`}
            </p>
          </InfoRow>
          {event.location && <InfoRow label="장소">{event.location}</InfoRow>}
          {event.host && <InfoRow label="진행자">{event.host}</InfoRow>}
          {event.audience && <InfoRow label="참가 대상">{event.audience}</InfoRow>}
          {event.capacity && (
            <InfoRow label="정원">
              <span className="font-mono">{event.capacity}명</span>
            </InfoRow>
          )}
          {event.fee && <InfoRow label="참가비">{event.fee}</InfoRow>}
          <InfoRow label="신청 기간">
            <span className="font-mono text-[14px]">{registrationWindowLabel(event)}</span>
          </InfoRow>
        </dl>
      </div>

      {event.description && (
        <section className="mt-8" aria-labelledby="about-title">
          <h2 id="about-title" className="font-label text-[12px] font-semibold uppercase tracking-[0.24em] text-brown">
            About
          </h2>
          <p className="mt-2 whitespace-pre-line text-[16px] leading-[1.75] text-midnight">{event.description}</p>
        </section>
      )}

      {event.notes && (
        <section className="mt-8" aria-labelledby="notes-title">
          <h2 id="notes-title" className="font-label text-[12px] font-semibold uppercase tracking-[0.24em] text-brown">
            준비물 및 안내
          </h2>
          <p className="mt-2 whitespace-pre-line rounded-md border border-dashed border-midnight/30 bg-ivory/60 px-4 py-3 text-[15px] leading-[1.7] text-midnight">
            {event.notes}
          </p>
        </section>
      )}

      <p className="mt-8 rounded-md border border-dashed border-midnight/30 px-4 py-3 text-[14px] leading-relaxed text-ink-soft">
        회원이 아니라면 아지트에 오기 전에{" "}
        <Link href="/consent" className="font-semibold text-midnight underline underline-offset-4">
          일일 이용 동의서
        </Link>
        를 작성해 주세요.
      </p>

      <RegistrationAction event={event} status={status} />
    </article>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 px-4 py-3 md:grid-cols-[110px_minmax(0,1fr)]">
      <dt className="pt-px text-[13px] font-medium text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-midnight">{children}</dd>
    </div>
  );
}

function registrationMessage(event: ClubEvent, status: EventDisplayStatus): { button: string; note: string } {
  switch (status) {
    case "OPEN":
      return event.registrationUrl
        ? { button: "Join", note: "신청 폼이 새 창으로 열려요." }
        : { button: "신청 링크 준비 중", note: "곧 신청 링크가 열릴 예정이에요." };
    case "COMING_SOON":
      return {
        button: event.registrationOpen ? `${formatOpenAt(event.registrationOpen)} 오픈` : "신청 오픈 전",
        note: "신청이 열리면 이 버튼으로 신청할 수 있어요.",
      };
    case "CLOSED":
      return { button: "신청 마감", note: "신청이 마감되었어요." };
    case "FINISHED":
      return { button: "종료된 이벤트", note: "이미 끝난 이벤트예요." };
    case "CANCELED":
      return { button: "취소된 이벤트", note: "이 이벤트는 취소되었어요." };
  }
}

/** Sticky on mobile so the registration button is always within reach. */
function RegistrationAction({ event, status }: { event: ClubEvent; status: EventDisplayStatus }) {
  const { button, note } = registrationMessage(event, status);
  const canJoin = status === "OPEN" && event.registrationUrl !== null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-midnight bg-ivory/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:mt-10 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
      <div className="mx-auto flex max-w-3xl items-center gap-3 md:flex-col md:items-start">
        {canJoin ? (
          <a
            href={event.registrationUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonPrimary, "flex-1 md:w-72 md:flex-none")}
          >
            {button}
            <ArrowUpRight />
            <span className="sr-only">(새 창에서 신청 폼 열기)</span>
          </a>
        ) : (
          <span aria-disabled="true" className={cn(buttonDisabled, "flex-1 normal-case tracking-[0.04em] md:w-72 md:flex-none")}>
            {button}
          </span>
        )}
        <p className="hidden text-[13px] text-ink-soft md:block">{note}</p>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 md:px-6 md:pt-10" aria-busy="true" aria-label="이벤트를 불러오는 중">
      <div className="h-10 w-28 animate-pulse rounded bg-ivory/60" />
      <div className="mt-3 flex gap-4">
        <div className="h-[84px] w-[66px] animate-pulse rounded-md bg-ivory/60" />
        <div className="h-[84px] flex-1 animate-pulse rounded-md bg-ivory/60" />
      </div>
      <div className="mt-6 h-[260px] animate-pulse rounded-lg bg-ivory/60" />
    </div>
  );
}
