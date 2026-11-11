import { NextResponse, type NextRequest } from "next/server";
import { expiredCookie, SESSION_COOKIE } from "@/server/auth/session";

export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
  res.cookies.set(SESSION_COOKIE, "", expiredCookie);
  return res;
}
