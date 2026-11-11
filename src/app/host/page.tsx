import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site";
import { storeMode } from "@/server/store";
import { ProposalForm } from "./proposal-form";

export const metadata: Metadata = {
  title: "Host an event",
  description: "클럽에서 해보고 싶은 활동이 있나요? 클라이밍 세션, 음악 감상회, 영화, 작은 워크숍까지 무엇이든 제안해 주세요.",
};

const STEPS = [
  { n: "1", title: "아이디어 보내기", body: "아래 제안서를 편하게 채워 주세요." },
  { n: "2", title: "운영진 검토·협의", body: "개최 여부, 일정, 참가비, 외부인 참여를 함께 정해요." },
  { n: "3", title: "캘린더에 게시", body: "확정된 이벤트만 클럽 캘린더에 올라가요." },
];

export default function HostPage() {
  return (
    <>
      <SiteHeader current="host" />
      <main className="flex-1">
        <section className="night text-cream">
          <div className="mx-auto max-w-3xl px-4 pb-12 pt-10 md:px-6 md:pb-16 md:pt-14">
            <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-butter">Host an event</p>
            <h1 className="mt-2 font-display text-[48px] font-extrabold uppercase leading-[0.86] md:text-[76px]">
              What do you
              <br />
              want to try?
            </h1>
            <p className="mt-5 text-[21px] font-bold md:text-[24px]">이런 거 한번 해보고 싶지 않으세요?</p>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-cream/75">
              클라이밍 세션, 음악 감상회, 영화 보기, 취향 교환, 작은 워크숍. 클럽에서 같이 해보고 싶은 거라면 무엇이든
              좋아요.
            </p>

            <ol className="mt-8 grid gap-3 sm:grid-cols-3">
              {STEPS.map((step) => (
                <li key={step.n} className="rounded-md border border-cream/20 px-4 py-3">
                  <p className="flex items-center gap-2 text-[15px] font-bold">
                    <span className="grid size-6 place-items-center rounded-full bg-butter font-mono text-[12px] text-midnight">
                      {step.n}
                    </span>
                    {step.title}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-cream/70">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="paper">
          <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
            {storeMode() === "demo" && (
              <p className="mb-8 rounded-md border-2 border-dashed border-brown/60 bg-ivory px-4 py-3 text-[14px] leading-relaxed text-brown">
                지금은 데모 기간이라 이 제안서는 운영진에게 전달되지 않아요. 실제 제안은 운영진에게 직접 알려 주세요.
              </p>
            )}
            <ProposalForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
