import { addDays, toDateKey } from "@/lib/dates";
import { membershipEndDate } from "@/lib/membership";
import { applyCommit, type Commit, type CommitResult } from "./commit";
import type { Row, TableName, Tables } from "./schema";

/**
 * In-memory stand-in for the Google Sheet. Used for local development and
 * DEMO_MODE previews when CLUB_API_URL is not configured, and in tests.
 * Applies commits with exactly the same rules as the Apps Script gateway.
 */
export class MemoryStore {
  readonly kind = "memory" as const;
  constructor(public tables: Tables) {}

  async read(names: TableName[]): Promise<Tables> {
    return structuredClone(Object.fromEntries(names.map((n) => [n, this.tables[n] ?? []]))) as Tables;
  }

  async commit(commit: Commit): Promise<CommitResult> {
    return applyCommit(this.tables, structuredClone(commit));
  }
}

export const DEMO_ACCOUNTS = [
  { email: "admin@aftermoon.dev", label: "운영진 (admin)" },
  { email: "operator@aftermoon.dev", label: "운영진 (operator)" },
  { email: "hyunwoo@aftermoon.dev", label: "회원 · 이용 중" },
  { email: "jimin@aftermoon.dev", label: "회원 · 곧 만료" },
  { email: "taeo@aftermoon.dev", label: "회원 · 만료됨" },
  { email: "sua@aftermoon.dev", label: "신청자 · 입금 대기" },
  { email: "newbie@aftermoon.dev", label: "미등록 Google 계정" },
] as const;

/** Demo data relative to today so every state is visible. */
export function demoTables(now = Date.now()): Tables {
  const today = toDateKey(now);
  const day = (n: number) => addDays(today, n);
  const at = (n: number, time = "10:00") => `${day(n)}T${time}:00+09:00`;

  const member = (id: string, name: string, email: string, depositor: string, role: string, status: string, joined: string): Row => ({
    member_id: id,
    name,
    email,
    depositor_name: depositor,
    role,
    status,
    applied_at: joined ? `${joined}T09:00:00+09:00` : at(-2),
    joined_at: joined,
    // Everyone in the demo confirmed the consent form when they applied, except Taeo (registered before the site).
    member_consent_at: id === "M-DEMO-TAEO" ? "" : joined ? `${joined}T09:00:00+09:00` : at(-1, "21:05"),
    memo: "",
  });

  const membership = (id: string, memberId: string, planId: string, start: string, months: number, paymentId: string): Row => ({
    membership_id: id,
    member_id: memberId,
    plan_id: planId,
    start_date: start,
    end_date: membershipEndDate(start, months),
    status: "active",
    source_payment_id: paymentId,
    created_at: `${start}T10:00:00+09:00`,
    updated_at: `${start}T10:00:00+09:00`,
    note: "",
  });

  const approved = (id: string, memberId: string, depositor: string, amount: number, planId: string, date: string): Row => ({
    payment_id: id,
    member_id: memberId,
    depositor_name: depositor,
    amount,
    joining_fee: 0,
    plan_id: planId,
    status: "approved",
    requested_at: `${date}T09:00:00+09:00`,
    requested_start: "",
    deposited_at: date,
    bank_transaction_id: "",
    approved_by: "M-DEMO-ADMIN",
    approved_at: `${date}T12:00:00+09:00`,
    note: "",
  });

  // Jimin's 1-month membership ends in ~5 days (inside the D-7 window); Hyunwoo is mid-way
  // through 14 months; Taeo's ended about 40 days ago.
  const jiminStart = day(-25);

  return {
    Members: [
      member("M-DEMO-ADMIN", "문 운영", "admin@aftermoon.dev", "문운영", "admin", "active", "2026-01-05"),
      member("M-DEMO-OPER", "지호", "operator@aftermoon.dev", "박지호", "operator", "active", "2026-02-01"),
      member("M-DEMO-HYUNWOO", "현우", "hyunwoo@aftermoon.dev", "최현우", "member", "active", day(-120)),
      member("M-DEMO-JIMIN", "지민", "jimin@aftermoon.dev", "이지민", "member", "active", jiminStart),
      member("M-DEMO-TAEO", "태오", "taeo@aftermoon.dev", "정태오", "member", "active", day(-70)),
      member("M-DEMO-SUA", "수아", "sua@aftermoon.dev", "김수아", "member", "applicant", ""),
    ],
    Plans: [
      { plan_id: "PLAN-1M", name: "1개월", price: 80000, duration_months: 1, bonus_months: 0, active: true, sort_order: 1, description: "한 달 동안 이용" },
      { plan_id: "PLAN-6M", name: "6개월", price: 500000, duration_months: 6, bonus_months: 1, active: true, sort_order: 2, description: "6개월 + 보너스 1개월" },
      { plan_id: "PLAN-12M", name: "12개월", price: 1000000, duration_months: 12, bonus_months: 2, active: true, sort_order: 3, description: "12개월 + 보너스 2개월" },
    ],
    Payments: [
      approved("PAY-DEMO-ADMIN", "M-DEMO-ADMIN", "문운영", 1000000, "PLAN-12M", "2026-01-05"),
      approved("PAY-DEMO-OPER", "M-DEMO-OPER", "박지호", 1000000, "PLAN-12M", "2026-02-01"),
      approved("PAY-DEMO-HYUNWOO", "M-DEMO-HYUNWOO", "최현우", 1000000, "PLAN-12M", day(-120)),
      approved("PAY-DEMO-JIMIN", "M-DEMO-JIMIN", "이지민", 80000, "PLAN-1M", jiminStart),
      approved("PAY-DEMO-TAEO", "M-DEMO-TAEO", "정태오", 80000, "PLAN-1M", day(-70)),
      {
        payment_id: "PAY-DEMO-SUA",
        member_id: "M-DEMO-SUA",
        depositor_name: "김수아",
        amount: 180000, // first registration: 1개월 80,000 + 가입비 100,000
        joining_fee: 100000,
        plan_id: "PLAN-1M",
        status: "pending",
        requested_at: at(-1, "21:10"),
        requested_start: "",
        deposited_at: "",
        bank_transaction_id: "",
        approved_by: "",
        approved_at: "",
        note: "",
      },
    ],
    Memberships: [
      membership("MS-DEMO-ADMIN", "M-DEMO-ADMIN", "PLAN-12M", "2026-01-05", 14, "PAY-DEMO-ADMIN"),
      membership("MS-DEMO-OPER", "M-DEMO-OPER", "PLAN-12M", "2026-02-01", 14, "PAY-DEMO-OPER"),
      membership("MS-DEMO-HYUNWOO", "M-DEMO-HYUNWOO", "PLAN-12M", day(-120), 14, "PAY-DEMO-HYUNWOO"),
      membership("MS-DEMO-JIMIN", "M-DEMO-JIMIN", "PLAN-1M", jiminStart, 1, "PAY-DEMO-JIMIN"),
      membership("MS-DEMO-TAEO", "M-DEMO-TAEO", "PLAN-1M", day(-70), 1, "PAY-DEMO-TAEO"),
    ],
    Notifications: [
      {
        notification_id: "N-DEMO-1",
        member_id: "M-DEMO-HYUNWOO",
        type: "event_new",
        title: "새 이벤트: LP 들으며 쉬는 밤",
        body: "신청은 곧 열려요. 일정을 확인해 보세요.",
        url: "/events/sample-vinyl-night",
        scheduled_at: at(-1, "09:00"),
        sent_at: at(-1, "09:00"),
        status: "inapp",
        attempts: 0,
        last_error: "",
        deduplication_key: "event_new:sample-vinyl-night:M-DEMO-HYUNWOO",
        created_at: at(-1, "09:00"),
        read_at: "",
      },
    ],
    PushSubscriptions: [],
    NotificationPrefs: [],
    EventWatch: [],
    AuditLog: [],
    Settings: [
      { key: "bank_name", value: "카카오뱅크 모임통장", description: "입금 안내에 표시" },
      { key: "account_number", value: "3333-00-0000000", description: "입금 계좌번호 (예시)" },
      { key: "account_holder", value: "애프터문", description: "예금주" },
      { key: "deposit_notice", value: "입금자명은 신청할 때 적은 이름과 같게 보내 주세요. 운영진이 확인하면 회원권이 바로 시작돼요.", description: "입금 안내 문구" },
      { key: "sheet_url", value: "", description: "운영진용 스프레드시트 링크" },
      { key: "joining_fee", value: 100000, description: "첫 등록 가입비 (원, 0이면 없음)" },
      { key: "consent_daily_url", value: "https://forms.gle/voZyWWAKs8gUAv949", description: "일일 이용 동의서 (Google 설문)" },
      { key: "consent_member_url", value: "https://forms.gle/m1ZoK1xUvmktA1kT7", description: "회원 등록 동의서 (Google 설문)" },
    ],
    Proposals: [
      {
        proposal_id: "PR-DEMO-1",
        submitted_at: at(-2, "22:15"),
        proposer: "지민",
        contact: "카톡 jimin",
        event_title: "비 오는 날 LP 감상회",
        description: "각자 LP 한 장씩 가져와서 돌려 듣기",
        experience: "",
        preferred_date: "다음 달 둘째 주 금요일",
        date_flexible: "협의 가능",
        estimated_duration: "3시간",
        audience: "멤버 누구나",
        expected_attendance: "8명",
        free_ok: "가능",
        desired_fee: 5000,
        fee_unit: "1인당",
        estimated_cost: "음료",
        requirements: "턴테이블, 스피커",
        staff_support: "",
        other_requests: "",
        review_status: "new",
        review_notes: "",
      },
    ],
    Events: [],
  };
}

/** Shared across hot reloads in development. */
export function demoStore(): MemoryStore {
  const g = globalThis as typeof globalThis & { __afterMoonDemoStore?: MemoryStore };
  g.__afterMoonDemoStore ??= new MemoryStore(demoTables());
  return g.__afterMoonDemoStore;
}
