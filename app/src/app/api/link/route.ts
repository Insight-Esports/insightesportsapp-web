// POST /api/link — the web starts a "Link web" hand-off (WhatsApp Web model).
//
// Body  { webPublicKey }  base64 raw X25519 public key, minted in the browser
//                         for this one hand-off (never stored anywhere else).
// Reply { id, userId, expiresAt }
//
// The browser puts `INSIGHT-LINK:1:<id>:<webPublicKey>:<userId>` in a QR code;
// the phone scans it and answers at POST /api/link/:id. The relay never sees
// a usable key: the phone seals the DM private key to webPublicKey.
import { NextResponse } from "next/server";
import { createLinkSession } from "@/lib/server/link-sessions";
import { webWhoAmI } from "@/lib/server/whoami";

export const dynamic = "force-dynamic";

function isRawKeyBase64(s: unknown): s is string {
  if (typeof s !== "string" || s.length < 40 || s.length > 48) return false;
  try { return Buffer.from(s, "base64").length === 32; } catch { return false; }
}

export async function POST(req: Request) {
  const me = await webWhoAmI();
  if (me === "no-session" || me === "unauthorized") return NextResponse.json({ error: "Please log in again.", code: "NO_SESSION" }, { status: 401 });
  if (me === "unreachable") return NextResponse.json({ error: "Can't reach Insight.", code: "UNREACHABLE" }, { status: 502 });

  let body: { webPublicKey?: unknown } | null = null;
  try { body = await req.json(); } catch { body = null; }
  if (!isRawKeyBase64(body?.webPublicKey)) return NextResponse.json({ error: "webPublicKey must be a base64 raw X25519 public key.", code: "BAD_KEY" }, { status: 400 });

  const s = createLinkSession(me.id, body.webPublicKey);
  return NextResponse.json({ id: s.id, userId: s.userId, expiresAt: s.expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
