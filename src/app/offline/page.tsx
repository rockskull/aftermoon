import type { Metadata } from "next";
import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

/** Served by the service worker when there is no connection. Fully static. */
export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-midnight px-6 py-16 text-center text-cream">
      <Logo className="logo-blend h-auto w-full max-w-[260px]" sizes="260px" />
      <h1 className="mt-10 font-display text-[40px] font-extrabold uppercase leading-none">You&rsquo;re offline</h1>
      <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-cream/75">
        인터넷 연결이 끊겼어요. 회원권과 일정은 항상 최신 정보로 보여드려야 해서, 연결되면 다시 불러올게요.
      </p>
      {/* A full page load on purpose: it retries the network through the service worker. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="mt-8 inline-flex h-12 items-center rounded-[6px] border-2 border-butter bg-butter px-6 font-label text-[13px] font-semibold uppercase tracking-[0.16em] text-midnight"
      >
        Try again
      </a>
    </main>
  );
}
