// GET /api/auth/socket-token
//
// Socket.IO connects from the browser straight to the backend (its CORS is
// open and it authenticates with the JWT only — no api key). The access
// token lives in an httpOnly cookie, so the page asks for a copy here; it
// is held in memory only, never persisted, and the gate still applies.
import { NextResponse } from "next/server";
import { readSession, isAllowedEmail, emailFromToken } from "@/lib/server/session";

export async function GET() {
  const { accessToken } = await readSession();
  if (!accessToken || !isAllowedEmail(emailFromToken(accessToken))) {
    return NextResponse.json({ token: null }, { status: 401 });
  }
  return NextResponse.json({ token: accessToken }, { headers: { "Cache-Control": "no-store" } });
}
