import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { AdminToasts } from "./admin-ui";

export type AdminTab = "overview" | "payments" | "members" | "bank" | "proposals";

const TABS: Array<{ key: AdminTab; href: string; label: string }> = [
  { key: "overview", href: "/admin", label: "현황" },
  { key: "payments", href: "/admin/payments", label: "입금 확인" },
  { key: "members", href: "/admin/members", label: "회원" },
  { key: "bank", href: "/admin/bank", label: "거래내역" },
  { key: "proposals", href: "/admin/proposals", label: "제안·이벤트" },
];

export function AdminFrame({ tab, title, children }: { tab: AdminTab; title: string; children: ReactNode }) {
  return (
    <AdminToasts>
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Admin</p>
      <h1 className="mt-1 font-display text-[40px] font-extrabold uppercase leading-[0.9] text-midnight md:text-[48px]">{title}</h1>
      <nav aria-label="관리 메뉴" className="-mx-4 mt-5 overflow-x-auto px-4">
        <ul className="flex min-w-max gap-1 border-b-2 border-midnight">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "-mb-[2px] flex h-11 items-center rounded-t-md border-2 border-b-0 px-3.5 text-[14px] font-bold",
                  t.key === tab ? "border-midnight bg-ivory text-midnight" : "border-transparent text-ink-soft hover:text-midnight",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-6">{children}</div>
    </div>
    </AdminToasts>
  );
}

export function Box({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border-2 border-midnight bg-ivory p-4 md:p-5", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-[17px] font-extrabold text-midnight">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const smallInput =
  "h-10 rounded-md border-2 border-midnight/25 bg-white/60 px-2.5 text-[15px] text-midnight focus:border-midnight focus:outline-none";
export const smallButton =
  "inline-flex h-10 items-center justify-center rounded-md border-2 border-midnight px-3.5 text-[13px] font-bold text-midnight hover:bg-midnight hover:text-cream disabled:opacity-50";
export const smallPrimary =
  "inline-flex h-10 items-center justify-center rounded-md border-2 border-midnight bg-butter px-3.5 text-[13px] font-bold text-midnight shadow-[2px_2px_0_0_var(--color-midnight)] disabled:opacity-50";

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "warn" | "ok" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-[4px] border px-1.5 font-mono text-[11px] font-semibold uppercase",
        tone === "ok" && "border-midnight bg-butter text-midnight",
        tone === "warn" && "border-brown text-brown",
        tone === "muted" && "border-plywood-600 text-ink-soft",
        tone === "default" && "border-midnight/40 text-midnight",
      )}
    >
      {children}
    </span>
  );
}

export function AdminSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6" aria-busy="true" aria-label="불러오는 중">
      <div className="h-12 w-56 animate-pulse rounded bg-ivory/60" />
      <div className="mt-6 h-11 animate-pulse rounded bg-ivory/60" />
      <div className="mt-6 h-64 animate-pulse rounded-lg bg-ivory/60" />
    </div>
  );
}
