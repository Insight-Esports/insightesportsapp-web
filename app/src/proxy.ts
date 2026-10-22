// proxy.ts — the page gate (Next 16's name for middleware).
//
// The app lives under /app (basePath); the marketing site at the root is
// never touched here. For app pages, in order:
//   1. iPhone / iPod → the App Store (the app is the mobile experience on
//      Apple devices; Android gets the mobile web). `?web=1` opts a browser
//      out for a year (testing).
//   2. The Google team gate (`insight_gate` cookie, when GOOGLE_CLIENT_ID is
//      set): without it → /gate.
//   3. The Insight session (`insight_at`): without it → /login. A session
//      whose email is outside ALLOWED_EMAIL_DOMAIN (when that is enforced)
//      is dropped. The real token check happens on each /api/backend call.
import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, gateEnabled, verifyGate } from "@/lib/gate";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "/app";
const ACCESS_COOKIE = "insight_at";
const WEB_OPT_OUT = "insight_web";
const APP_STORE_URL = process.env.NEXT_PUBLIC_APP_STORE_URL ?? "https://apps.apple.com/app/id6798031420";
// Reachable with a gate but no Insight session.
const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/verify-email"];
// Reachable with nothing at all.
const OPEN = ["/gate"];

function allowedDomain(): string | null {
  const raw = process.env.ALLOWED_EMAIL_DOMAIN;
  // When the Google gate is on, the Insight account can be any app account
  // unless a domain is explicitly configured.
  if (raw === undefined) return gateEnabled() ? null : "insightesportsapp.com";
  const d = raw.trim().toLowerCase().replace(/^@/, "");
  return d || null;
}

function emailFromJwt(token: string): string | null {
  try {
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
    const email = JSON.parse(json)?.email;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}

function isAppleMobile(ua: string | null): boolean {
  return !!ua && /iPhone|iPod/i.test(ua);
}

export async function proxy(req: NextRequest) {
  const raw = new URL(req.url).pathname;
  // Only the app (basePath) is gated; the marketing site at the host root is
  // served by server.mjs and never reaches this.
  if (raw !== BASE && !raw.startsWith(BASE + "/")) return NextResponse.next();
  const pathname = raw.slice(BASE.length) || "/";
  // Static assets, API routes and Next internals do their own thing.
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || /\.[a-z0-9]+$/i.test(pathname)) return NextResponse.next();

  const url = req.nextUrl;
  const to = (path: string) => NextResponse.redirect(new URL(`${BASE}${path}`, req.url));

  // 1. Apple phones go to the App Store (unless this browser opted out).
  if (url.searchParams.get("web") === "1") {
    const res = NextResponse.next();
    res.cookies.set(WEB_OPT_OUT, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    return res;
  }
  // Paused while the team tests the mobile web on iPhones (set
  // REDIRECT_IPHONE_TO_APP_STORE=1 to turn the App Store redirect back on).
  if (process.env.REDIRECT_IPHONE_TO_APP_STORE === "1" && isAppleMobile(req.headers.get("user-agent")) && req.cookies.get(WEB_OPT_OUT)?.value !== "1") {
    return NextResponse.redirect(APP_STORE_URL);
  }

  const isOpen = OPEN.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isOpen) return NextResponse.next();

  // 2. Google team gate.
  if (gateEnabled()) {
    const gate = await verifyGate(req.cookies.get(GATE_COOKIE)?.value);
    if (!gate) return to(`/gate${pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`);
  }

  // 3. Insight session.
  const token = req.cookies.get(ACCESS_COOKIE)?.value ?? null;
  const email = token ? emailFromJwt(token) : null;
  const domain = allowedDomain();
  const signedIn = !!email && (!domain || email.slice(email.lastIndexOf("@") + 1).toLowerCase() === domain);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isPublic) {
    if (signedIn && pathname === "/login") return to("/");
    return NextResponse.next();
  }
  if (!signedIn) {
    const res = to(`/login${pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`);
    if (token) {
      // Wrong-domain or unreadable token: drop it so login shows cleanly.
      res.cookies.set(ACCESS_COOKIE, "", { maxAge: 0, path: "/" });
      res.cookies.set("insight_rt", "", { maxAge: 0, path: "/" });
    }
    return res;
  }
  return NextResponse.next();
}

export const config = {
  // Everything; the function filters cheaply (assets, API, the root site).
  matcher: ["/:path*"],
};
