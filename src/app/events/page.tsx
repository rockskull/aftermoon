import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EventCard } from "@/components/event-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, DataNotice, SectionTitle } from "@/components/ui";
import { getClubData, requestNow } from "@/lib/club-data";
import { getEventStatus, splitUpcoming } from "@/lib/status";

export const metadata: Metadata = {
  title: "Events",
  description: "AFTER CL TO MOON에서 열리는 클럽 이벤트와 신청 상태를 확인하세요.",
};

const PAST_LIMIT = 12;

export default function EventsPage() {
  return (
    <>
      <SiteHeader current="events" />
      <main className="paper flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
          <SectionTitle eyebrow="Events" title="Upcoming events" sub="예정된 클럽 활동과 신청 상태예요." />
          <Suspense fallback={<ListSkeleton />}>
            <EventLists />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function EventLists() {
  const now = await requestNow();
  const data = await getClubData();
  const { upcoming, past } = splitUpcoming(data.events, now);

  return (
    <>
      <div className="mt-5 empty:hidden">
        <DataNotice source={data.source} />
      </div>

      {upcoming.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {upcoming.map((event) => (
            <li key={event.id}>
              <EventCard event={event} status={getEventStatus(event, now)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-midnight/30 px-4 py-8 text-center">
          <p className="text-[15px] text-ink-soft">아직 예정된 이벤트가 없어요.</p>
          <Link
            href="/host"
            className="mt-3 inline-flex h-11 items-center gap-2 font-label text-[12px] font-semibold uppercase tracking-[0.2em] text-midnight underline decoration-butter decoration-2 underline-offset-[6px]"
          >
            Propose an event
            <ArrowRight />
          </Link>
        </div>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-title" className="mt-14">
          <h2 id="past-title" className="font-display text-[30px] font-extrabold uppercase leading-none text-ink-soft">
            Past events
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {past.slice(0, PAST_LIMIT).map((event) => (
              <li key={event.id}>
                <EventCard event={event} status={getEventStatus(event, now)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="이벤트를 불러오는 중">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[180px] animate-pulse rounded-lg bg-ivory/60" />
      ))}
    </div>
  );
}
