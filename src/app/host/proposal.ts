/**
 * Event proposal form: field rules shared by the form (client) and the
 * server action. Kept free of server-only code so both sides can import it.
 */

export const TEXT_FIELDS = {
  proposer: { label: "이름 또는 닉네임", max: 40, required: true },
  contact: { label: "연락처", max: 100, required: true },
  event_title: { label: "이벤트 이름", max: 80, required: true },
  description: { label: "대략적인 내용", max: 2000, required: true },
  experience: { label: "함께 하고 싶은 경험", max: 1000, required: false },
  preferred_date: { label: "희망 날짜", max: 100, required: false },
  estimated_duration: { label: "예상 소요 시간", max: 50, required: false },
  audience: { label: "참가 대상", max: 200, required: false },
  expected_attendance: { label: "희망 인원", max: 50, required: false },
  estimated_cost: { label: "예상 비용 또는 금액 산정 이유", max: 1000, required: false },
  requirements: { label: "공간 및 장비", max: 1000, required: false },
  staff_support: { label: "운영진 협조 사항", max: 1000, required: false },
  other_requests: { label: "기타 요청", max: 1000, required: false },
} as const;

export type TextField = keyof typeof TEXT_FIELDS;
export type ProposalField = TextField | "date_flexible" | "free_ok" | "desired_fee" | "fee_unit" | "consent";

export const MAX_FEE = 10_000_000;

/** What is sent to the private Proposals sheet. Column names match the sheet header row. */
export interface ProposalPayload extends Record<TextField, string> {
  date_flexible: "협의 가능" | "고정";
  free_ok: "가능" | "";
  desired_fee: number | "";
  fee_unit: "1인당" | "전체" | "";
}

export interface ProposalFormState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<ProposalField, string>>;
  /** Echoed back on error so the visitor never loses what they typed. */
  values?: Record<string, string>;
  /** Demo mode: saved to the in-memory demo store instead of the sheet. */
  dryRun?: boolean;
}

export const initialProposalState: ProposalFormState = { status: "idle" };

type ParseResult =
  | { ok: true; data: ProposalPayload }
  | { ok: false; fieldErrors: Partial<Record<ProposalField, string>>; values: Record<string, string> };

function read(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function parseProposal(formData: FormData): ParseResult {
  const fieldErrors: Partial<Record<ProposalField, string>> = {};
  const values: Record<string, string> = {};
  const text = {} as Record<TextField, string>;

  for (const [name, rule] of Object.entries(TEXT_FIELDS) as Array<[TextField, (typeof TEXT_FIELDS)[TextField]]>) {
    const value = read(formData, name).replace(/\r\n/g, "\n");
    values[name] = value;
    if (rule.required && !value) fieldErrors[name] = `${rule.label}을(를) 적어 주세요.`;
    else if (value.length > rule.max) fieldErrors[name] = `${rule.max}자 이내로 적어 주세요.`;
    text[name] = value.slice(0, rule.max);
  }

  const dateFlexible = read(formData, "date_flexible");
  const freeOk = read(formData, "free_ok") === "on";
  const feeUnit = read(formData, "fee_unit");
  const feeRaw = read(formData, "desired_fee").replace(/[,\s원]/g, "");
  const consent = read(formData, "consent") === "on";
  Object.assign(values, {
    date_flexible: dateFlexible,
    free_ok: freeOk ? "on" : "",
    fee_unit: feeUnit,
    desired_fee: read(formData, "desired_fee"),
    consent: consent ? "on" : "",
  });

  let desiredFee: number | "" = "";
  if (feeRaw) {
    const n = Number(feeRaw);
    if (!Number.isInteger(n) || n < 0 || n > MAX_FEE) fieldErrors.desired_fee = "금액은 숫자로만 적어 주세요.";
    else desiredFee = n;
  }
  if (feeUnit && feeUnit !== "per_person" && feeUnit !== "total") fieldErrors.fee_unit = "금액 단위를 골라 주세요.";
  if (!consent) fieldErrors.consent = "개인정보 수집·이용에 동의해야 제출할 수 있어요.";

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors, values };

  return {
    ok: true,
    data: {
      ...text,
      date_flexible: dateFlexible === "no" ? "고정" : "협의 가능",
      free_ok: freeOk ? "가능" : "",
      desired_fee: desiredFee,
      fee_unit: desiredFee === "" ? "" : feeUnit === "total" ? "전체" : "1인당",
    },
  };
}
