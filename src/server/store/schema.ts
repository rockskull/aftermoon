/**
 * Google Sheets layout: one spreadsheet, one tab per table, header row first.
 * apps-script/Code.gs mirrors these names (setupSheets creates the tabs).
 * The first column is the table's id column.
 */
export const TABLES = {
  Members: [
    "member_id",
    "name",
    "email",
    "depositor_name",
    "role",
    "status",
    "applied_at",
    "joined_at",
    "member_consent_at",
    "memo",
  ],
  Plans: ["plan_id", "name", "price", "duration_months", "bonus_months", "active", "sort_order", "description"],
  Payments: [
    "payment_id",
    "member_id",
    "depositor_name",
    "amount",
    "joining_fee",
    "plan_id",
    "status",
    "requested_at",
    "requested_start",
    "deposited_at",
    "bank_transaction_id",
    "approved_by",
    "approved_at",
    "note",
  ],
  Memberships: [
    "membership_id",
    "member_id",
    "plan_id",
    "start_date",
    "end_date",
    "status",
    "source_payment_id",
    "created_at",
    "updated_at",
    "note",
  ],
  Notifications: [
    "notification_id",
    "member_id",
    "type",
    "title",
    "body",
    "url",
    "scheduled_at",
    "sent_at",
    "status",
    "attempts",
    "last_error",
    "deduplication_key",
    "created_at",
    "read_at",
  ],
  PushSubscriptions: [
    "subscription_id",
    "member_id",
    "endpoint",
    "p256dh",
    "auth",
    "user_agent",
    "status",
    "created_at",
    "last_success_at",
    "failure_count",
  ],
  NotificationPrefs: ["member_id", "membership", "events", "operator", "updated_at"],
  EventWatch: ["event_id", "fingerprint", "status", "first_seen_at", "updated_at"],
  AuditLog: ["log_id", "commit_id", "actor_id", "action", "target_id", "before_value", "after_value", "created_at"],
  Settings: ["key", "value", "description"],
  // v0.1 tables (read by the public feed / written by the proposal form)
  Events: [
    "event_id",
    "title",
    "short_title",
    "description",
    "category",
    "start_at",
    "end_at",
    "registration_open",
    "registration_close",
    "capacity",
    "public_fee",
    "registration_url",
    "host",
    "audience",
    "location",
    "notes",
    "visibility",
    "status",
    "updated_at",
  ],
  Proposals: [
    "proposal_id",
    "submitted_at",
    "proposer",
    "contact",
    "event_title",
    "description",
    "experience",
    "preferred_date",
    "date_flexible",
    "estimated_duration",
    "audience",
    "expected_attendance",
    "free_ok",
    "desired_fee",
    "fee_unit",
    "estimated_cost",
    "requirements",
    "staff_support",
    "other_requests",
    "review_status",
    "review_notes",
  ],
} as const;

export type TableName = keyof typeof TABLES;
export type Cell = string | number | boolean;
export type Row = Record<string, Cell>;
export type Tables = Partial<Record<TableName, Row[]>>;

export function idColumn(table: TableName): string {
  return TABLES[table][0];
}

/** Every value is compared as a string, exactly like Apps Script does. */
export function cellText(v: Cell | undefined | null): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

/** Tables the private member/admin area reads. */
export const PRIVATE_TABLES: TableName[] = [
  "Members",
  "Plans",
  "Payments",
  "Memberships",
  "Notifications",
  "PushSubscriptions",
  "NotificationPrefs",
  "Settings",
];
