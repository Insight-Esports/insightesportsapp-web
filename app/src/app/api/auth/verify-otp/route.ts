// POST /api/auth/verify-otp { email, token } — VerifyEmailView's verify().
//
// The backend returns a real session (same shape as login). Like /api/auth/
// login, this stores the tokens in httpOnly cookies and applies the web's
// email-domain gate, so a freshly verified team account lands signed in.
import { NextResponse } from "next/server";
import { callBackend, jsonOf } from "@/lib/server/backend";
import { writeSession, isAllowedEmail, emailFromToken } from "@/lib/server/session";
import { serverConfig } from "@/lib/server/config";
import { normalizeUser } from "@/lib/types";

export async function POST(req: Request) {
  let body: { email?: string; token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Email and code are required" }, { status: 400 }); }
  const email = (body.email ?? "").trim().toLowerCase();
  const token = (body.token ?? "").trim();
  if (!email || !token) return NextResponse.json({ error: "Email and code are required" }, { status: 400 });

  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: `The web version is currently limited to @${serverConfig.allowedEmailDomain} accounts.`, code: "DOMAIN_NOT_ALLOWED" }, { status: 403 });
  }

  let r;
  try {
    r = await callBackend("/auth/verify-otp", { method: "POST", body: JSON.stringify({ email, token }) });
  } catch {
    return NextResponse.json({ error: "Can't reach Insight right now. Try again in a moment." }, { status: 503 });
  }
  const j = jsonOf(r) as { token?: string; refreshToken?: string; user?: unknown; error?: string } | null;
  if (r.status !== 200 || !j?.token) {
    return NextResponse.json({ error: j?.error ?? "Invalid or expired code" }, { status: r.status === 200 ? 502 : r.status });
  }
  const rawUser = (j.user ?? {}) as Record<string, unknown>;
  const issuedEmail = emailFromToken(j.token) ?? (typeof rawUser.email === "string" ? rawUser.email : email);
  if (!isAllowedEmail(issuedEmail)) {
    return NextResponse.json({ error: `The web version is currently limited to @${serverConfig.allowedEmailDomain} accounts.`, code: "DOMAIN_NOT_ALLOWED" }, { status: 403 });
  }
  await writeSession(j.token, j.refreshToken ?? null);
  return NextResponse.json({ user: normalizeUser({ ...rawUser, email: issuedEmail }) });
}
