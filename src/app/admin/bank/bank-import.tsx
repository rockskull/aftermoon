"use client";

import { useActionState } from "react";
import { cn } from "@/components/ui";
import { formatDateTimeKo } from "@/lib/dates";
import { analyzeBankFile, approvePayment, type BankState } from "../actions";
import { ActionForm } from "../admin-ui";
import { Pill, smallInput, smallPrimary } from "../shared";

const won = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원`;

const KIND_LABEL = {
  exact: { label: "일치", tone: "ok" },
  review: { label: "확인 필요", tone: "warn" },
  unmatched: { label: "매칭 없음", tone: "muted" },
  applied: { label: "반영됨", tone: "muted" },
} as const;

export function BankImport() {
  const [state, action, pending] = useActionState<BankState, FormData>(analyzeBankFile, { status: "idle" });
  const matches = state.matches ?? [];
  const order = { exact: 0, review: 1, unmatched: 2, applied: 3 } as const;
  const sorted = [...matches].sort((a, b) => order[a.kind] - order[b.kind] || b.deposit.at - a.deposit.at);

  return (
    <div className="flex flex-col gap-5">
      <form action={action} className="flex flex-wrap items-end gap-3 rounded-lg border-2 border-dashed border-midnight/40 bg-ivory/70 p-4">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-semibold text-midnight">
          모임통장 거래내역 파일 (.xlsx, .xls, .csv)
          <input
            type="file"
            name="file"
            required
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className={cn(smallInput, "h-auto py-2 file:mr-3 file:rounded file:border-0 file:bg-midnight file:px-3 file:py-1.5 file:text-cream")}
          />
        </label>
        <button type="submit" disabled={pending} className={smallPrimary}>
          {pending ? "읽는 중…" : "불러와서 비교"}
        </button>
        <p className="w-full text-[12px] text-ink-soft">
          파일은 서버 메모리에서 읽기만 하고 저장하지 않아요. 같은 파일을 다시 올려도 이미 반영된 입금은 &lsquo;반영됨&rsquo;으로 표시돼요.
        </p>
      </form>

      {state.status === "error" && (
        <p role="alert" className="rounded-md border-2 border-brown bg-ivory px-4 py-3 text-[14px] font-medium text-brown">
          {state.message}
        </p>
      )}

      {state.status === "success" && (
        <section aria-label="비교 결과" className="flex flex-col gap-3">
          <p className="text-[14px] text-ink-soft">
            {state.fileName} · 입금 {matches.length}건 · 일치 {matches.filter((m) => m.kind === "exact").length} · 확인 필요{" "}
            {matches.filter((m) => m.kind === "review").length} · 반영됨 {matches.filter((m) => m.kind === "applied").length}
          </p>
          <ul className="flex flex-col gap-3">
            {sorted.map((m) => (
              <li key={m.deposit.key} className={cn("rounded-lg border-2 bg-ivory p-4", m.kind === "applied" || m.kind === "unmatched" ? "border-midnight/15 opacity-75" : "border-midnight")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[15px] font-bold text-midnight">
                    {m.deposit.name || "(이름 없음)"} <span className="font-mono">{won(m.deposit.amount)}</span>
                  </p>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-ink-soft">{formatDateTimeKo(m.deposit.at)}</span>
                    <Pill tone={KIND_LABEL[m.kind].tone}>{KIND_LABEL[m.kind].label}</Pill>
                  </span>
                </div>
                {m.deposit.memo && <p className="mt-0.5 text-[12px] text-ink-soft">메모: {m.deposit.memo}</p>}
                {m.appliedTo && <p className="mt-1 text-[13px] text-ink-soft">{m.appliedTo.memberName}님 입금으로 이미 승인됨</p>}

                {m.candidates.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2">
                    {m.candidates.map((c) => (
                      <li key={c.paymentId} className="rounded-md border border-midnight/20 bg-white/50 p-3">
                        <p className="text-[14px] text-midnight">
                          <strong>{c.memberName}</strong> · 입금자명 {c.depositorName} · {c.planName} {won(c.amount)}
                        </p>
                        {c.notes.length > 0 && <p className="mt-0.5 text-[12px] font-medium text-brown">{c.notes.join(" · ")}</p>}
                        <ActionForm
                          action={approvePayment}
                          className="mt-2 flex flex-wrap items-end gap-2"
                          confirmText={`${c.memberName}님의 ${c.planName} 입금으로 승인할까요?`}
                        >
                          <input type="hidden" name="payment_id" value={c.paymentId} />
                          <input type="hidden" name="bank_transaction_id" value={m.deposit.key} />
                          <input type="hidden" name="deposited_at" value={m.deposit.dateKey} />
                          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-soft">
                            시작일 (바꿀 때만)
                            <input type="date" name="start_date" className={smallInput} />
                          </label>
                          <button type="submit" className={smallPrimary}>
                            이 입금으로 승인
                          </button>
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
