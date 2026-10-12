// GET /api/auth/google/callback — finish the Google team-access sign-in.
//
// Exchanges the code for an ID token (server to server), validates it with
// Google's tokeninfo endpoint (audience, verified email) and the team domain,
// then sets the signed `insight_gate` cookie and hands over to /login.
import { NextResponse } from "next/server";
import { BASE_PATH } from "@/lib/base-path";
import { GATE_COOKIE, GATE_MAX_AGE, STATE_COOKIE, emailDomainOk, gateEnabled, signGate, publicOrigin } from "@/lib/gate";

function fail(origin: string, reason: string) {
  return NextResponse.redirect(new URL(`${BASE_PATH}/gate?error=${encodeURIComponent(reason)}`, origin));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  if (!gateEnabled()) return NextResponse.redirect(new URL(`${BASE_PATH}/login`, origin));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const cookieHeader = req.headers.get("cookie") ?? "";
  const savedState = decodeURIComponent(cookieHeader.split(/;\s*/).find((c) => c.startsWith(STATE_COOKIE + "="))?.slice(STATE_COOKIE.length + 1) ?? "");
  if (url.searchParams.get("error")) return fail(origin, "cancelled");
  if (!code || !state || state !== savedState) return fail(origin, "state");

  let tokens: { id_token?: string };
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${origin}${BASE_PATH}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    tokens = await r.json();
    if (!r.ok || !tokens.id_token) return fail(origin, "exchange");
  } catch {
    return fail(origin, "exchange");
  }

  // Google validates the signature and expiry for us; we check who it's for.
  let info: { aud?: string; email?: string; email_verified?: string | boolean; hd?: string };
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`, { cache: "no-store" });
    info = await r.json();
    if (!r.ok) return fail(origin, "token");
  } catch {
    return fail(origin, "token");
  }
  if (info.aud !== process.env.GOOGLE_CLIENT_ID) return fail(origin, "token");
  const verified = info.email_verified === true || info.email_verified === "true";
  if (!verified || !info.email) return fail(origin, "unverified");
  if (!emailDomainOk(info.email, info.hd)) return fail(origin, "domain");

  const next = (() => { try { return decodeURIComponent(state.slice(state.indexOf(":") + 1)); } catch { return "/"; } })();
  const res = NextResponse.redirect(new URL(`${BASE_PATH}/login${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`, origin));
  res.cookies.set(GATE_COOKIE, await signGate(info.email.toLowerCase()), { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/", maxAge: GATE_MAX_AGE });
  res.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
