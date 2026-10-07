// /api/backend/<anything> — the web's APIClient.
//
// The browser never talks to Railway directly for REST. This handler:
//   • adds the secret x-api-key and the user's JWT (from httpOnly cookies)
//   • on the first 401, exchanges the refresh token once and retries
//     (single-flight per request; mirrors APIClient.attemptTokenRefresh)
//   • re-checks the email-domain gate on every call
//   • streams the backend's status + JSON body back untouched, so screens
//     see exactly what the iOS app sees ({ error: "..." } bodies included)
import { NextResponse } from "next/server";
import { callBackend, refreshTokens } from "@/lib/server/backend";
import { readSession, writeSession, clearSession, isAllowedEmail, emailFromToken } from "@/lib/server/session";

// Reachable with NO session (the password-reset and OTP flows).
const PUBLIC_PATHS = new Set([
  "auth/forgot-password",
  "auth/verify-reset-code",
  "auth/set-new-password",
  "auth/resend",
  "auth/verify-otp",
]);

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const url = new URL(req.url);
  const backendPath = "/" + joined + url.search;

  const { accessToken, refreshToken } = await readSession();
  const isPublic = PUBLIC_PATHS.has(joined);

  if (!accessToken && !isPublic) {
    return NextResponse.json({ error: "Please log in again.", code: "NO_SESSION" }, { status: 401 });
  }
  if (accessToken && !isAllowedEmail(emailFromToken(accessToken))) {
    await clearSession();
    return NextResponse.json({ error: "This account can't use the web version.", code: "DOMAIN_NOT_ALLOWED" }, { status: 403 });
  }

  // Body: pass JSON through as text; multipart (avatar upload) as-is.
  const method = req.method.toUpperCase();
  const incomingType = req.headers.get("content-type");
  let body: BodyInit | null = null;
  let contentType: string | null | undefined = undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (incomingType && incomingType.includes("multipart/form-data")) {
      body = await req.arrayBuffer();
      contentType = incomingType;
    } else {
      body = await req.text();
      contentType = "application/json";
    }
  } else {
    contentType = null;
  }

  const send = async (token: string | null) => {
    try {
      return await callBackend(backendPath, { method, body, accessToken: token, contentType });
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return { status: aborted ? 504 : 502, headers: new Headers(), body: new TextEncoder().encode(JSON.stringify({ error: aborted ? "Request timed out." : "Can't reach Insight.", code: "UNREACHABLE" })).buffer as ArrayBuffer };
    }
  };

  let result = await send(accessToken);

  if (result.status === 401 && accessToken && refreshToken) {
    const refreshed = await refreshTokens(refreshToken);
    if (refreshed === "rejected") {
      await clearSession();
      return NextResponse.json({ error: "Please log in again.", code: "SESSION_ENDED" }, { status: 401 });
    }
    if (refreshed !== "transient") {
      await writeSession(refreshed.token, refreshed.refreshToken);
      result = await send(refreshed.token);
    }
  }

  const headers = new Headers();
  const ct = result.headers.get("content-type");
  headers.set("Content-Type", ct ?? "application/json");
  headers.set("Cache-Control", "no-store");
  for (const h of ["ratelimit-limit", "ratelimit-remaining", "ratelimit-reset", "retry-after"]) {
    const v = result.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(result.body, { status: result.status, headers });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
