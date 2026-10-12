// GET /api/auth/gate — who passed the Google gate in this browser (for the
// login page's "Team access verified as …" line). DELETE clears it.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { GATE_COOKIE, gateDomain, gateEnabled, verifyGate } from "@/lib/gate";

export async function GET() {
  const jar = await cookies();
  const p = await verifyGate(jar.get(GATE_COOKIE)?.value);
  return NextResponse.json({ enabled: gateEnabled(), domain: gateDomain(), email: p?.email ?? null }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const jar = await cookies();
  jar.set(GATE_COOKIE, "", { maxAge: 0, path: "/" });
  return NextResponse.json({ ok: true });
}
