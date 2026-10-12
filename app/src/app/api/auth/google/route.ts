// GET /api/auth/google — start the Google team-access sign-in.
//
// Sends the browser to Google with hd=<team domain>; Google returns to
// /api/auth/google/callback with a code. `state` is a random nonce kept in a
// short-lived cookie so the callback can reject forged redirects.
import { NextResponse } from "next/server";
import { BASE_PATH } from "@/lib/base-path";
import { STATE_COOKIE, gateDomain, gateEnabled, publicOrigin } from "@/lib/gate";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  if (!gateEnabled()) return NextResponse.redirect(new URL(`${BASE_PATH}/login`, origin));
  const next = url.searchParams.get("next") ?? "/";
  const state = `${crypto.randomUUID()}:${encodeURIComponent(next.startsWith("/") ? next : "/")}`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}${BASE_PATH}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email",
    hd: gateDomain(),
    prompt: "select_account",
    state,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/", maxAge: 600 });
  return res;
}
