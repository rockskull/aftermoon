import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo, sessionCookie } from "@/server/auth/session";
import { parsePrivate } from "@/server/domain/model";
import { readTables, storeMode } from "@/server/store";
import { DEMO_ACCOUNTS } from "@/server/store/memory";

/** Demo sign-in for local development / DEMO_MODE previews only. Never available with the real sheet. */
export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (storeMode() !== "demo") return NextResponse.redirect(new URL("/login?error=unavailable", origin), 303);

  const form = await request.formData();
  const email = String(form.get("email") ?? "").toLowerCase();
  if (!DEMO_ACCOUNTS.some((a) => a.email === email)) return NextResponse.redirect(new URL("/login?error=state", origin), 303);

  const member = parsePrivate(await readTables(["Members"])).members.find((m) => m.email === email);
  const session = await sessionCookie({ email, name: member?.name ?? "새 방문자", via: "demo", roleHint: member?.role });
  const res = NextResponse.redirect(new URL(safeReturnTo(String(form.get("returnTo") ?? "")), origin), 303);
  res.cookies.set(session.name, session.value, session.options);
  return res;
}
