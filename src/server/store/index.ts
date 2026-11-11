import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { Commit, CommitResult } from "./commit";
import { demoStore } from "./memory";
import type { TableName, Tables } from "./schema";

/** Cache tag for private sheet data; invalidated after every successful commit. */
export const PRIVATE_TAG = "club-private";

export type StoreMode = "sheets" | "demo" | "unconfigured";

/**
 * - sheets:       CLUB_API_URL + CLUB_API_SECRET → the real spreadsheet via Apps Script
 * - demo:         no sheet connected yet → in-memory demo data with demo logins
 *                 (member and admin screens can be tried; nothing real is stored)
 * - unconfigured: DEMO_MODE=false without a sheet → member features show "준비 중"
 * Connecting the sheet switches demo off automatically.
 */
export function storeMode(): StoreMode {
  if (process.env.CLUB_API_URL && process.env.CLUB_API_SECRET) return "sheets";
  if (process.env.DEMO_MODE === "false") return "unconfigured";
  return "demo";
}

export class StoreUnavailableError extends Error {
  constructor() {
    super("Member data is not configured (CLUB_API_URL / CLUB_API_SECRET).");
  }
}

export class GatewayError extends Error {}

async function callGateway<T>(action: string, payload: Record<string, unknown>, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(process.env.CLUB_API_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, secret: process.env.CLUB_API_SECRET, ...payload }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as (T & { ok?: boolean; error?: string }) | null;
  if (!res.ok || !body) throw new GatewayError(`Apps Script ${action} failed (HTTP ${res.status})`);
  if (body.ok === false && body.error !== "conflict" && body.error !== "invalid") {
    throw new GatewayError(`Apps Script ${action} error: ${body.error ?? "unknown"}`);
  }
  return body;
}

async function readFromSheets(tables: TableName[]): Promise<Tables> {
  const body = await callGateway<{ tables: Tables }>("read", { tables });
  return body.tables;
}

/** Shared, short-lived cache of private tables (server-side only, never sent to other users). */
async function readFromSheetsCached(key: string): Promise<Tables> {
  "use cache: remote";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  cacheTag(PRIVATE_TAG);
  return readFromSheets(key.split(",") as TableName[]);
}

/**
 * Reads whole tables. `fresh: true` bypasses the cache; use it for anything an
 * operator acts on. Mutations re-verify against the live sheet regardless.
 */
export async function readTables(tables: TableName[], opts: { fresh?: boolean } = {}): Promise<Tables> {
  switch (storeMode()) {
    case "demo":
      return demoStore().read(tables);
    case "unconfigured":
      throw new StoreUnavailableError();
    case "sheets":
      return opts.fresh ? readFromSheets(tables) : readFromSheetsCached([...tables].sort().join(","));
  }
}

async function sendCommit(commit: Commit): Promise<CommitResult> {
  switch (storeMode()) {
    case "demo":
      return demoStore().commit(commit);
    case "unconfigured":
      throw new StoreUnavailableError();
    case "sheets":
      return callGateway<CommitResult>("commit", { commit }, 30_000);
  }
}

export type Planned = { commit: Commit; result?: unknown } | { refuse: string } | { noop: true };
export type CommitOutcome<R = unknown> = { ok: true; result?: R; duplicate?: boolean } | { ok: false; message: string };

/**
 * Optimistic transaction loop:
 *  read fresh → plan (business rules) → commit with checks under the sheet lock.
 *  - conflict (someone else changed the data): re-read and re-plan, up to 3 times
 *  - network failure: resend the same commit once; its id makes the retry a no-op
 *    if the first attempt actually landed
 */
export async function runCommit<R = unknown>(
  tables: TableName[],
  plan: (data: Tables) => Planned,
): Promise<CommitOutcome<R>> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await readTables(tables, { fresh: true });
    const planned = plan(data);
    if ("noop" in planned) return { ok: true };
    if ("refuse" in planned) return { ok: false, message: planned.refuse };

    let result: CommitResult;
    try {
      result = await sendCommit(planned.commit);
    } catch (error) {
      console.error("[store] commit failed, retrying once with the same id", error);
      try {
        result = await sendCommit(planned.commit);
      } catch (retryError) {
        console.error("[store] commit retry failed", retryError);
        return { ok: false, message: "시트에 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
      }
    }

    if (result.ok) return { ok: true, result: planned.result as R, duplicate: result.duplicate };
    if (result.error === "invalid") {
      console.error("[store] invalid commit", result.detail, planned.commit);
      return { ok: false, message: "저장할 수 없는 변경이에요. 운영진에게 알려 주세요." };
    }
    console.warn(`[store] conflict (attempt ${attempt + 1}): ${result.detail}`);
  }
  return { ok: false, message: "다른 변경과 겹쳤어요. 새로고침 후 다시 시도해 주세요." };
}
