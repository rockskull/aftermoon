import Link from "next/link";
import { Suspense } from "react";
import { ClubCalendar } from "@/components/calendar/club-calendar";
import { EventCard } from "@/components/event-card";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, buttonPrimaryOnDark, DataNotice, Logo, SectionTitle } from "@/components/ui";
import { MembershipCard, summarizeMembership } from "@/components/membership-card";
import { getClubData, requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import { getEventStatus, splitUpcoming } from "@/lib/status";
import { readSession } from "@/server/auth/session";
import { getViewer } from "@/server/auth/viewer";
import { storeMode } from "@/server/store";

const UPCOMING_LIMIT = 4;

export default function HomePage() {
  return (
    <>
      <SiteHeader current="calendar" showLogo={false} />
      <main className="flex-1">
        <BrandHeader />
        <Suspense fallback={null}>
          <HomeMembership />
        </Suspense>
        <section id="calendar" aria-labelledby="calendar-title" className="paper scroll-mt-2">
          <Suspense fallback={<BoardSkeleton />}>
            <ClubBoard />
          </Suspense>
        </section>
        <ProposeInvite />
      </main>
      <SiteFooter />
    </>
  );
}

/** ① Brand header: the official logo and a one-line introduction. */
function BrandHeader() {
  return (
    // Plain midnight (no grain) so the logo file's own background blends in seamlessly.
    <section className="bg-midnight text-cream">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-8 pt-6 text-center md:pb-10 md:pt-10">
        <h1 className="w-full max-w-[300px] sm:max-w-[400px] md:max-w-[460px]">
          <Logo
            className="logo-blend h-auto w-full"
            sizes="(min-width: 768px) 460px, (min-width: 640px) 400px, 300px"
            preload
          />
        </h1>
        <p className="mt-6 text-balance font-label text-[12px] font-medium uppercase tracking-[0.3em] text-cream sm:text-[13px]">
          A living room with a climbing wall.
        </p>
        <p className="mt-2 max-w-[22rem] text-[14px] leading-relaxed text-cream/70 sm:max-w-none">
          퇴근 후 클라이밍, 음악, 휴식, 대화가 공존하는 비영리 사설 볼더링 클럽
        </p>
        <Link
          href="/consent"
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-butter/60 px-4 text-[13px] font-semibold text-butter hover:border-butter"
        >
          처음 방문이라면 · 일일 이용 동의서
          <ArrowRight />
        </Link>
      </div>
    </section>
  );
}

/** Current membership and days left, for signed-in members; a sign-in hint otherwise. */
async function HomeMembership() {
  if (storeMode() === "unconfigured") return null;
  const session = await readSession();
  if (!session) {
    return (
      <div className="bg-midnight px-4 pb-8 text-cream">
        <Link
          href="/login?returnTo=/"
          className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-lg border border-cream/25 px-4 py-3 text-[14px] hover:border-cream/60"
        >
          <span>
            <span className="block font-label text-[11px] font-medium uppercase tracking-[0.28em] text-butter">Members</span>
            로그인하고 내 회원권과 남은 이용일을 확인하세요
          </span>
          <ArrowRight className="size-4 shrink-0" />
        </Link>
      </div>
    );
  }
  const now = await requestNow();
  const viewer = await getViewer();
  if (!viewer) return null;
  const summary = summarizeMembership({
    memberId: viewer.member?.id ?? null,
    memberships: viewer.club.memberships,
    payments: viewer.club.payments,
    plans: viewer.club.plans,
    todayKey: toDateKey(now),
  });
  return (
    <div className="bg-midnight px-4 pb-10">
      <Link href="/me" className="mx-auto block max-w-xl rounded-xl outline-offset-4" aria-label="내 회원권 자세히 보기">
        <div className="[&>section]:shadow-[4px_4px_0_0_var(--color-butter)] [&>section]:ring-1 [&>section]:ring-cream/20">
          <MembershipCard member={viewer.member} summary={summary} compact />
        </div>
      </Link>
    </div>
  );
}

/** ② Monthly calendar + ③ upcoming events. Rendered per request: statuses depend on the current time. */
async function ClubBoard() {
  const now = await requestNow();
  const data = await getClubData();
  const upcoming = splitUpcoming(data.events, now).upcoming.slice(0, UPCOMING_LIMIT);

  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-10 md:px-6 md:py-14 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
      <div className="min-w-0">
        <SectionTitle
          id="calendar-title"
          eyebrow="Calendar"
          title="Club calendar"
          sub="날짜를 누르면 그날의 일정과 신청기간을 볼 수 있어요."
        />
        <div className="mt-5 empty:hidden">
          <DataNotice source={data.source} />
        </div>
        <div className="mt-5">
          <ClubCalendar events={data.events} enrollments={data.enrollments} now={now} />
        </div>
      </div>

      <aside aria-labelledby="upcoming-title" className="min-w-0">
        <SectionTitle id="upcoming-title" eyebrow="Events" title="Upcoming events" sub="곧 열리는 클럽 활동이에요." />
        {upcoming.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-3">
            {upcoming.map((event) => (
              <li key={event.id}>
                <EventCard event={event} status={getEventStatus(event, now)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-5 rounded-lg border border-dashed border-midnight/30 px-4 py-6 text-center text-[15px] text-ink-soft">
            아직 예정된 이벤트가 없어요.
            <br />
            해보고 싶은 게 있다면 직접 제안해 주세요!
          </p>
        )}
        <Link
          href="/events"
          className="mt-4 inline-flex h-11 items-center gap-2 font-label text-[12px] font-semibold uppercase tracking-[0.2em] text-midnight underline decoration-butter decoration-2 underline-offset-[6px]"
        >
          All events
          <ArrowRight />
        </Link>
      </aside>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div
      className="mx-auto grid max-w-6xl gap-12 px-4 py-10 md:px-6 md:py-14 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10"
      aria-busy="true"
      aria-label="일정을 불러오는 중"
    >
      <div>
        <SectionTitle eyebrow="Calendar" title="Club calendar" sub="일정을 불러오는 중이에요…" />
        <div className="mt-5 h-[420px] animate-pulse rounded-lg border-2 border-midnight/30 bg-ivory/60 md:h-[640px]" />
      </div>
      <div>
        <SectionTitle eyebrow="Events" title="Upcoming events" />
        <div className="mt-5 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[168px] animate-pulse rounded-lg bg-ivory/60" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** ④ HAVE SOMETHING IN MIND? */
function ProposeInvite() {
  return (
    <section aria-labelledby="propose-title" className="night text-cream">
      <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
        <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-butter">Host an event</p>
        <h2
          id="propose-title"
          className="mt-2 font-display text-[46px] font-extrabold uppercase leading-[0.88] md:text-[72px]"
        >
          Have something
          <br />
          in mind?
        </h2>
        <p className="mt-5 text-[22px] font-bold md:text-[26px]">하고 싶었던 걸 해보자!</p>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-cream/75">
          클라이밍 세션, 음악 감상회, 영화 보기, 취향 교환, 작은 워크숍까지. 클럽에서 같이 해보고 싶은 게 있다면
          무엇이든 제안해 주세요. 운영진이 검토하고 함께 방법을 찾아볼게요.
        </p>
        <Link href="/host" className={`${buttonPrimaryOnDark} mt-8 w-full sm:w-auto`}>
          Propose an event
          <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
