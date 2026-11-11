"use server";

import { updateTag } from "next/cache";
import { after } from "next/server";
import { NEEDS, planProposal } from "@/server/domain/operations";
import { deliverDue } from "@/server/notify";
import { PRIVATE_TAG, runCommit, storeMode } from "@/server/store";
import { parseProposal, type ProposalFormState } from "./proposal";

/** What the visitor typed, so a failed submission never wipes the form. */
function echo(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/**
 * Saves a proposal to the private "Proposals" tab (through the same locked
 * commit path as everything else) and lets the operators know. Nothing in a
 * proposal is ever published; the public feed only reads Events / Enrollment.
 */
export async function submitProposal(_prev: ProposalFormState, formData: FormData): Promise<ProposalFormState> {
  // Honeypot: real visitors never see or fill this field.
  const honeypot = formData.get("website");
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return { status: "success" };
  }

  const parsed = parseProposal(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "입력 내용을 한 번 더 확인해 주세요.",
      fieldErrors: parsed.fieldErrors,
      values: parsed.values,
    };
  }

  if (storeMode() === "unconfigured") {
    console.error("[proposal] CLUB_API_URL or CLUB_API_SECRET is not configured");
    return { status: "error", message: "지금은 제안을 받을 수 없어요. 운영진에게 직접 알려 주세요.", values: echo(formData) };
  }

  try {
    const outcome = await runCommit(NEEDS.proposalSubmit, (data) =>
      planProposal(data, { now: Date.now(), actorId: "visitor", payload: { ...parsed.data } }),
    );
    if (!outcome.ok) throw new Error(outcome.message);
    updateTag(PRIVATE_TAG);
    after(() => deliverDue(Date.now()).catch((e) => console.error("[notify] immediate delivery failed", e)));
    return { status: "success", dryRun: storeMode() === "demo" };
  } catch (error) {
    console.error("[proposal] could not save the proposal:", error);
    return { status: "error", message: "전송 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.", values: echo(formData) };
  }
}
