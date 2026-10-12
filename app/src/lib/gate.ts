// gate.ts — the Google "team access" gate, shared by the middleware (Edge)
// and the auth route handlers (Node), so it uses only Web Crypto.
//
// Flow: /gate → Google sign-in (hd = GOOGLE_ALLOWED_DOMAIN) → callback checks
// the ID token's verified email domain → signed, httpOnly `insight_gate`
// cookie → the app's own login (/login). Without the cookie, every app page
// and the login API are refused. The gate is active only when
// GOOGLE_CLIENT_ID is set; otherwise (local/mock) it is skipped.

export const GATE_COOKIE = "insight_gate";
export const STATE_COOKIE = "insight_gstate";
export const GATE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function gateEnabled(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID;
}
export function gateDomain(): string {
  return (process.env.GOOGLE_ALLOWED_DOMAIN ?? "insightesportsapp.com").toLowerCase().replace(/^@/, "");
}
function secretBytes(): Uint8Array {
  return new TextEncoder().encode(process.env.GATE_SECRET || process.env.APP_API_KEY || "insight-gate-dev-secret");
}

const b64u = {
  encode(bytes: Uint8Array): string {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Uint8Array {
    const t = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secretBytes() as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64u.encode(new Uint8Array(sig));
}

export interface GatePayload { email: string; exp: number }

export async function signGate(email: string): Promise<string> {
  const payload = b64u.encode(new TextEncoder().encode(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + GATE_MAX_AGE } satisfies GatePayload)));
  return `${payload}.${await hmac(payload)}`;
}

/** The gate payload when the cookie is valid, else null. */
export async function verifyGate(cookie: string | null | undefined): Promise<GatePayload | null> {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  if (sig !== (await hmac(payload))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(b64u.decode(payload))) as GatePayload;
    if (!p?.email || typeof p.exp !== "number" || p.exp < Date.now() / 1000) return null;
    if (p.email.slice(p.email.lastIndexOf("@") + 1).toLowerCase() !== gateDomain()) return null;
    return p;
  } catch {
    return null;
  }
}

export function emailDomainOk(email: string | null | undefined, hd?: string | null): boolean {
  const d = gateDomain();
  if (hd && hd.toLowerCase() === d) return true;
  if (!email) return false;
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase() === d;
}

/** The site's public origin for redirects behind Railway's proxy: PUBLIC_ORIGIN, else the forwarded headers. */
export function publicOrigin(req: Request): string {
  const env = process.env.PUBLIC_ORIGIN?.replace(/\/$/, "");
  if (env) return env;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.headers.get("host");
  if (host) return `${proto || "https"}://${host}`;
  return new URL(req.url).origin;
}
