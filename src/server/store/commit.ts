import { cellText, idColumn, TABLES, type Cell, type Row, type TableName, type Tables } from "./schema";

/**
 * A commit is a small "transaction" for Google Sheets, which has none.
 *
 * Apps Script applies it inside LockService.getScriptLock(), so commits never
 * interleave:
 *   1. if AuditLog already has this commit id → it was applied before (a retry): no-op
 *   2. every check is re-verified against the live sheet → otherwise "conflict"
 *   3. every op is validated before anything is written → otherwise "invalid"
 *   4. ops are written in order
 *
 * The same semantics are implemented in TypeScript below (memory store for local
 * development and tests) and in apps-script/Code.gs (production).
 */

export type Check =
  /** Row with this id exists; listed fields equal the value (or one of the values). */
  | { type: "exists"; table: TableName; id: string; fields?: Record<string, string | string[]> }
  /** No row has all of these field values. */
  | { type: "absent"; table: TableName; where: Record<string, string> }
  /** The rows matching `where` are exactly these ids, with these field values. */
  | { type: "snapshot"; table: TableName; where: Record<string, string>; rows: Record<string, Record<string, string>> };

export type Op =
  | { type: "append"; table: TableName; row: Row }
  | { type: "update"; table: TableName; id: string; set: Row };

export interface Commit {
  /** Unique per logical action; retries reuse it. Stored in AuditLog.commit_id. */
  id: string;
  checks: Check[];
  ops: Op[];
}

export type CommitResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; error: "conflict" | "invalid"; detail: string };

function matches(row: Row, where: Record<string, string>): boolean {
  return Object.entries(where).every(([k, v]) => cellText(row[k]) === v);
}

function fieldsEqual(row: Row, fields: Record<string, string | string[]>): string | null {
  for (const [k, expected] of Object.entries(fields)) {
    const actual = cellText(row[k]);
    const ok = Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    if (!ok) return `${k}=${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`;
  }
  return null;
}

export function verifyCheck(tables: Tables, check: Check): string | null {
  const rows = tables[check.table] ?? [];
  const key = idColumn(check.table);
  switch (check.type) {
    case "exists": {
      const row = rows.find((r) => cellText(r[key]) === check.id);
      if (!row) return `${check.table} ${check.id} not found`;
      const diff = check.fields ? fieldsEqual(row, check.fields) : null;
      return diff ? `${check.table} ${check.id}: ${diff}` : null;
    }
    case "absent":
      return rows.some((r) => matches(r, check.where)) ? `${check.table} already has ${JSON.stringify(check.where)}` : null;
    case "snapshot": {
      const current = rows.filter((r) => matches(r, check.where));
      const expectedIds = Object.keys(check.rows).sort();
      const actualIds = current.map((r) => cellText(r[key])).sort();
      if (expectedIds.join("|") !== actualIds.join("|")) return `${check.table} changed for ${JSON.stringify(check.where)}`;
      for (const row of current) {
        const diff = fieldsEqual(row, check.rows[cellText(row[key])]);
        if (diff) return `${check.table} ${cellText(row[key])}: ${diff}`;
      }
      return null;
    }
  }
}

export function validateOp(tables: Tables, op: Op): string | null {
  const headers: readonly string[] = TABLES[op.table];
  if (!headers) return `unknown table ${op.table}`;
  const fields = Object.keys(op.type === "append" ? op.row : op.set);
  const unknown = fields.filter((f) => !headers.includes(f));
  if (unknown.length) return `${op.table}: unknown columns ${unknown.join(", ")}`;
  const key = idColumn(op.table);
  if (op.type === "append") {
    const id = cellText(op.row[key]);
    if (!id) return `${op.table}: append without ${key}`;
    if ((tables[op.table] ?? []).some((r) => cellText(r[key]) === id)) return `${op.table} ${id} already exists`;
  } else if (!(tables[op.table] ?? []).some((r) => cellText(r[key]) === op.id)) {
    return `${op.table} ${op.id} not found`;
  }
  return null;
}

/** Applies a commit to in-memory tables (mutates them). Mirrors Code.gs `commit_`. */
export function applyCommit(tables: Tables, commit: Commit): CommitResult {
  if ((tables.AuditLog ?? []).some((r) => cellText(r.commit_id) === commit.id)) return { ok: true, duplicate: true };

  for (const check of commit.checks) {
    const problem = verifyCheck(tables, check);
    if (problem) return { ok: false, error: "conflict", detail: problem };
  }
  // Validate against the state as it will be when each op runs (appends can't collide with each other).
  const staged: Tables = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...(v ?? [])]]));
  for (const op of commit.ops) {
    const problem = validateOp(staged, op);
    if (problem) return { ok: false, error: "invalid", detail: problem };
    if (op.type === "append") (staged[op.table] ??= []).push(op.row);
  }

  for (const op of commit.ops) {
    const rows = (tables[op.table] ??= []);
    if (op.type === "append") {
      rows.push(Object.fromEntries(TABLES[op.table].map((h) => [h, op.row[h] ?? ""])) as Row);
    } else {
      const key = idColumn(op.table);
      const row = rows.find((r) => cellText(r[key]) === op.id)!;
      Object.assign(row, op.set);
    }
  }
  return { ok: true };
}

/** Helper: a field map for `exists`/`snapshot` checks from a row. */
export function pickText(row: Row, fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f, cellText(row[f] as Cell)]));
}
