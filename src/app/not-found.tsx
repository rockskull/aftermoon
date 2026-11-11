import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, buttonPrimary } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="paper flex-1">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
          <p className="font-mono text-[13px] font-semibold tracking-[0.2em] text-brown">404</p>
          <h1 className="mt-2 font-display text-[48px] font-extrabold uppercase leading-[0.9] text-midnight">
            Lost in the dark
          </h1>
          <p className="mt-4 text-[15px] text-ink-soft">찾는 페이지가 없거나, 비공개로 바뀐 일정이에요.</p>
          <Link href="/#calendar" className={`${buttonPrimary} mt-8`}>
            Back to calendar
            <ArrowRight />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
