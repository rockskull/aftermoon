import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, cn, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { formatDateTimeKo, parseMoment } from "@/lib/dates";
import { isOperator, requireViewer } from "@/server/auth/viewer";
import { prefsFor } from "@/server/domain/model";
import { storeMode } from "@/server/store";
import { markAllRead } from "../me/actions";
import { PushSettings } from "./push-settings";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <>
      <SiteHeader current="notifications" />
      <main className="paper flex-1">
        <div className="mx-auto max-w-2xl px-4 py-8 md:py-12">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Notifications</p>
          <h1 className="mt-1.5 font-display text-[44px] font-extrabold uppercase leading-[0.9] text-midnight">Club news</h1>
          <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-lg bg-ivory/60" />}>
            <NotificationsContent />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function NotificationsContent() {
  if (storeMode() === "unconfigured") return <div className="mt-6"><NotReady /></div>;
  const now = await requestNow();
  const { member, club } = await requireViewer("/notifications");
  if (!member) {
    return (
      <p className="mt-6 rounded-md border border-dashed border-midnight/40 bg-ivory/70 px-4 py-4 text-[15px] text-ink-soft">
        회원권을 신청하면 알림을 받을 수 있어요.{" "}
        <Link href="/me" className="font-semibold text-midnight underline underline-offset-4">
          회원권 신청하기
        </Link>
      </p>
    );
  }

  const mine = club.notifications
    .filter((n) => n.memberId === member.id && ["sent", "inapp"].includes(n.status))
    .filter((n) => (parseMoment(n.scheduledAt)?.ms ?? 0) <= now)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    .slice(0, 50);
  const unread = mine.filter((n) => !n.readAt).length;

  return (
    <div className="mt-6 flex flex-col gap-8">
      <section aria-labelledby="list-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="list-title" className="text-[17px] font-extrabold text-midnight">
            알림 목록 {unread > 0 && <span className="ml-1 rounded bg-butter px-1.5 py-0.5 font-mono text-[12px]">{unread}</span>}
          </h2>
          {unread > 0 && (
            <form action={markAllRead}>
              <button type="submit" className="h-10 font-label text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft underline underline-offset-4">
                Mark all read
              </button>
            </form>
          )}
        </div>
        {mine.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-midnight/30 px-4 py-6 text-center text-[15px] text-ink-soft">
            아직 받은 알림이 없어요.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {mine.map((n) => {
              const at = parseMoment(n.scheduledAt);
              const body = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[15px] font-bold text-midnight">
                      {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-orange" aria-label="읽지 않음" />}
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 text-[14px] leading-relaxed text-ink-soft">{n.body}</p>}
                    {at && <p className="mt-1 font-mono text-[11px] text-ink-soft">{formatDateTimeKo(at.ms)}</p>}
                  </div>
                  {n.url && <ArrowRight className="size-4 shrink-0 text-midnight" />}
                </>
              );
              const cls = cn("flex items-center gap-3 rounded-md border bg-ivory px-3.5 py-3", n.readAt ? "border-midnight/10" : "border-midnight/35");
              return (
                <li key={n.id}>
                  {n.url && n.url.startsWith("/") ? (
                    <Link href={n.url} className={cn(cls, "hover:border-midnight")}>
                      {body}
                    </Link>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PushSettings
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        prefs={prefsFor(club.prefRows, member.id)}
        isOperator={isOperator(member)}
      />
    </div>
  );
}
