/**
 * Consent forms (Google Forms owned by the crew). The answers live in Google
 * Forms; the site only sends people there and, for members, records that they
 * confirmed submitting it (Members.member_consent_at).
 * Operators can swap a form without a deploy via the Settings tab
 * (consent_daily_url / consent_member_url).
 */
export const CONSENT_DEFAULTS = {
  daily: "https://forms.gle/voZyWWAKs8gUAv949",
  member: "https://forms.gle/m1ZoK1xUvmktA1kT7",
} as const;

export interface ConsentLinks {
  daily: string;
  member: string;
}

export function consentUrl(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}
