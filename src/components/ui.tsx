import Image from "next/image";
import logo from "@/assets/brand/logo.jpg";
import type { ClubDataSource, EnrollmentDisplayStatus, EventDisplayStatus } from "@/lib/types";
import { ENROLLMENT_STATUS_LABEL, EVENT_STATUS_LABEL } from "@/lib/status";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex h-12 items-center justify-center gap-2 rounded-[6px] border-2 px-5 font-label text-[13px] font-semibold uppercase tracking-[0.16em] whitespace-nowrap transition-[transform,box-shadow,background-color,color] duration-150";

/** Butter-yellow action (JOIN, SEND MY IDEA, PROPOSE AN EVENT). */
export const buttonPrimary = cn(
  buttonBase,
  "border-midnight bg-butter text-midnight shadow-[3px_3px_0_0_var(--color-midnight)] hover:bg-butter-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-midnight)]",
);

/** Butter-yellow action on the midnight background. */
export const buttonPrimaryOnDark = cn(
  buttonBase,
  "border-butter bg-butter text-midnight hover:bg-butter-200 hover:border-butter-200",
);

export const buttonSecondary = cn(
  buttonBase,
  "border-midnight bg-transparent text-midnight hover:bg-midnight hover:text-cream",
);

export const buttonDisabled = cn(
  buttonBase,
  "cursor-not-allowed border-plywood-600/60 bg-plywood-200 text-ink-soft",
);

/** The official logo file, untouched apart from trimmed outer margins. */
export function Logo({
  className,
  sizes,
  preload = false,
}: {
  className?: string;
  sizes: string;
  preload?: boolean;
}) {
  return (
    <Image
      src={logo}
      alt="AFTER CL TO MOON — Private Bouldering Club"
      className={className}
      sizes={sizes}
      preload={preload}
    />
  );
}

export function SectionTitle({
  eyebrow,
  title,
  sub,
  id,
  className,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  id?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">{eyebrow}</p>
      <h2
        id={id}
        className="mt-1.5 font-display text-[42px] font-extrabold uppercase leading-[0.88] text-midnight md:text-[52px]"
      >
        {title}
      </h2>
      {sub && <p className="mt-2 text-[15px] text-ink-soft">{sub}</p>}
    </div>
  );
}

const STATUS_STYLE: Record<EventDisplayStatus, string> = {
  OPEN: "border-midnight bg-butter text-midnight",
  COMING_SOON: "border-midnight bg-ivory text-midnight",
  CLOSED: "border-plywood-600 bg-plywood-200 text-ink-soft",
  FINISHED: "border-dashed border-plywood-600 bg-transparent text-ink-soft",
  CANCELED: "border-brown/70 bg-transparent text-brown",
};

export function StatusBadge({
  status,
  kind = "event",
  withKo = false,
  className,
}: {
  status: EventDisplayStatus | EnrollmentDisplayStatus;
  kind?: "event" | "enrollment";
  withKo?: boolean;
  className?: string;
}) {
  const label =
    kind === "enrollment"
      ? ENROLLMENT_STATUS_LABEL[status as EnrollmentDisplayStatus]
      : EVENT_STATUS_LABEL[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[4px] border px-2 font-mono text-[11px] font-semibold uppercase leading-none tracking-[0.06em]",
        STATUS_STYLE[status],
        className,
      )}
    >
      {label.en}
      {withKo && <span className="font-sans font-medium normal-case tracking-normal">· {label.ko}</span>}
    </span>
  );
}

export function DataNotice({ source }: { source: ClubDataSource }) {
  if (source === "sheets") return null;
  if (source === "sample") {
    return (
      <p
        role="note"
        className="rounded-md border border-dashed border-brown/50 bg-butter-200/40 px-3 py-2 text-[13px] leading-relaxed text-brown"
      >
        지금은 <strong className="font-semibold">샘플 일정</strong>이 표시되고 있어요. Google Sheets를 연결하면 실제
        클럽 일정으로 바뀝니다.
      </p>
    );
  }
  return (
    <p role="alert" className="rounded-md border border-brown/40 bg-ivory px-3 py-2 text-[13px] text-brown">
      일정을 불러오지 못했어요. 잠시 후 새로고침해 주세요.
    </p>
  );
}

/** Shown when member features are not configured yet (production without the sheet). */
export function NotReady() {
  return (
    <div className="rounded-lg border-2 border-dashed border-midnight/40 bg-ivory/70 p-6 text-center">
      <p className="font-display text-[34px] font-extrabold uppercase leading-none text-midnight">Coming soon</p>
      <p className="mt-3 text-[15px] text-ink-soft">회원 기능을 준비하고 있어요. 곧 열릴 예정이에요.</p>
    </div>
  );
}

export function ArrowUpRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-3.5", className)} fill="none">
      <path d="M5 11 11 5M6 5h5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  );
}

export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-3.5", className)} fill="none">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  );
}
