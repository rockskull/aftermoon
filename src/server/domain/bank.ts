import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { parseMoment, SEOUL_OFFSET_MS, toDateKey } from "@/lib/dates";
import { formatWon, type ClubPrivate } from "./model";

/**
 * KakaoBank (모임통장) statement import.
 *
 * The exact export layout still has to be confirmed with a real file, so the
 * parser finds the header row by known Korean column names instead of fixed
 * positions. Supported shapes:
 *  - separate 입금액 / 출금액 columns, or
 *  - one 거래금액 column with a 구분 (입금/출금) column or signed amounts.
 * Only deposits are returned. Nothing from the file is stored.
 */

const ALIASES = {
  date: ["거래일시", "거래일자", "거래 일시", "거래일", "일시", "날짜", "거래날짜"],
  time: ["거래시간", "시간", "거래 시간"],
  type: ["구분", "입출금구분", "입/출금", "입출금", "거래유형"],
  deposit: ["입금액", "입금금액", "입금(원)", "맡기신금액", "입금 금액"],
  withdrawal: ["출금액", "출금금액", "출금(원)", "찾으신금액", "출금 금액"],
  amount: ["거래금액", "금액", "거래 금액"],
  balance: ["거래 후 잔액", "거래후잔액", "거래후 잔액", "잔액"],
  name: ["내용", "입금자", "입금자명", "보낸분", "보낸 분", "받는분/보낸분", "거래내용", "적요", "기재내용", "상대방", "거래처"],
  memo: ["메모", "비고"],
} as const;

type Column = keyof typeof ALIASES;

export interface Deposit {
  /** Stable id for this transaction; re-uploading the same file yields the same key. */
  key: string;
  at: number;
  dateKey: string;
  name: string;
  amount: number;
  balance: number | null;
  memo: string;
}

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const compact = (v: string) => v.replace(/\s+/g, "");

function amountOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = clean(v).replace(/[,원\s]/g, "");
  if (!s || !/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

function findColumns(header: unknown[]): Partial<Record<Column, number>> {
  const cells = header.map((h) => compact(clean(h)));
  const found: Partial<Record<Column, number>> = {};
  for (const [col, names] of Object.entries(ALIASES) as Array<[Column, readonly string[]]>) {
    const wanted = names.map(compact);
    // exact match first, then "starts with" (e.g. "거래일시(KST)")
    let idx = cells.findIndex((c) => wanted.includes(c));
    if (idx === -1) idx = cells.findIndex((c) => c && wanted.some((w) => c.startsWith(w)));
    if (idx !== -1 && !Object.values(found).includes(idx)) found[col] = idx;
  }
  return found;
}

/** Excel serial date (days since 1899-12-30, Seoul wall clock) → instant. */
function fromSerial(serial: number): number {
  return Math.round((serial - 25569) * 86_400_000) - SEOUL_OFFSET_MS;
}

function parseWhen(dateCell: unknown, timeCell: unknown): number | null {
  if (typeof dateCell === "number" && dateCell > 20000 && dateCell < 80000) return fromSerial(dateCell);
  const date = clean(dateCell);
  const time = clean(timeCell);
  const parsed = parseMoment(time && !date.includes(":") ? `${date} ${time}` : date);
  return parsed?.ms ?? null;
}

export function parseBankRows(rows: unknown[][]): Deposit[] {
  const headerIndex = rows.slice(0, 40).findIndex((row) => {
    const cols = findColumns(row);
    return cols.date !== undefined && (cols.deposit !== undefined || cols.amount !== undefined);
  });
  if (headerIndex === -1) throw new Error("BANK:거래일시와 금액 열을 찾지 못했어요. 카카오뱅크에서 내려받은 원본 파일인지 확인해 주세요.");
  const cols = findColumns(rows[headerIndex]);

  const deposits: Deposit[] = [];
  const seen = new Map<string, number>();
  for (const row of rows.slice(headerIndex + 1)) {
    const at = parseWhen(row[cols.date!], cols.time !== undefined ? row[cols.time] : "");
    if (at === null) continue;

    let amount: number | null = null;
    if (cols.deposit !== undefined) {
      amount = amountOf(row[cols.deposit]);
    } else {
      const raw = amountOf(row[cols.amount!]);
      const type = cols.type !== undefined ? clean(row[cols.type]) : "";
      if (raw !== null) {
        if (type.includes("출금") || type.includes("지급")) amount = null;
        else if (type.includes("입금")) amount = Math.abs(raw);
        else amount = raw > 0 ? raw : null; // signed amounts: positive = deposit
      }
    }
    if (!amount || amount <= 0) continue;

    const name = cols.name !== undefined ? clean(row[cols.name]) : "";
    const balance = cols.balance !== undefined ? amountOf(row[cols.balance]) : null;
    const memo = cols.memo !== undefined ? clean(row[cols.memo]) : "";

    // Identical rows (same time, amount, balance, name) are told apart by their order in the file.
    const base = `${at}|${amount}|${balance ?? ""}|${name}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const key = `KB-${createHash("sha256").update(`${base}|${occurrence}`).digest("hex").slice(0, 20)}`;

    deposits.push({ key, at, dateKey: toDateKey(at), name, amount, balance, memo });
  }
  return deposits;
}

export function parseBankFile(bytes: Uint8Array): Deposit[] {
  const wb = XLSX.read(bytes, { type: "array", cellDates: false, cellNF: false, cellText: true });
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: "", blankrows: false });
    try {
      const deposits = parseBankRows(rows);
      if (deposits.length) return deposits;
    } catch (error) {
      if (sheetName === wb.SheetNames.at(-1)) throw error;
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Matching: suggestions only — the operator approves every deposit.
// ---------------------------------------------------------------------------

export interface MatchCandidate {
  paymentId: string;
  memberId: string;
  memberName: string;
  depositorName: string;
  amount: number;
  planName: string;
  requestedAt: string;
  notes: string[];
}

export interface DepositMatch {
  deposit: Omit<Deposit, "balance">;
  /** applied: already used by an approved payment · exact: one clear candidate · review: needs a human · unmatched: nothing found */
  kind: "applied" | "exact" | "review" | "unmatched";
  candidates: MatchCandidate[];
  appliedTo?: { paymentId: string; memberName: string };
}

const normName = (v: string) => v.toLowerCase().replace(/[\s()[\]{}·.,_-]/g, "");

export function matchDeposits(deposits: Deposit[], club: ClubPrivate, todayKey: string): DepositMatch[] {
  const memberById = new Map(club.members.map((m) => [m.id, m]));
  const planName = (id: string) => club.plans.find((p) => p.id === id)?.name ?? id;
  const open = club.payments.filter((p) => p.status === "pending" || p.status === "matched");

  return deposits
    .sort((a, b) => b.at - a.at)
    .map(({ balance: _balance, ...deposit }) => {
      void _balance;
      const applied = club.payments.find((p) => p.bankTransactionId === deposit.key);
      if (applied) {
        return {
          deposit,
          kind: "applied" as const,
          candidates: [],
          appliedTo: { paymentId: applied.id, memberName: memberById.get(applied.memberId)?.name ?? applied.memberId },
        };
      }

      const depositor = normName(deposit.name);
      const toCandidate = (p: (typeof open)[number], notes: string[]): MatchCandidate => {
        const m = memberById.get(p.memberId);
        if (p.requestedAt && toDateKey(parseMoment(p.requestedAt)?.ms ?? 0) > deposit.dateKey) notes.push("신청 전 입금");
        return {
          paymentId: p.id,
          memberId: p.memberId,
          memberName: m?.name ?? p.memberId,
          depositorName: p.depositorName,
          amount: p.amount,
          planName: planName(p.planId),
          requestedAt: p.requestedAt,
          notes,
        };
      };
      const nameMatches = (p: (typeof open)[number]) => {
        const m = memberById.get(p.memberId);
        return [p.depositorName, m?.depositorName ?? "", m?.name ?? ""].some((n) => n && depositor && (normName(n) === depositor || depositor.includes(normName(n))));
      };

      const exact = open.filter((p) => nameMatches(p) && p.amount === deposit.amount);
      if (exact.length === 1) return { deposit, kind: "exact" as const, candidates: [toCandidate(exact[0], [])] };
      if (exact.length > 1) {
        return { deposit, kind: "review" as const, candidates: exact.map((p) => toCandidate(p, ["같은 이름·금액 신청이 여러 건 (동명이인 확인)"])) };
      }

      const byName = open.filter(nameMatches);
      if (byName.length) {
        return {
          deposit,
          kind: "review" as const,
          candidates: byName.map((p) =>
            toCandidate(p, [
              p.amount > deposit.amount
                ? `부분 입금 의심: 신청 ${formatWon(p.amount)} / 입금 ${formatWon(deposit.amount)}`
                : `금액 다름: 신청 ${formatWon(p.amount)} / 입금 ${formatWon(deposit.amount)}`,
            ]),
          ),
        };
      }

      const byAmount = open.filter((p) => p.amount === deposit.amount).slice(0, 5);
      if (byAmount.length) {
        return {
          deposit,
          kind: "review" as const,
          candidates: byAmount.map((p) => toCandidate(p, [`입금자명 다름 (신청: ${p.depositorName}) · 대리 입금인지 확인`])),
        };
      }
      return { deposit, kind: "unmatched" as const, candidates: [] };
    })
    .filter((m) => m.kind !== "unmatched" || m.deposit.dateKey >= addMonthsBack(todayKey));
}

/** Unmatched deposits older than ~3 months are noise (other club income); hide them. */
function addMonthsBack(todayKey: string): string {
  const [y, m, d] = todayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 4, d)).toISOString().slice(0, 10);
}
