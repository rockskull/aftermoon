import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/server/auth/google";
import { expiredCookie, OAUTH_COOKIE, safeReturnTo, sessionCookie, verifyToken } from "@/server/auth/session";
import { parsePrivate } from "@/server/domain/model";
import { readTables } from "@/server/store";

interface OAuthState {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
    res.cookies.set(OAUTH_COOKIE, "", expiredCookie);
    return res;
  };

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("denied");

  const saved = await verifyToken<OAuthState>(request.cookies.get(OAUTH_COOKIE)?.value);
  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) return fail("state");

  try {
    const identity = await exchangeCode({ origin, code, verifier: saved.verifier, nonce: saved.nonce });

    // Role is only a display hint here; every protected page/action re-checks the Members sheet.
    let roleHint: string | undefined;
    try {
      const club = parsePrivate(await readTables(["Members"], { fresh: true }));
      roleHint = club.members.find((m) => m.email === identity.email)?.role;
    } catch {
      roleHint = undefined;
    }

    const session = await sessionCookie({
      email: identity.email,
      name: identity.name,
      picture: identity.picture,
      via: "google",
      roleHint,
    });
    const res = NextResponse.redirect(new URL(safeReturnTo(saved.returnTo), origin));
    res.cookies.set(session.name, session.value, session.options);
    res.cookies.set(OAUTH_COOKIE, "", expiredCookie);
    return res;
  } catch (error) {
    console.error("[auth] Google sign-in failed:", error);
    return fail("google");
  }
}
