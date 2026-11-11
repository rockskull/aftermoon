"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import { isIos, isStandalone } from "@/components/client-bits";
import { buttonPrimary, buttonSecondary, cn } from "@/components/ui";
import { savePrefs, subscribePush, unsubscribePush, type ActionState } from "../me/actions";

type Support = "unsupported" | "ios-needs-install" | "supported";
type DeviceState = "checking" | "off" | "on" | "denied";

function detectSupport(): Support {
  const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIos() && !isStandalone()) return "ios-needs-install";
  return hasApis ? "supported" : "unsupported";
}

const noop = () => () => {};

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** This device's push permission + subscription, and the member's notification categories. */
export function PushSettings({
  vapidPublicKey,
  prefs,
  isOperator,
}: {
  vapidPublicKey: string | null;
  prefs: { membership: boolean; events: boolean; operator: boolean };
  isOperator: boolean;
}) {
  const support = useSyncExternalStore(noop, detectSupport, () => "supported" as Support);
  const [device, setDevice] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [prefsState, prefsAction, prefsPending] = useActionState<ActionState, FormData>(savePrefs, { status: "idle" });

  useEffect(() => {
    if (support !== "supported") return;
    let cancelled = false;
    (async () => {
      const permission = Notification.permission;
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (cancelled) return;
      setDevice(permission === "denied" ? "denied" : sub ? "on" : "off");
    })();
    return () => {
      cancelled = true;
    };
  }, [support]);

  async function turnOn() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "denied" : "off");
        setMessage("알림 권한이 허용되지 않았어요. 앱 안의 알림 목록에서는 계속 확인할 수 있어요.");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const result = await subscribePush({ endpoint: json.endpoint, keys: json.keys }, navigator.userAgent);
      if (!result.ok) {
        await sub.unsubscribe();
        setMessage(result.message ?? "알림을 켜지 못했어요.");
        setDevice("off");
        return;
      }
      setDevice("on");
      setMessage("이 기기에서 알림을 받아요.");
    } catch (error) {
      console.error(error);
      setMessage("이 브라우저에서는 알림을 켤 수 없어요.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setDevice("off");
      setMessage("이 기기의 알림을 껐어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="device-title" className="rounded-lg border-2 border-midnight bg-ivory p-5">
        <h2 id="device-title" className="text-[17px] font-extrabold text-midnight">
          이 기기에서 푸시 알림
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-soft" aria-live="polite">
          {support === "unsupported" && "이 브라우저는 푸시 알림을 지원하지 않아요. 알림은 이 화면의 목록에서 확인할 수 있어요."}
          {support === "ios-needs-install" &&
            "iPhone·iPad는 Safari에서 공유 → 홈 화면에 추가로 앱을 설치한 뒤, 설치한 앱에서 알림을 켤 수 있어요. (iOS 16.4 이상)"}
          {support === "supported" && device === "checking" && "상태를 확인하는 중…"}
          {support === "supported" && device === "on" && "켜져 있어요. 회비 승인, 만료 안내, 새 이벤트 소식을 보내드려요."}
          {support === "supported" && device === "off" && "꺼져 있어요. 켜면 중요한 소식을 바로 받을 수 있어요."}
          {support === "supported" &&
            device === "denied" &&
            "브라우저에서 알림이 차단되어 있어요. 브라우저(또는 휴대폰) 설정에서 이 사이트의 알림을 허용해 주세요."}
        </p>
        {!vapidPublicKey && support === "supported" && (
          <p className="mt-2 text-[13px] text-brown">푸시 알림이 아직 설정되지 않았어요. (VAPID 키)</p>
        )}
        {support === "supported" && vapidPublicKey && device !== "checking" && device !== "denied" && (
          <div className="mt-4">
            {device === "on" ? (
              <button type="button" disabled={busy} onClick={turnOff} className={cn(buttonSecondary, "disabled:opacity-60")}>
                Turn off
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={turnOn} className={cn(buttonPrimary, "disabled:opacity-60")}>
                Turn on
              </button>
            )}
          </div>
        )}
        {message && <p className="mt-3 text-[13px] font-medium text-brown">{message}</p>}
      </section>

      <form action={prefsAction} className="rounded-lg border-2 border-midnight bg-ivory p-5">
        <h2 className="text-[17px] font-extrabold text-midnight">받을 알림</h2>
        <p className="mt-1 text-[13px] text-ink-soft">푸시와 알림 목록 모두에 적용돼요.</p>
        <div className="mt-4 flex flex-col gap-2">
          <Toggle name="membership" defaultChecked={prefs.membership} title="회원권" detail="회비 승인, 만료 D-7 · D-1" />
          <Toggle name="events" defaultChecked={prefs.events} title="이벤트" detail="새 이벤트, 신청 시작 · 마감, 일정 변경 · 취소" />
          {isOperator && <Toggle name="operator" defaultChecked={prefs.operator} title="운영" detail="새 제안, 입금 확인 대기, 만료 예정 현황" />}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" disabled={prefsPending} className={cn(buttonSecondary, "h-10 disabled:opacity-60")}>
            Save
          </button>
          {prefsState.message && (
            <span className={cn("text-[13px]", prefsState.status === "error" ? "text-brown" : "text-ink-soft")} aria-live="polite">
              {prefsState.message}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

function Toggle({ name, defaultChecked, title, detail }: { name: string; defaultChecked: boolean; title: string; detail: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-md border border-midnight/20 px-3.5 py-2.5 has-[:checked]:border-midnight">
      <span>
        <span className="block text-[15px] font-bold text-midnight">{title}</span>
        <span className="block text-[12px] text-ink-soft">{detail}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5 accent-midnight" />
    </label>
  );
}
