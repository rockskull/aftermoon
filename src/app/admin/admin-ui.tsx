"use client";

import { createContext, useActionState, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui";
import type { AdminState } from "./actions";

type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastContext = createContext<(text: string, tone: Toast["tone"]) => void>(() => {});

/**
 * Keeps action results visible even when the row that triggered them disappears
 * (an approved deposit leaves the "pending" list right away).
 */
export function AdminToasts({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const push = useCallback((text: string, tone: Toast["tone"]) => {
    const id = ++next.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <p
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto max-w-md rounded-md border-2 px-4 py-2.5 text-[14px] font-semibold shadow-[3px_3px_0_0_var(--color-midnight)]",
              t.tone === "error" ? "border-brown bg-ivory text-brown" : "border-midnight bg-butter text-midnight",
            )}
          >
            {t.text}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** A form bound to an admin server action; the result shows inline and as a toast. */
export function ActionForm({
  action,
  children,
  className,
  confirmText,
}: {
  action: (prev: AdminState, fd: FormData) => Promise<AdminState>;
  children: ReactNode;
  className?: string;
  confirmText?: string;
}) {
  const toast = useContext(ToastContext);
  // Toast as soon as the result arrives: the refreshed page may already have removed this form.
  const [state, formAction, pending] = useActionState(async (prev: AdminState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result.message) toast(result.message, result.status === "error" ? "error" : "ok");
    return result;
  }, { status: "idle" } as AdminState);

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {pending && <p className="mt-2 w-full text-[12px] text-ink-soft">처리 중…</p>}
      {!pending && state.status === "error" && state.message && (
        <p role="alert" className="mt-2 w-full text-[13px] font-medium text-brown">
          {state.message}
        </p>
      )}
    </form>
  );
}
