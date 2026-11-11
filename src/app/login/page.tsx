import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { buttonPrimary, buttonSecondary, cn } from "@/components/ui";
import { loginAvailable } from "@/server/auth/viewer";
import { safeReturnTo } from "@/server/auth/session";
import { DEMO_ACCOUNTS } from "@/server/store/memory";

export const metadata: Metadata = { title: "Login", robots: { index: false } };

const ERRORS: Record<string, string> = {
  denied: "Google 로그인을 취소했어요.",
  state: "로그인 요청이 만료됐어요. 다시 시도해 주세요.",
  google: "Google 계정을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  unavailable: "아직 로그인이 준비되지 않았어요.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <SiteHeader current="me" />
      <main className="paper flex-1">
        <div className="mx-auto max-w-md px-4 py-14 md:py-20">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Members</p>
          <h1 className="mt-1.5 font-display text-[48px] font-extrabold uppercase leading-[0.88] text-midnight">Sign in</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            Google 계정으로 로그인하면 내 회원권, 회비 상태, 알림을 볼 수 있어요. 처음이라면 로그인 후 회원권을 신청하면 돼요.
          </p>
          <Suspense fallback={<div className="mt-8 h-12 animate-pulse rounded-md bg-ivory/60" />}>
            <LoginOptions searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function LoginOptions({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const returnTo = safeReturnTo(typeof params.returnTo === "string" ? params.returnTo : null);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const { google, demo } = loginAvailable();

  return (
    <div className="mt-8 flex flex-col gap-6">
      {error && (
        <p role="alert" className="rounded-md border-2 border-brown bg-ivory px-4 py-3 text-[14px] font-medium text-brown">
          {error}
        </p>
      )}

      {google ? (
        <a href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`} className={cn(buttonPrimary, "w-full normal-case tracking-normal")}>
          <svg viewBox="0 0 18 18" className="size-[18px]" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62Z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
            <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
          </svg>
          <span className="font-sans text-[15px] font-bold">Google로 계속하기</span>
        </a>
      ) : (
        !demo && (
          <p className="rounded-md border border-dashed border-brown/50 px-4 py-3 text-[14px] text-brown">
            로그인이 아직 설정되지 않았어요. (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
          </p>
        )
      )}

      {demo && (
        <section aria-labelledby="demo-title" className="rounded-lg border-2 border-dashed border-midnight/40 bg-ivory/70 p-4">
          <h2 id="demo-title" className="font-label text-[12px] font-semibold uppercase tracking-[0.2em] text-brown">
            Demo accounts
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
            시트 연결 전 데모 모드예요. 계정을 골라 각 역할의 화면을 확인할 수 있어요. 데이터는 서버 메모리에만 있어요.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <form action="/api/auth/demo" method="post">
                  <input type="hidden" name="email" value={account.email} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button type="submit" className={cn(buttonSecondary, "h-auto w-full justify-between whitespace-normal py-2.5 text-left normal-case tracking-normal")}>
                    <span className="text-[14px] font-bold">{account.label}</span>
                    <span className="font-mono text-[11px] font-normal text-ink-soft">{account.email}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
