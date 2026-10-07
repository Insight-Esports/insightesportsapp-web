// GET /api/status — mirrors the backend's public /status (host root).
import { NextResponse } from "next/server";
import { callBackend, jsonOf } from "@/lib/server/backend";

export async function GET() {
  try {
    const r = await callBackend("/status", { atHostRoot: true, contentType: null });
    if (r.status !== 200) return NextResponse.json({ error: "status unavailable" }, { status: 503 });
    return NextResponse.json(jsonOf(r), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "unreachable" }, { status: 503 });
  }
}
