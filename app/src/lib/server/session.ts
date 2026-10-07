// session.ts — the web equivalent of KeychainManager.
//
// The backend's Supabase access + refresh tokens live in httpOnly cookies so
// browser JavaScript can never read them. Every /api/backend/* call runs on
// the Next.js server, which attaches the token (and the secret x-api-key).
import "server-only";
import { cookies } from "next/headers";
import { serverConfig } from "./config";

export const ACCESS_COOKIE = "insight_at";
export const REFRESH_COOKIE = "insight_rt";

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: serverConfig.cookieSecure,
};

export async function readSession(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
  const jar = await cookies();
  return {
    accessToken: jar.get(ACCESS_COOKIE)?.value ?? null,
    refreshToken: jar.get(REFRESH_COOKIE)?.value ?? null,
  };
}

export async function writeSession(accessToken: string, refreshToken: string | null): Promise<void> {
  const jar = await cookies();
  // Access tokens expire in ~1h; the cookie outlives it so a refresh can
  // happen on the next request (30 days, like a remembered device).
  jar.set(ACCESS_COOKIE, accessToken, { ...baseCookie, maxAge: 60 * 60 * 24 * 30 });
  if (refreshToken) {
    jar.set(REFRESH_COOKIE, refreshToken, { ...baseCookie, maxAge: 60 * 60 * 24 * 30 });
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, "", { ...baseCookie, maxAge: 0 });
  jar.set(REFRESH_COOKIE, "", { ...baseCookie, maxAge: 0 });
}

/** Decodes a JWT payload WITHOUT verifying it (the backend verifies). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function emailFromToken(token: string): string | null {
  const p = decodeJwtPayload(token);
  const email = p?.email;
  return typeof email === "string" ? email : null;
}

/** The web gate: only @insightesportsapp.com accounts (ALLOWED_EMAIL_DOMAIN). */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return email.slice(at + 1).toLowerCase() === serverConfig.allowedEmailDomain;
}
