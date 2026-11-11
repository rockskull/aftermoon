import Link from "next/link";
import { Suspense } from "react";
import { readSession } from "@/server/auth/session";
import { cn, Logo } from "./ui";

export type NavKey = "calendar" | "events" | "host" | "me" | "notifications" | "admin";

const NAV: Array<{ key: NavKey; href: string; label: string }> = [
  { key: "calendar", href: "/#calendar", label: "Calendar" },
  { key: "events", href: "/events", label: "Events" },
  { key: "host", href: "/host", label: "Host an event" },
];

/**
 * Top bar. On the home page the large brand header shows the logo,
 * so the bar renders without it (showLogo={false}).
 * The account corner reads the session cookie, so it streams in on its own.
 */
export function SiteHeader({ current, showLogo = true }: { current?: NavKey; showLogo?: boolean }) {
  return (
    <header className="bg-midnight text-cream">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center md:flex-nowrap md:gap-4 md:px-6">
        <div className={cn("flex min-h-14 flex-1 items-center px-4 md:order-none md:flex-none md:px-0", !showLogo && "md:hidden")}>
          {showLogo && (
            <Link href="/" className="py-2" aria-label="AFTER CL TO MOON 홈">
              <Logo className="logo-blend h-11 w-auto md:h-14" sizes="112px" />
            </Link>
          )}
        </div>
        <div className="flex min-h-14 items-center gap-1 pr-2 md:order-last md:pr-0">
          <Suspense fallback={<span className="block h-11 w-20" aria-hidden="true" />}>
            <AccountCorner current={current} />
          </Suspense>
        </div>
        <nav aria-label="주요 메뉴" className="w-full border-t border-cream/15 md:ml-auto md:w-auto md:border-t-0">
          <ul className="grid grid-cols-[1fr_0.85fr_1.3fr] md:flex md:gap-1">
            {NAV.map((item) => {
              const active = item.key === current;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-12 items-center justify-center whitespace-nowrap px-1 font-label text-[11px] font-medium uppercase tracking-[0.14em] sm:text-xs md:px-3 md:tracking-[0.2em]",
                      active ? "text-butter" : "text-cream/75 hover:text-cream",
                    )}
                  >
                    <span className={cn("border-b-2 pb-0.5", active ? "border-butter" : "border-transparent")}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

const cornerLink =
  "flex h-11 items-center gap-1.5 rounded-md px-2.5 font-label text-[11px] font-semibold uppercase tracking-[0.16em] sm:text-xs";

async function AccountCorner({ current }: { current?: NavKey }) {
  const session = await readSession();
  if (!session) {
    return (
      <Link href="/login" className={cn(cornerLink, "text-cream/80 hover:text-cream")}>
        Login
      </Link>
    );
  }
  const operator = session.roleHint === "operator" || session.roleHint === "admin";
  return (
    <>
      {operator && (
        <Link
          href="/admin"
          aria-current={current === "admin" ? "page" : undefined}
          className={cn(cornerLink, current === "admin" ? "text-butter" : "text-cream/70 hover:text-cream")}
        >
          Admin
        </Link>
      )}
      <Link
        href="/notifications"
        aria-label="알림"
        aria-current={current === "notifications" ? "page" : undefined}
        className={cn("grid size-11 place-items-center rounded-md", current === "notifications" ? "text-butter" : "text-cream/80 hover:text-cream")}
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
          <path
            d="M10 2.75c-2.6 0-4.5 2-4.5 4.6v2.4L4 12.75v1h12v-1l-1.5-3V7.35c0-2.6-1.9-4.6-4.5-4.6ZM8 15.5a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <Link
        href="/me"
        aria-current={current === "me" ? "page" : undefined}
        className={cn(
          cornerLink,
          "border",
          current === "me" ? "border-butter text-butter" : "border-cream/30 text-cream hover:border-cream",
        )}
      >
        My
      </Link>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="night mt-auto text-cream/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-10 md:flex-row md:items-end md:justify-between md:px-6">
        <div>
          <p className="font-label text-xs font-medium uppercase tracking-[0.32em] text-cream">After CL to Moon</p>
          <p className="mt-1 font-label text-[11px] uppercase tracking-[0.32em]">Private Bouldering Club</p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            A living room with a climbing wall.
            <br />
            퇴근 후 클라이밍, 음악, 휴식, 대화가 공존하는 비영리 사설 볼더링 클럽.
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 font-label text-[11px] uppercase tracking-[0.2em]">
          {NAV.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="hover:text-cream">
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/me" className="hover:text-cream">
              My membership
            </Link>
          </li>
          <li>
            <Link href="/consent" className="hover:text-cream">
              Consent forms
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
