import "server-only";
import { notFound, redirect } from "next/navigation";
import { parsePrivate, type ClubPrivate, type Member } from "../domain/model";
import { PRIVATE_TABLES } from "../store/schema";
import { readTables, storeMode, StoreUnavailableError } from "../store";
import { googleConfigured } from "./google";
import { readSession, type SessionClaims } from "./session";

export interface Viewer {
  session: SessionClaims;
  /** null = signed in with Google but not (yet) in the Members sheet. */
  member: Member | null;
  club: ClubPrivate;
}

export function loginAvailable(): { google: boolean; demo: boolean } {
  return { google: googleConfigured(), demo: storeMode() === "demo" };
}

/**
 * Who is looking, resolved against the Members sheet on every request.
 * Returns null when signed out. Authorization never trusts the cookie alone.
 */
export async function getViewer(opts: { fresh?: boolean } = {}): Promise<Viewer | null> {
  const session = await readSession();
  if (!session) return null;
  const club = parsePrivate(await readTables(PRIVATE_TABLES, opts));
  const member = club.members.find((m) => m.email === session.email.toLowerCase()) ?? null;
  return { session, member, club };
}

/** For pages: signed-in viewer or a redirect to /login. */
export async function requireViewer(returnTo: string, opts: { fresh?: boolean } = {}): Promise<Viewer> {
  const viewer = await getViewer(opts);
  if (!viewer) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return viewer;
}

export function isOperator(member: Member | null): member is Member {
  return Boolean(member && member.status === "active" && (member.role === "operator" || member.role === "admin"));
}

/** For admin pages: an active operator/admin. Everyone else gets a 404, so the area's existence isn't revealed. */
export async function requireOperator(returnTo = "/admin"): Promise<Viewer & { member: Member }> {
  const viewer = await getViewer({ fresh: true });
  if (!viewer) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  if (!isOperator(viewer.member)) notFound();
  return viewer as Viewer & { member: Member };
}

/** For server actions: re-checks the role against the live sheet; null when not allowed. */
export async function operatorForAction(): Promise<(Viewer & { member: Member }) | null> {
  const viewer = await getViewer({ fresh: true });
  return viewer && isOperator(viewer.member) ? (viewer as Viewer & { member: Member }) : null;
}

export { StoreUnavailableError };
