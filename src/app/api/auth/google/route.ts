import { NextResponse, type NextRequest } from "next/server";
import { authorizationUrl, googleConfigured, randomToken } from "@/server/auth/google";
import { cookieOptions, OAUTH_COOKIE, safeReturnTo, signToken } from "@/server/auth/session";

/** Starts Google sign-in: remembers state/nonce/PKCE verifier in a short-lived signed cookie. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  if (!googleConfigured()) return NextResponse.redirect(new URL("/login?error=unavailable", origin));

  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));

  const response = NextResponse.redirect(await authorizationUrl({ origin, state, nonce, verifier }));
  response.cookies.set(OAUTH_COOKIE, await signToken({ state, nonce, verifier, returnTo }, 600), cookieOptions(600));
  return response;
}
