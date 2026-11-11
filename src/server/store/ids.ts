import { toDateKey } from "@/lib/dates";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

/** Human-readable unique id, e.g. "PAY-261111-K7QM". Never a row number. */
export function newId(prefix: string, now = Date.now(), length = 5): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  const random = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${prefix}-${toDateKey(now).slice(2).replace(/-/g, "")}-${random}`;
}

/** ISO timestamp with the Seoul offset, as stored in the sheet. */
export function seoulIso(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000).toISOString();
  return `${d.slice(0, 19)}+09:00`;
}
