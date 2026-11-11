import "server-only";
import { CONSENT_DEFAULTS, type ConsentLinks } from "@/lib/consent";
import { toSettings } from "./domain/model";
import { readTables, storeMode } from "./store";

/** Consent form links: Settings overrides when the sheet is reachable, otherwise the defaults. */
export async function getConsentLinks(): Promise<ConsentLinks> {
  if (storeMode() === "unconfigured") return { ...CONSENT_DEFAULTS };
  try {
    return toSettings((await readTables(["Settings"])).Settings).consent;
  } catch {
    return { ...CONSENT_DEFAULTS };
  }
}
