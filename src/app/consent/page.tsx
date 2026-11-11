import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { ArrowRight, ArrowUpRight, buttonPrimary, buttonSecondary, cn } from "@/components/ui";
import { CONSENT_DEFAULTS, type ConsentLinks } from "@/lib/consent";
import { getConsentLinks } from "@/server/consent";

export const metadata: Metadata = {
  title: "동의서",
  description: "애프터문 아지트 이용 전 작성하는 일일 이용 동의서와 회원 등록 동의서",
};

export default function ConsentPage() {
  return (
    <>
      <SiteHeader />
      <main className="paper flex-1">
        <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
          <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Consent</p>
          <h1 className="mt-1.5 font-display text-[46px] font-extrabold uppercase leading-[0.88] text-midnight md:text-[60px]">
            Before you climb
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            아지트를 이용하기 전에 해당하는 동의서를 작성해 주세요. Google 설문이라 로그인 없이 작성할 수 있고, 응답은 운영진만 볼 수
            있어요.
          </p>
          {/* Defaults render instantly; links from the Settings tab replace them if the crew changed a form. */}
          <Suspense fallback={<ConsentCards links={CONSENT_DEFAULTS} />}>
            <ConsentCardsFromSettings />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function ConsentCardsFromSettings() {
  return <ConsentCards links={await getConsentLinks()} />;
}

function ConsentCards({ links }: { links: ConsentLinks }) {
  return (
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      <ConsentCard
        tag="Day visit"
        title="일일 이용 동의서"
        who="회원이 아닌 분 (게스트 · 일일 이용)"
        when="방문하는 날마다, 이용 전에"
        covers={["개인정보 수집·이용 (성함 · 연락처 · 이용일)", "시설 이용 및 안전수칙", "홈캠 영상정보 처리", "일일 이용료 안내"]}
        href={links.daily}
        cta="일일 이용 동의서 작성"
        primary
      />
      <ConsentCard
        tag="Membership"
        title="회원 등록 동의서"
        who="정기 회원으로 등록하는 분"
        when="처음 등록할 때 한 번"
        covers={["개인정보 수집·이용 (성함 · 연락처)", "이용 동의서 (회비 · 환불 · 운영)", "이용 규칙", "홈캠 영상정보 처리"]}
        href={links.member}
        cta="회원 등록 동의서 작성"
        footer={
          <Link href="/me" className="inline-flex h-10 items-center gap-1.5 text-[13px] font-bold text-midnight underline underline-offset-4">
            작성 후 회원권 신청하기
            <ArrowRight />
          </Link>
        }
      />
    </div>
  );
}

function ConsentCard({
  tag,
  title,
  who,
  when,
  covers,
  href,
  cta,
  primary = false,
  footer,
}: {
  tag: string;
  title: string;
  who: string;
  when: string;
  covers: string[];
  href: string;
  cta: string;
  primary?: boolean;
  footer?: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-lg border-2 border-midnight bg-ivory p-5 shadow-[4px_4px_0_0_var(--color-midnight)]">
      <p className="font-label text-[11px] font-semibold uppercase tracking-[0.28em] text-brown">{tag}</p>
      <h2 className="mt-1 text-[22px] font-extrabold text-midnight">{title}</h2>
      <dl className="mt-3 grid grid-cols-[56px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[14px]">
        <dt className="text-ink-soft">대상</dt>
        <dd className="font-medium text-midnight">{who}</dd>
        <dt className="text-ink-soft">작성</dt>
        <dd className="font-medium text-midnight">{when}</dd>
      </dl>
      <ul className="mt-3 flex flex-col gap-1 border-t border-dashed border-midnight/25 pt-3 text-[13px] text-ink-soft">
        {covers.map((c) => (
          <li key={c} className="flex gap-2">
            <span aria-hidden="true">·</span>
            {c}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-5">
        <a href={href} target="_blank" rel="noopener noreferrer" className={cn(primary ? buttonPrimary : buttonSecondary, "w-full normal-case tracking-normal")}>
          <span className="font-sans text-[15px] font-bold">{cta}</span>
          <ArrowUpRight />
          <span className="sr-only">(새 창에서 Google 설문 열기)</span>
        </a>
        {footer && <div className="mt-2 text-center">{footer}</div>}
      </div>
    </section>
  );
}
