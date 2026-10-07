// POST /api/auth/logout — tells the backend (best effort) and clears cookies.
import { NextResponse } from "next/server";
import { callBackend } from "@/lib/server/backend";
import { readSession, clearSession } from "@/lib/server/session";

export async function POST() {
  const { accessToken } = await readSession();
  if (accessToken) {
    try { await callBackend("/auth/logout", { method: "POST", accessToken, body: "{}" }); } catch { /* ignore */ }
  }
  await clearSession();
  return NextResponse.json({ ok: true });
}
