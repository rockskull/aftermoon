import "server-only";
import { entriesFromPayments, type MoneyEntry } from "@/lib/ledger";
import { parsePrivate, toLedgerEntry, type ClubPrivate } from "./domain/model";
import { readTables } from "./store";

/** Ledger entries + income derived from approved payments, read fresh from the sheet. */
export async function loadMoney(): Promise<{ entries: MoneyEntry[]; club: ClubPrivate }> {
  const tables = await readTables(["Ledger", "Payments", "Members", "Plans"], { fresh: true });
  const club = parsePrivate(tables);
  const ledger = (tables.Ledger ?? []).map(toLedgerEntry).filter((e): e is MoneyEntry => e !== null);
  const fromPayments = entriesFromPayments(club.payments, {
    member: (id) => club.members.find((m) => m.id === id)?.name ?? id,
    plan: (id) => club.plans.find((p) => p.id === id)?.name ?? id,
  });
  return { entries: [...ledger, ...fromPayments], club };
}
