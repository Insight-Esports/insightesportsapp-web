// POST /api/auth/login { email, password }
//
// 1. Forwards to the backend's /auth/login (with the secret x-api-key).
// 2. Checks the account's email against ALLOWED_EMAIL_DOMAIN — the web gate.
// 3. Stores the Supabase access/refresh tokens in httpOnly cookies.
import { NextResponse } from "next/server";
import { callBackend, jsonOf } from "@/lib/server/backend";
import { writeSession, isAllowedEmail, emailFromToken } from "@/lib/server/session";
import { serverConfig } from "@/lib/server/config";
import { normalizeUser } from "@/lib/types";

export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  // Cheap pre-check: a non-team address never even reaches the backend.
  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: `The web version is currently limited to @${serverConfig.allowedEmailDomain} accounts.`, code: "DOMAIN_NOT_ALLOWED" },
      { status: 403 },
    );
  }

  let r;
  try {
    r = await callBackend("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  } catch {
    return NextResponse.json({ error: "Can't reach Insight right now. Try again in a moment." }, { status: 503 });
  }
  const j = jsonOf(r) as { token?: string; refreshToken?: string; user?: unknown; error?: string } | null;
  if (r.status !== 200 || !j?.token) {
    return NextResponse.json({ error: j?.error ?? "Invalid email or password" }, { status: r.status === 200 ? 502 : r.status });
  }

  // Authoritative check on the identity the backend actually issued: the
  // JWT's email claim, falling back to the user object, then the input.
  const rawUser = (j.user ?? {}) as Record<string, unknown>;
  const issuedEmail = emailFromToken(j.token) ?? (typeof rawUser.email === "string" ? rawUser.email : email);
  if (!isAllowedEmail(issuedEmail)) {
    return NextResponse.json(
      { error: `The web version is currently limited to @${serverConfig.allowedEmailDomain} accounts.`, code: "DOMAIN_NOT_ALLOWED" },
      { status: 403 },
    );
  }

  await writeSession(j.token, j.refreshToken ?? null);
  const user = normalizeUser({ ...rawUser, email: issuedEmail });
  return NextResponse.json({ user });
}
