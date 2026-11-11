import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { NotReady } from "@/components/ui";
import { formatDateTimeKo, parseMoment } from "@/lib/dates";
import { requireOperator } from "@/server/auth/viewer";
import { cellText } from "@/server/store/schema";
import { readTables, storeMode } from "@/server/store";
import { reviewProposal } from "../actions";
import { ActionForm } from "../admin-ui";
import { AdminFrame, AdminSkeleton, Box, Pill, smallButton, smallInput } from "../shared";

export const metadata: Metadata = { title: "제안·이벤트", robots: { index: false } };

export default function ProposalsPage() {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Proposals />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const REVIEW = { new: "새 제안", reviewing: "검토 중", accepted: "진행 확정", declined: "보류·거절" } as const;

async function Proposals() {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const { club } = await requireOperator("/admin/proposals");
  const tables = await readTables(["Proposals", "Events"], { fresh: true });
  const proposals = [...(tables.Proposals ?? [])].sort((a, b) => cellText(b.submitted_at).localeCompare(cellText(a.submitted_at)));
  const events = [...(tables.Events ?? [])].sort((a, b) => cellText(b.start_at).localeCompare(cellText(a.start_at))).slice(0, 30);
  const t = (v: unknown) => cellText(v as string).trim();

  return (
    <AdminFrame tab="proposals" title="Ideas & events">
      <div className="flex flex-col gap-6">
        <Box title={`이벤트 제안 ${proposals.length}건`}>
          <p className="mb-3 text-[13px] text-ink-soft">
            제안자의 연락처와 희망 참가비는 운영진만 볼 수 있어요. 확정된 이벤트는 스프레드시트 Events 탭에 등록하면 캘린더에 올라가요.
          </p>
          {proposals.length === 0 ? (
            <p className="text-[14px] text-ink-soft">아직 받은 제안이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {proposals.map((p) => {
                const id = t(p.proposal_id);
                const status = (t(p.review_status) || "new") as keyof typeof REVIEW;
                const at = parseMoment(t(p.submitted_at));
                return (
                  <li key={id || t(p.submitted_at)} className="rounded-md border border-midnight/20 bg-white/50 p-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[16px] font-bold text-midnight">{t(p.event_title)}</p>
                        <p className="text-[13px] text-ink-soft">
                          {t(p.proposer)} · {t(p.contact)} {at && <span className="font-mono">· {formatDateTimeKo(at.ms)}</span>}
                        </p>
                      </div>
                      <Pill tone={status === "new" ? "warn" : status === "accepted" ? "ok" : "default"}>{REVIEW[status] ?? status}</Pill>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-midnight">{t(p.description)}</p>
                    <dl className="mt-2 grid grid-cols-[88px_1fr] gap-x-2 gap-y-0.5 text-[13px]">
                      {[
                        ["희망 날짜", `${t(p.preferred_date)} ${t(p.date_flexible) ? `(${t(p.date_flexible)})` : ""}`],
                        ["소요 시간", t(p.estimated_duration)],
                        ["대상·인원", [t(p.audience), t(p.expected_attendance)].filter(Boolean).join(" · ")],
                        ["희망 참가비", t(p.desired_fee) ? `${t(p.desired_fee)}원 ${t(p.fee_unit)}` : t(p.free_ok) ? "무료 가능" : ""],
                        ["비용 근거", t(p.estimated_cost)],
                        ["필요한 것", [t(p.requirements), t(p.staff_support), t(p.other_requests)].filter(Boolean).join(" / ")],
                      ]
                        .filter(([, v]) => v.trim())
                        .map(([k, v]) => (
                          <div key={k} className="contents">
                            <dt className="text-ink-soft">{k}</dt>
                            <dd className="text-midnight">{v}</dd>
                          </div>
                        ))}
                    </dl>
                    {id ? (
                      <ActionForm action={reviewProposal} className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="proposal_id" value={id} />
                        <select name="review_status" defaultValue={status} aria-label="검토 상태" className={smallInput}>
                          {Object.entries(REVIEW).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <input name="review_notes" defaultValue={t(p.review_notes)} placeholder="검토 메모" maxLength={1000} className={`${smallInput} min-w-40 flex-1`} />
                        <button type="submit" className={smallButton}>
                          저장
                        </button>
                      </ActionForm>
                    ) : (
                      <p className="mt-2 text-[12px] text-brown">proposal_id가 없는 행이에요. 시트에서 직접 관리해 주세요.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Box>

        <Box
          title="이벤트 (시트 전체)"
          action={
            club.settings.sheetUrl ? (
              <a href={club.settings.sheetUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold text-midnight underline underline-offset-4">
                시트에서 편집
              </a>
            ) : undefined
          }
        >
          {events.length === 0 ? (
            <p className="text-[14px] text-ink-soft">Events 탭에 등록된 이벤트가 없어요.</p>
          ) : (
            <ul className="divide-y divide-plywood-400 text-[14px]">
              {events.map((e) => (
                <li key={t(e.event_id)} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong className="text-midnight">{t(e.title)}</strong> <span className="font-mono text-[12px] text-ink-soft">{t(e.start_at)}</span>
                  </span>
                  <span className="flex gap-1">
                    <Pill tone={t(e.visibility) === "public" ? "default" : "muted"}>{t(e.visibility) || "?"}</Pill>
                    <Pill tone={t(e.status) === "published" ? "ok" : "muted"}>{t(e.status) || "?"}</Pill>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>
    </AdminFrame>
  );
}
