"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, buttonPrimary, buttonSecondary, cn } from "@/components/ui";
import { submitProposal } from "./actions";
import { initialProposalState, MAX_FEE, TEXT_FIELDS, type ProposalField } from "./proposal";

/** Remounting with a new key gives a fresh form after "send another idea". */
export function ProposalForm() {
  const [round, setRound] = useState(0);
  return <ProposalFormRound key={round} onAnother={() => setRound((r) => r + 1)} />;
}

const FIELDS_WITH_HINT = new Set<ProposalField>(["contact"]);

const inputClass =
  "block w-full rounded-md border-2 border-midnight/25 bg-ivory px-3.5 py-3 text-[16px] leading-snug text-midnight placeholder:text-ink-soft/55 transition-colors focus:border-midnight focus:outline-none aria-[invalid=true]:border-brown";

function ProposalFormRound({ onAnother }: { onAnother: () => void }) {
  const [state, formAction, pending] = useActionState(submitProposal, initialProposalState);
  const values = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status !== "idle") {
      resultRef.current?.focus();
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [state]);

  if (state.status === "success") {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        className="scroll-mt-6 rounded-lg border-2 border-midnight bg-ivory p-6 shadow-[4px_4px_0_0_var(--color-midnight)] outline-none md:p-8"
      >
        <p className="font-label text-[11px] font-medium uppercase tracking-[0.32em] text-brown">Idea received</p>
        <h2 className="mt-2 font-display text-[40px] font-extrabold uppercase leading-[0.9] text-midnight">
          Thank you!
        </h2>
        <p className="mt-4 text-[17px] font-bold leading-relaxed text-midnight">아이디어가 접수되었습니다.</p>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
          운영진 검토 후 진행 가능 여부와 조건을 안내합니다. 제출했다고 이벤트가 자동으로 확정되지는 않아요.
        </p>
        {state.dryRun && (
          <p className="mt-4 rounded-md border border-dashed border-brown/50 px-3 py-2 text-[13px] text-brown">
            데모 모드라 운영진에게 실제로 전달되지는 않았어요(연락처는 저장하지 않았어요). 급한 제안은 운영진에게 직접 알려 주세요.
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/#calendar" className={buttonPrimary}>
            Back to calendar
            <ArrowRight />
          </Link>
          <button type="button" onClick={onAnother} className={buttonSecondary}>
            Send another idea
          </button>
        </div>
      </div>
    );
  }

  const field = (name: ProposalField) => ({
    id: name,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby":
      [errors[name] && `${name}-error`, FIELDS_WITH_HINT.has(name) && `${name}-hint`].filter(Boolean).join(" ") ||
      undefined,
  });
  const text = (name: keyof typeof TEXT_FIELDS) => ({
    ...field(name),
    defaultValue: values[name] ?? "",
    maxLength: TEXT_FIELDS[name].max,
    required: TEXT_FIELDS[name].required,
  });

  return (
    <form action={formAction} className="relative flex flex-col gap-12">
      {state.status === "error" && (
        <div
          ref={resultRef}
          tabIndex={-1}
          role="alert"
          className="scroll-mt-6 rounded-md border-2 border-brown bg-ivory px-4 py-3 text-[15px] font-medium text-brown outline-none"
        >
          {state.message}
        </div>
      )}

      {/* Honeypot for bots; hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <FormSection number="01" title="누가 제안하나요?">
        <Field name="proposer" label="이름 또는 닉네임" required error={errors.proposer}>
          <input {...text("proposer")} type="text" autoComplete="nickname" className={inputClass} />
        </Field>
        <Field
          name="contact"
          label="연락처"
          required
          hint="카카오톡 ID, 전화번호, 이메일 등 운영진이 연락할 수 있는 방법"
          error={errors.contact}
        >
          <input {...text("contact")} type="text" autoComplete="off" className={inputClass} />
        </Field>
      </FormSection>

      <FormSection number="02" title="어떤 걸 해보고 싶나요?">
        <Field name="event_title" label="이벤트 이름" required error={errors.event_title}>
          <input
            {...text("event_title")}
            type="text"
            placeholder="예: 비 오는 날 LP 감상회"
            className={inputClass}
          />
        </Field>
        <Field name="description" label="대략적인 내용" required error={errors.description}>
          <textarea
            {...text("description")}
            rows={5}
            placeholder="무엇을, 어떤 순서로 해보고 싶은지 편하게 적어 주세요."
            className={inputClass}
          />
        </Field>
        <Field name="experience" label="어떤 경험을 함께 하고 싶은지" error={errors.experience}>
          <textarea
            {...text("experience")}
            rows={3}
            placeholder="예: 서로의 취향을 알아가는 느슨한 저녁"
            className={inputClass}
          />
        </Field>
      </FormSection>

      <FormSection number="03" title="언제, 얼마나 진행할까요?">
        <Field name="preferred_date" label="희망 날짜" error={errors.preferred_date}>
          <input
            {...text("preferred_date")}
            type="text"
            placeholder="예: 12/13(토) 저녁, 또는 12월 중 평일"
            className={inputClass}
          />
        </Field>
        <Field name="estimated_duration" label="예상 소요 시간" error={errors.estimated_duration}>
          <input {...text("estimated_duration")} type="text" placeholder="예: 2시간" className={inputClass} />
        </Field>
        <ChoiceGroup legend="날짜 협의 가능 여부">
          <Choice type="radio" name="date_flexible" value="yes" defaultChecked={(values.date_flexible || "yes") === "yes"}>
            협의 가능해요
          </Choice>
          <Choice type="radio" name="date_flexible" value="no" defaultChecked={values.date_flexible === "no"}>
            이 날짜만 가능해요
          </Choice>
        </ChoiceGroup>
      </FormSection>

      <FormSection number="04" title="누가, 몇 명 정도 참여하면 좋을까요?">
        <Field name="audience" label="참가 대상" error={errors.audience}>
          <input
            {...text("audience")}
            type="text"
            placeholder="예: 멤버 누구나, 초보 환영"
            className={inputClass}
          />
        </Field>
        <Field name="expected_attendance" label="희망 인원" error={errors.expected_attendance}>
          <input
            {...text("expected_attendance")}
            type="text"
            inputMode="text"
            placeholder="예: 6~8명"
            className={inputClass}
          />
        </Field>
      </FormSection>

      <FormSection
        number="05"
        title="얼마를 받고 싶나요?"
        description="희망 참가비는 참고용이에요. 실제 공지되는 참가비는 운영진과 협의해서 정해요."
      >
        <ChoiceGroup legend="무료 진행">
          <Choice type="checkbox" name="free_ok" defaultChecked={values.free_ok === "on"}>
            무료로 진행해도 괜찮아요
          </Choice>
        </ChoiceGroup>
        <Field name="desired_fee" label="희망 참가비" error={errors.desired_fee}>
          <div className="relative">
            <input
              {...field("desired_fee")}
              defaultValue={values.desired_fee ?? ""}
              type="text"
              inputMode="numeric"
              pattern="[0-9,]*"
              maxLength={String(MAX_FEE).length + 3}
              placeholder="예: 10000"
              className={cn(inputClass, "pr-10")}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[15px] text-ink-soft">
              원
            </span>
          </div>
        </Field>
        <ChoiceGroup legend="금액 단위" error={errors.fee_unit}>
          <Choice type="radio" name="fee_unit" value="per_person" defaultChecked={(values.fee_unit || "per_person") === "per_person"}>
            1인당
          </Choice>
          <Choice type="radio" name="fee_unit" value="total" defaultChecked={values.fee_unit === "total"}>
            전체
          </Choice>
        </ChoiceGroup>
        <Field name="estimated_cost" label="예상 비용 또는 금액 산정 이유" error={errors.estimated_cost}>
          <textarea
            {...text("estimated_cost")}
            rows={3}
            placeholder="예: 재료비 1인 5,000원, 음료 준비"
            className={inputClass}
          />
        </Field>
      </FormSection>

      <FormSection number="06" title="무엇이 필요한가요?">
        <Field name="requirements" label="공간 및 장비" error={errors.requirements}>
          <textarea
            {...text("requirements")}
            rows={3}
            placeholder="예: 빔프로젝터, 스피커, 테이블 2개"
            className={inputClass}
          />
        </Field>
        <Field name="staff_support" label="운영진 협조 사항" error={errors.staff_support}>
          <textarea {...text("staff_support")} rows={3} className={inputClass} />
        </Field>
        <Field name="other_requests" label="기타 요청" error={errors.other_requests}>
          <textarea {...text("other_requests")} rows={3} className={inputClass} />
        </Field>
      </FormSection>

      <div className="flex flex-col gap-5 border-t-2 border-midnight pt-8">
        <div>
          <label className="flex cursor-pointer items-start gap-3 text-[15px] text-midnight">
            <input
              type="checkbox"
              name="consent"
              required
              defaultChecked={values.consent === "on"}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby="consent-hint"
              className="mt-0.5 size-5 shrink-0 accent-midnight"
            />
            <span className="font-medium">개인정보 수집·이용에 동의합니다. (필수)</span>
          </label>
          <p id="consent-hint" className="mt-1.5 pl-8 text-[13px] leading-relaxed text-ink-soft">
            이름(닉네임)과 연락처는 제안 검토와 연락을 위해서만 운영진이 확인하며, 사이트에 공개되지 않아요.
          </p>
          {errors.consent && <p className="mt-1.5 pl-8 text-[13px] font-medium text-brown">{errors.consent}</p>}
        </div>

        <button type="submit" disabled={pending} className={cn(buttonPrimary, "w-full disabled:opacity-60 sm:w-72")}>
          {pending ? "Sending…" : "Send my idea"}
        </button>
      </div>
    </form>
  );
}

function FormSection({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = `section-${number}`;
  return (
    <fieldset aria-labelledby={id} className="min-w-0">
      <div className="flex items-baseline gap-3 border-b-2 border-midnight pb-2">
        <span className="font-mono text-[13px] font-semibold text-brown">{number}</span>
        <h2 id={id} className="text-[20px] font-extrabold leading-snug text-midnight">
          {title}
        </h2>
      </div>
      {description && <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{description}</p>}
      <div className="mt-5 flex flex-col gap-6">{children}</div>
    </fieldset>
  );
}

function Field({
  name,
  label,
  hint,
  required,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="flex items-baseline gap-2 text-[15px] font-semibold text-midnight">
        {label}
        {required && <span className="text-[12px] font-medium text-brown">필수</span>}
      </label>
      {hint && (
        <p id={`${name}-hint`} className="mt-1 text-[13px] text-ink-soft">
          {hint}
        </p>
      )}
      <div className="mt-2">{children}</div>
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-[13px] font-medium text-brown">
          {error}
        </p>
      )}
    </div>
  );
}

function ChoiceGroup({ legend, error, children }: { legend: string; error?: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="text-[15px] font-semibold text-midnight">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
      {error && <p className="mt-1.5 text-[13px] font-medium text-brown">{error}</p>}
    </fieldset>
  );
}

function Choice({
  type,
  name,
  value,
  defaultChecked,
  children,
}: {
  type: "radio" | "checkbox";
  name: string;
  value?: string;
  defaultChecked?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-md border-2 border-midnight/25 bg-ivory px-4 text-[15px] text-midnight has-[:checked]:border-midnight has-[:checked]:bg-butter-200/60">
      <input type={type} name={name} value={value} defaultChecked={defaultChecked} className="size-[18px] accent-midnight" />
      {children}
    </label>
  );
}
