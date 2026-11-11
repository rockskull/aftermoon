import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site";
import { cn, NotReady } from "@/components/ui";
import { requestNow } from "@/lib/club-data";
import { toDateKey } from "@/lib/dates";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  METHODS,
  REFUNDABLE_CATEGORY,
  sortEntries,
  summarize,
  type CategoryTotal,
  type MoneyEntry,
} from "@/lib/ledger";
import { requireOperator } from "@/server/auth/viewer";
import { formatWon } from "@/server/domain/model";
import { loadMoney } from "@/server/money";
import { storeMode } from "@/server/store";
import { addLedgerEntry, editLedgerEntry, voidLedgerEntry } from "../actions";
import { ActionForm } from "../admin-ui";
import { AdminFrame, AdminSkeleton, Box, Pill, smallButton, smallInput, smallPrimary } from "../shared";

export const metadata: Metadata = { title: "회계", robots: { index: false } };

export default function MoneyPage({ searchParams }: PageProps<"/admin/money">) {
  return (
    <>
      <SiteHeader current="admin" />
      <main className="paper flex-1">
        <Suspense fallback={<AdminSkeleton />}>
          <Money searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

const dot = (key: string) => key.replace(/-/g, ".");
const monthLabel = (m: string) => `${m.slice(0, 4)}.${m.slice(5, 7)}`;

async function Money({ searchParams }: Pick<PageProps<"/admin/money">, "searchParams">) {
  if (storeMode() === "unconfigured") return <div className="mx-auto max-w-3xl px-4 py-10"><NotReady /></div>;
  const now = await requestNow();
  await requireOperator("/admin/money");
  const params = await searchParams;
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : "";
  const kind = params.kind === "income" || params.kind === "expense" ? params.kind : "";
  const showVoid = params.void === "1";
  const today = toDateKey(now);

  const { entries } = await loadMoney();
  const overall = summarize(entries);
  const inMonth = month ? entries.filter((e) => e.date.startsWith(month)) : entries;
  const scoped = summarize(inMonth);
  const listed = sortEntries(inMonth.filter((e) => (!kind || e.kind === kind) && (showVoid || !e.voided)));
  const months = [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort().reverse();

  const query = (next: Record<string, string>) => {
    const q = new URLSearchParams({ ...(month && { month }), ...(kind && { kind }), ...(showVoid && { void: "1" }), ...next });
    for (const [k, v] of [...q]) if (!v) q.delete(k);
    const s = q.toString();
    return `/admin/money${s ? `?${s}` : ""}`;
  };

  return (
    <AdminFrame tab="money" title="Club money">
      {/* Headline figures (whole history) */}
      <section aria-label="요약" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="지금 남은 돈" value={overall.balance} hero />
        <Stat label="총 수입" value={overall.income} note="출자금 · 회비 · 가입비 등" />
        <Stat label="총 지출" value={overall.expense} note={`보증금 포함 · 운영비 ${formatWon(overall.operatingExpense)}`} />
        <Stat label="보증금 (돌려받을 돈)" value={overall.refundable} note="계약 종료 시 반환" />
      </section>

      <div className="mt-6 flex flex-col gap-6">
        <Box title="기록 추가">
          <ActionForm action={addLedgerEntry} className="grid gap-3 sm:grid-cols-2">
            <LedgerFields today={today} />
            <div className="sm:col-span-2">
              <button type="submit" className={smallPrimary}>
                기록 추가
              </button>
            </div>
          </ActionForm>
          <p className="mt-3 text-[12px] text-ink-soft">
            회비와 가입비는 입금 승인 때 자동으로 수입에 잡혀요. 여기에는 출자금, 일일 이용료, 모든 지출을 적어 주세요.
          </p>
        </Box>

        {/* Filters */}
        <nav aria-label="기간 · 구분 필터" className="flex flex-col gap-2">
          <ul className="flex flex-wrap gap-1.5">
            {["", ...months].map((m) => (
              <li key={m || "all"}>
                <Chip href={query({ month: m })} active={month === m}>
                  {m ? monthLabel(m) : "전체 기간"}
                </Chip>
              </li>
            ))}
          </ul>
          <ul className="flex flex-wrap gap-1.5">
            {[
              ["", "수입·지출"],
              ["income", "수입만"],
              ["expense", "지출만"],
            ].map(([k, label]) => (
              <li key={k || "both"}>
                <Chip href={query({ kind: k })} active={kind === k}>
                  {label}
                </Chip>
              </li>
            ))}
          </ul>
        </nav>

        {month && (
          <p className="-mt-2 text-[14px] text-midnight">
            <strong>{monthLabel(month)}</strong> 수입 <span className="font-mono">{formatWon(scoped.income)}</span> · 지출{" "}
            <span className="font-mono">{formatWon(scoped.expense)}</span> · 차액{" "}
            <span className="font-mono font-semibold">{formatWon(scoped.income - scoped.expense)}</span>
          </p>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Box title={month ? `${monthLabel(month)} 항목별 지출` : "항목별 지출"}>
            <CategoryBars rows={scoped.expenseByCategory} empty="지출 기록이 없어요." />
          </Box>
          <Box title={month ? `${monthLabel(month)} 항목별 수입` : "항목별 수입"}>
            <CategoryBars rows={scoped.incomeByCategory} empty="수입 기록이 없어요." />
          </Box>
        </div>

        <Box title="월별 흐름">
          {overall.byMonth.length === 0 ? (
            <p className="text-[14px] text-ink-soft">아직 기록이 없어요.</p>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[420px] text-[14px]">
                <thead>
                  <tr className="border-b-2 border-midnight text-left text-[12px] text-ink-soft">
                    <th className="px-1 py-2 font-semibold">월</th>
                    <th className="px-1 py-2 text-right font-semibold">수입</th>
                    <th className="px-1 py-2 text-right font-semibold">지출</th>
                    <th className="px-1 py-2 text-right font-semibold">월말 잔액</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {[...overall.byMonth].reverse().map((r) => (
                    <tr key={r.month} className={cn("border-b border-plywood-400", r.month === month && "bg-butter-200/50")}>
                      <td className="px-1 py-2 font-sans font-semibold">{monthLabel(r.month)}</td>
                      <td className="px-1 py-2 text-right">{formatWon(r.income)}</td>
                      <td className="px-1 py-2 text-right">{formatWon(r.expense)}</td>
                      <td className="px-1 py-2 text-right font-semibold">{formatWon(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Box>

        {overall.contributors.length > 0 && (
          <Box title="출자금">
            <ul className="divide-y divide-plywood-400 text-[14px]">
              {overall.contributors.map((c) => (
                <li key={c.person} className="flex items-center justify-between py-2">
                  <span className="font-medium text-midnight">{c.person}</span>
                  <span className="font-mono">{formatWon(c.amount)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between py-2 font-semibold">
                <span>합계</span>
                <span className="font-mono">{formatWon(overall.contributors.reduce((s, c) => s + c.amount, 0))}</span>
              </li>
            </ul>
          </Box>
        )}

        <Box
          title={`기록 ${listed.length}건`}
          action={
            <span className="flex items-center gap-3 text-[13px] font-bold">
              <Link href={query({ void: showVoid ? "" : "1" })} className="text-ink-soft underline underline-offset-4">
                {showVoid ? "무효 숨기기" : "무효 포함"}
              </Link>
              <a href={`/admin/money/export${month ? `?month=${month}` : ""}`} className="text-midnight underline underline-offset-4">
                CSV 내려받기
              </a>
            </span>
          }
        >
          {listed.length === 0 ? (
            <p className="text-[14px] text-ink-soft">조건에 맞는 기록이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {listed.map((e) => (
                <EntryRow key={e.id} entry={e} today={today} />
              ))}
            </ul>
          )}
        </Box>
      </div>
    </AdminFrame>
  );
}

function Stat({ label, value, note, hero = false }: { label: string; value: number; note?: string; hero?: boolean }) {
  return (
    <div className={cn("rounded-lg border-2 border-midnight p-3.5", hero ? "col-span-2 bg-butter md:col-span-1" : "bg-ivory")}>
      <p className="text-[12px] font-semibold text-ink-soft">{label}</p>
      <p className={cn("mt-1 font-display font-extrabold leading-none text-midnight", hero ? "text-[44px]" : "text-[28px]")}>
        {value.toLocaleString("ko-KR")}
        <span className="ml-0.5 font-sans text-[14px] font-bold">원</span>
      </p>
      {note && <p className="mt-1.5 text-[11px] leading-snug text-ink-soft">{note}</p>}
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-full border-2 px-3 text-[13px] font-bold",
        active ? "border-midnight bg-midnight text-cream" : "border-midnight/25 text-midnight",
      )}
    >
      {children}
    </Link>
  );
}

const pct = (share: number) => (share > 0 && share < 0.005 ? "1% 미만" : `${Math.round(share * 100)}%`);

/** Ranked horizontal bars, one hue; the figures sit beside each bar in text ink. */
function CategoryBars({ rows, empty }: { rows: CategoryTotal[]; empty: string }) {
  if (rows.length === 0) return <p className="text-[14px] text-ink-soft">{empty}</p>;
  const max = rows[0].amount;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.category} title={`${r.category} ${formatWon(r.amount)} (${pct(r.share)}, ${r.count}건)`}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="font-semibold text-midnight">
              {r.category}
              {r.category === REFUNDABLE_CATEGORY && <span className="ml-1.5 text-[11px] font-medium text-ink-soft">반환 예정</span>}
            </span>
            <span className="font-mono text-ink-soft">
              <span className="font-semibold text-midnight">{formatWon(r.amount)}</span> · {pct(r.share)}
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full rounded-r-[4px] bg-plywood-400/50" aria-hidden="true">
            <div className="h-full rounded-r-[4px] bg-midnight" style={{ width: `${Math.max(1.5, (r.amount / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LedgerFields({ entry, today }: { entry?: MoneyEntry; today: string }) {
  const label = "flex flex-col gap-1 text-[12px] font-medium text-ink-soft";
  return (
    <>
      <label className={label}>
        날짜
        <input type="date" name="date" required defaultValue={entry?.date ?? today} max={today} className={smallInput} />
      </label>
      <label className={label}>
        항목
        <select name="category" required defaultValue={entry?.category ?? ""} className={smallInput}>
          <option value="" disabled>
            골라 주세요
          </option>
          <optgroup label="지출">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </optgroup>
          <optgroup label="수입">
            {INCOME_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <label className={label}>
        내용
        <input name="description" required maxLength={200} defaultValue={entry?.description} placeholder="예: 쿠팡(피스), 11월 월세" className={smallInput} />
      </label>
      <label className={label}>
        금액 (원)
        <input
          name="amount"
          required
          inputMode="numeric"
          pattern="[0-9,]*"
          defaultValue={entry ? String(entry.amount) : ""}
          placeholder="예: 16500"
          className={smallInput}
        />
      </label>
      <label className={label}>
        관련인 (출자자 · 결제한 사람)
        <input name="person" maxLength={40} defaultValue={entry?.person} className={smallInput} />
      </label>
      <label className={label}>
        결제 수단
        <select name="method" defaultValue={entry?.method || "모임통장"} className={smallInput}>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        영수증 링크 (선택)
        <input name="receipt_url" type="url" maxLength={500} defaultValue={entry?.receiptUrl} placeholder="https://" className={smallInput} />
      </label>
      <label className={label}>
        메모 (선택)
        <input name="memo" maxLength={300} defaultValue={entry?.memo} className={smallInput} />
      </label>
    </>
  );
}

function EntryRow({ entry, today }: { entry: MoneyEntry; today: string }) {
  const sign = entry.kind === "income" ? "+" : "−";
  const body = (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="min-w-0">
        <span className="mr-2 font-mono text-[12px] text-ink-soft">{dot(entry.date)}</span>
        <span className={cn("text-[15px] font-semibold text-midnight", entry.voided && "line-through")}>{entry.description}</span>
        {entry.person && <span className="ml-1.5 text-[12px] text-ink-soft">{entry.person}</span>}
      </span>
      <span className="flex items-center gap-2">
        {entry.source === "payment" && <Pill tone="ok">자동</Pill>}
        {entry.voided && <Pill tone="muted">무효</Pill>}
        <Pill tone="default">{entry.category}</Pill>
        <span className={cn("font-mono text-[15px] font-semibold", entry.kind === "income" ? "text-midnight" : "text-brown")}>
          {sign}
          {entry.amount.toLocaleString("ko-KR")}
        </span>
      </span>
    </div>
  );

  if (entry.source === "payment") {
    return (
      <li className="rounded-md border border-midnight/15 bg-white/40 px-3 py-2.5">
        {body}
        <p className="mt-1 text-[12px] text-ink-soft">
          입금 승인에서 자동 집계 ·{" "}
          <Link href={`/admin/members/${encodeURIComponent(entry.memberId ?? "")}`} className="underline underline-offset-2">
            회원 보기
          </Link>
        </p>
      </li>
    );
  }

  return (
    <li className={cn("rounded-md border bg-white/60 px-3 py-2.5", entry.voided ? "border-midnight/10 opacity-60" : "border-midnight/20")}>
      {body}
      {(entry.memo || entry.receiptUrl) && (
        <p className="mt-1 text-[12px] text-ink-soft">
          {entry.method && `${entry.method} · `}
          {entry.memo}
          {entry.receiptUrl && (
            <a href={entry.receiptUrl} target="_blank" rel="noopener noreferrer" className="ml-1.5 underline underline-offset-2">
              영수증
            </a>
          )}
        </p>
      )}
      {!entry.voided && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12px] font-bold text-midnight">수정 · 무효 처리</summary>
          <ActionForm action={editLedgerEntry} className="mt-2 grid gap-3 sm:grid-cols-2" confirmText="이 기록을 수정할까요? 변경 이력이 남아요.">
            <input type="hidden" name="entry_id" value={entry.id} />
            <LedgerFields entry={entry} today={today} />
            <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft sm:col-span-2">
              수정 사유 (필수)
              <input name="reason" required maxLength={200} className={smallInput} />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className={smallButton}>
                수정 저장
              </button>
            </div>
          </ActionForm>
          <ActionForm action={voidLedgerEntry} className="mt-3 flex flex-wrap items-end gap-2 border-t border-dashed border-midnight/20 pt-3" confirmText="이 기록을 무효 처리할까요? 합계에서 빠지고, 기록은 남아요.">
            <input type="hidden" name="entry_id" value={entry.id} />
            <input name="reason" required maxLength={200} placeholder="무효 사유 (예: 중복 입력)" className={`${smallInput} min-w-0 flex-1`} />
            <button type="submit" className={smallButton}>
              무효 처리
            </button>
          </ActionForm>
        </details>
      )}
    </li>
  );
}
