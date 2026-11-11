import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

/** Google OpenID Connect (authorization code + PKCE). No client library needed. */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function redirectUri(origin: string): string {
  return `${process.env.AUTH_URL ?? origin}/api/auth/callback/google`;
}

export async function authorizationUrl(args: { origin: string; state: string; nonce: string; verifier: string }): Promise<string> {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(args.origin),
    response_type: "code",
    scope: "openid email profile",
    state: args.state,
    nonce: args.nonce,
    code_challenge: await pkceChallenge(args.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export interface GoogleIdentity {
  email: string;
  name: string;
  picture?: string;
}

export async function exchangeCode(args: { origin: string; code: string; verifier: string; nonce: string }): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: args.code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(args.origin),
      grant_type: "authorization_code",
      code_verifier: args.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => null)) as { id_token?: string; error?: string } | null;
  if (!res.ok || !body?.id_token) throw new Error(`Google token exchange failed: ${body?.error ?? res.status}`);

  const { payload } = await jwtVerify(body.id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: process.env.GOOGLE_CLIENT_ID!,
  });
  if (payload.nonce !== args.nonce) throw new Error("Google id_token nonce mismatch");
  if (payload.email_verified !== true || typeof payload.email !== "string") throw new Error("Google account email is not verified");

  return {
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : payload.email.split("@")[0],
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}
