"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "./ui";

export function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex h-9 items-center rounded-md border border-midnight/30 px-3 font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-midnight hover:border-midnight"
    >
      <span aria-live="polite">{copied ? "복사됨" : label}</span>
    </button>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function subscribeStandalone(cb: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Explains how to put the app on the home screen (Android: native prompt, iOS: Share → Add to Home Screen). */
const noopSubscribe = () => () => {};

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function InstallHint({ className }: { className?: string }) {
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => true);
  const platform = useSyncExternalStore(noopSubscribe, () => (isIos() ? "ios" : "other"), () => null);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || platform === null) return null;
  if (platform === "other" && !deferred) return null;

  return (
    <div className={cn("rounded-lg border-2 border-dashed border-midnight/30 bg-ivory/70 p-4", className)}>
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.24em] text-brown">Install app</p>
      {platform === "ios" ? (
        <p className="mt-1.5 text-[14px] leading-relaxed text-midnight">
          Safari 아래쪽 <strong>공유</strong> 버튼 → <strong>홈 화면에 추가</strong>를 누르면 앱처럼 쓸 수 있어요. iPhone은
          홈 화면에 추가해야 알림을 받을 수 있어요.
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-midnight">홈 화면에 설치하고 앱처럼 쓰세요.</p>
          <button
            type="button"
            onClick={async () => {
              await deferred?.prompt();
              setDeferred(null);
            }}
            className="inline-flex h-10 items-center rounded-md border-2 border-midnight bg-butter px-4 font-label text-[12px] font-semibold uppercase tracking-[0.16em] text-midnight"
          >
            Install
          </button>
        </div>
      )}
    </div>
  );
}
