// GET /api/auth/session — the launch check (AppState.checkAuthStatus).
// Validates the stored token against GET /users/me, refreshing once on 401.
import { NextResponse } from "next/server";
import { callBackend, jsonOf, refreshTokens } from "@/lib/server/backend";
import { readSession, writeSession, clearSession, isAllowedEmail, emailFromToken } from "@/lib/server/session";
import { normalizeUser } from "@/lib/types";

export async function GET() {
  const { accessToken, refreshToken } = await readSession();
  if (!accessToken) return NextResponse.json({ user: null }, { status: 401 });

  let token = accessToken;
  let r = await safeCall(token);
  if (r && r.status === 401 && refreshToken) {
    const refreshed = await refreshTokens(refreshToken);
    if (refreshed === "rejected") {
      await clearSession();
      return NextResponse.json({ user: null, code: "SESSION_ENDED" }, { status: 401 });
    }
    if (refreshed !== "transient") {
      token = refreshed.token;
      await writeSession(refreshed.token, refreshed.refreshToken);
      r = await safeCall(token);
    }
  }
  if (!r) return NextResponse.json({ user: null, code: "UNREACHABLE" }, { status: 503 });
  if (r.status === 401) {
    await clearSession();
    return NextResponse.json({ user: null, code: "SESSION_ENDED" }, { status: 401 });
  }
  if (r.status !== 200) return NextResponse.json({ user: null, code: "UNREACHABLE" }, { status: 503 });

  const raw = (jsonOf(r) ?? {}) as Record<string, unknown>;
  const email = (typeof raw.email === "string" && raw.email) || emailFromToken(token) || "";
  if (!isAllowedEmail(email)) {
    await clearSession();
    return NextResponse.json({ user: null, code: "DOMAIN_NOT_ALLOWED" }, { status: 403 });
  }
  return NextResponse.json({ user: normalizeUser({ ...raw, email }) });
}

async function safeCall(token: string) {
  try {
    return await callBackend("/users/me", { accessToken: token });
  } catch {
    return null;
  }
}
