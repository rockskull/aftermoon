import "server-only";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { storeMode } from "../store";

/**
 * Session = a signed JWT in an httpOnly cookie. It only says *who* signed in
 * (their verified Google email). What they may do is looked up in the Members
 * sheet on every request (see viewer.ts), so role changes apply immediately.
 */

export interface SessionClaims {
  email: string;
  name: string;
  picture?: string;
  /** "google" or "demo" */
  via: "google" | "demo";
  /** Display hint only (nav). Never used for authorization. */
  roleHint?: string;
}

const SESSION_DAYS = 30;
const secure = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = secure ? "__Host-acm_session" : "acm_session";
export const OAUTH_COOKIE = secure ? "__Host-acm_oauth" : "acm_oauth";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 32) return new TextEncoder().encode(secret);
  // Demo sessions only ever reach in-memory sample data, so a built-in key is acceptable there.
  // With the real sheet connected, a proper AUTH_SECRET is mandatory.
  if (process.env.NODE_ENV === "production" && storeMode() !== "demo") {
    throw new Error("AUTH_SECRET (32+ characters) must be set in production.");
  }
  return new TextEncoder().encode("demo-only-after-moon-session-secret-not-for-real-data");
}

export async function signToken(payload: JWTPayload, maxAgeSeconds: number): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export async function verifyToken<T>(token: string | undefined): Promise<(T & JWTPayload) | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload as T & JWTPayload;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: maxAgeSeconds };
}

/** Deleting a __Host- cookie needs the same Secure/Path attributes, so expire it explicitly. */
export const expiredCookie = cookieOptions(0);

/** The session cookie to set on a response. */
export async function sessionCookie(claims: SessionClaims) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const value = await signToken({ ...claims }, maxAge);
  return { name: SESSION_COOKIE, value, options: cookieOptions(maxAge) };
}

export async function readSession(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifyToken<SessionClaims>(token);
  if (!payload?.email) return null;
  return { email: payload.email, name: payload.name, picture: payload.picture, via: payload.via, roleHint: payload.roleHint };
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/me";
  return value;
}
