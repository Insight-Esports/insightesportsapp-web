// /api/link/:id — the two ends of one "Link web" hand-off.
//
// POST  (the PHONE, `Authorization: Bearer <app JWT>`, no cookies)
//       Body { phonePublicKey, nonce, ciphertext, keyVersion } — all base64
//       except keyVersion; ciphertext is AES-GCM ciphertext||tag of
//       "INSIGHT-DM:1:<b64 private key>:<version>" under
//       HKDF-SHA256(X25519(phoneEph, webEph), info "insight-link-v1").
//       The phone's JWT must resolve (GET /users/me) to the SAME user the
//       session was created for, else 403 ACCOUNT_MISMATCH.
//       404 unknown/expired · 409 already delivered.
//
// GET   (the WEB, cookie session; must be the session's creator)
//       { status: "pending" } or { status: "delivered", phonePublicKey, nonce,
//       ciphertext, keyVersion } — one-shot: the session is deleted once the
//       delivered data has been handed over.
//
// Neither call needs the Google gate cookie: proxy.ts skips every /api/ path.
import { NextResponse } from "next/server";
import { deleteLinkSession, deliverLinkSession, getLinkSession } from "@/lib/server/link-sessions";
import { bearerOf, webWhoAmI, whoAmI } from "@/lib/server/whoami";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const NO_STORE = { "Cache-Control": "no-store" };

function b64Len(s: unknown): number {
  if (typeof s !== "string" || !s || s.length > 4096 || !/^[A-Za-z0-9+/=_-]+$/.test(s)) return -1;
  try { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").length; } catch { return -1; }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const token = bearerOf(req);
  if (!token) return NextResponse.json({ error: "Missing bearer token.", code: "NO_TOKEN" }, { status: 401, headers: NO_STORE });

  // Look the session up first so an expired code is reported as such even
  // before the (slower) account check.
  const session = getLinkSession(id);
  if (!session) return NextResponse.json({ error: "That code expired.", code: "NOT_FOUND" }, { status: 404, headers: NO_STORE });

  const me = await whoAmI(token);
  if (me === "unauthorized") return NextResponse.json({ error: "Please log in again.", code: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
  if (me === "unreachable") return NextResponse.json({ error: "Can't reach Insight.", code: "UNREACHABLE" }, { status: 502, headers: NO_STORE });
  if (me.id !== session.userId) return NextResponse.json({ error: "ACCOUNT_MISMATCH" }, { status: 403, headers: NO_STORE });

  let body: Record<string, unknown> | null = null;
  try { body = await req.json(); } catch { body = null; }
  const phonePublicKey = body?.phonePublicKey, nonce = body?.nonce, ciphertext = body?.ciphertext;
  const keyVersion = typeof body?.keyVersion === "number" ? body.keyVersion : parseInt(String(body?.keyVersion ?? ""), 10);
  if (b64Len(phonePublicKey) !== 32 || b64Len(nonce) !== 12 || b64Len(ciphertext) <= 16 || !Number.isFinite(keyVersion) || keyVersion < 1) {
    return NextResponse.json({ error: "Bad link payload.", code: "BAD_PAYLOAD" }, { status: 400, headers: NO_STORE });
  }

  const r = deliverLinkSession(id, { phonePublicKey: phonePublicKey as string, nonce: nonce as string, ciphertext: ciphertext as string, keyVersion });
  if (r === "unknown") return NextResponse.json({ error: "That code expired.", code: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  if (r === "delivered") return NextResponse.json({ error: "That code was already used.", code: "ALREADY_DELIVERED" }, { status: 409, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const me = await webWhoAmI();
  if (me === "no-session" || me === "unauthorized") return NextResponse.json({ error: "Please log in again.", code: "NO_SESSION" }, { status: 401, headers: NO_STORE });
  if (me === "unreachable") return NextResponse.json({ error: "Can't reach Insight.", code: "UNREACHABLE" }, { status: 502, headers: NO_STORE });

  const session = getLinkSession(id);
  if (!session || session.userId !== me.id) return NextResponse.json({ error: "That code expired.", code: "NOT_FOUND" }, { status: 404, headers: NO_STORE });
  if (!session.delivery) return NextResponse.json({ status: "pending", expiresAt: session.expiresAt }, { headers: NO_STORE });

  deleteLinkSession(id);
  return NextResponse.json({ status: "delivered", ...session.delivery }, { headers: NO_STORE });
}
