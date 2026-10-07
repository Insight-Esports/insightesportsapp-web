// proxy.ts — the page gate (Next 16's name for middleware).
//
// Anyone without a session cookie is sent to /login; a session whose JWT
// email is outside ALLOWED_EMAIL_DOMAIN is dropped. The real token check
// happens on each /api/backend call; this just keeps pages behind the door.
import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "insight_at";
const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/verify-email"];

function allowedDomain(): string {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "insightesportsapp.com").toLowerCase().replace(/^@/, "");
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

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(ACCESS_COOKIE)?.value ?? null;
  const email = token ? emailFromJwt(token) : null;
  const gated = !!email && email.slice(email.lastIndexOf("@") + 1).toLowerCase() === allowedDomain();
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isPublic) {
    if (gated && pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }
  if (!gated) {
    const res = NextResponse.redirect(new URL(`/login${pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`, req.url));
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
  // Pages only — API routes do their own checks; static assets pass.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons|brand|.*\\.(?:png|svg|jpg|ico|webp)$).*)"],
};
