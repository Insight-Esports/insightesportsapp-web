// logo-memory.ts — where a team's logo comes from when the first try fails
// (§5 "Team logos everywhere", iOS TeamMark + its image pipeline).
//
// 1. The fallback chain. A backend thumbnail (`<host>/img/<size>/<sig>/<src>`)
//    loads through the same-origin /api/img mirror; when that errors or
//    answers with the backend's 1×1 transparent placeholder, the original
//    (the base64url last segment) loads instead. An original on
//    cdn-api.pandascore.co loads from cdn.pandascore.co, same path.
// 2. Rest. A URL that failed is not asked for again for 60 s (module map),
//    so twenty rows of one dead logo cost one request, not twenty.
// 3. Memory by team name. The last logo that loaded for a team is kept in
//    localStorage under `teamNameKey(name)` ("Team Spirit" and "Spirit"
//    share one key) and used when a row has no logo or its URL fails.
//
// No React here: TeamMark (components/ui) drives it.

import { teamNameKey } from "./team-letters";

// ── Originals ─────────────────────────────────────────────────────────────
const THUMB_PATH = /\/img\/\d+\/[^/]+\/([^/?#]+)\/?(?:[?#].*)?$/;

function b64urlDecode(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** The original behind a backend thumbnail URL, or null when it isn't one. */
export function originalFromThumb(url: string): string | null {
  const m = THUMB_PATH.exec(url);
  if (!m) return null;
  const src = b64urlDecode(decodeURIComponent(m[1]));
  return src && /^https?:\/\//i.test(src) ? src : null;
}

/** cdn-api.pandascore.co → cdn.pandascore.co (same path); anything else untouched. */
export function directLogoURL(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase() === "cdn-api.pandascore.co") { u.hostname = "cdn.pandascore.co"; return u.toString(); }
  } catch { /* not a URL: leave it */ }
  return url;
}

/** One step of the chain: `src` is what the <img> loads, `raw` the URL the
 *  backend handed out (what memory keeps), `readable` = same-origin, so the
 *  plate test may read its pixels. */
export interface LogoSource { src: string; raw: string; readable: boolean; remembered: boolean }

/** The ordered sources for one raw logo URL. `toSrc` is components/ui's
 *  imageSrc (thumbnails → the /api/img mirror). */
export function logoSources(raw: string | null | undefined, toSrc: (u: string) => string | null, remembered = false): LogoSource[] {
  if (!raw) return [];
  const out: LogoSource[] = [];
  const first = toSrc(raw);
  const original = originalFromThumb(raw);
  if (first) {
    const readable = first.startsWith("/");
    // A raw original (not a thumbnail) goes straight to its direct host.
    out.push({ src: original || readable ? first : directLogoURL(first), raw, readable, remembered });
  }
  if (original) {
    const direct = directLogoURL(original);
    if (!out.some((s) => s.src === direct)) out.push({ src: direct, raw, readable: false, remembered });
  }
  return out;
}

// ── Rest: a failed URL waits 60 s ─────────────────────────────────────────
export const LOGO_REST_MS = 60_000;
const failedAt = new Map<string, number>();

export function isResting(src: string): boolean {
  const t = failedAt.get(src);
  if (t === undefined) return false;
  if (Date.now() - t < LOGO_REST_MS) return true;
  failedAt.delete(src);
  return false;
}
export function markLogoFailed(src: string): void { failedAt.set(src, Date.now()); }
export function markLogoLoaded(src: string): void { failedAt.delete(src); }

// ── One more try: a dropped connection or a 5xx ───────────────────────────
// An <img> error doesn't say why, so one probe asks (shared by every mark
// that failed on the same URL at once). Same-origin (the /api/img mirror)
// gives the status; a cross-origin original only tells "answered" (opaque:
// no retry) from "never answered" (dropped: retry).
const probes = new Map<string, Promise<boolean>>();

export function shouldRetryLogo(src: string): Promise<boolean> {
  const running = probes.get(src);
  if (running) return running;
  const sameOrigin = src.startsWith("/");
  const p = fetch(src, sameOrigin ? { cache: "no-store" } : { mode: "no-cors", cache: "no-store" })
    .then((r) => (r.type === "opaque" ? false : r.status >= 500 || r.ok))
    .catch(() => true)
    .finally(() => { probes.delete(src); });
  probes.set(src, p);
  return p;
}

// ── Memory by team name (localStorage) ────────────────────────────────────
const STORE_KEY = "insight.teamLogos.v1";
const MAX_ENTRIES = 800;
let memory: Map<string, string> | null = null;

function load(): Map<string, string> {
  if (memory) return memory;
  memory = new Map();
  if (typeof window === "undefined") return memory;
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) if (typeof v === "string" && v) memory.set(k, v);
  } catch { /* private mode / bad JSON: start empty */ }
  return memory;
}

function save(map: Map<string, string>) {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(map))); } catch { /* quota / blocked */ }
}

/** The last logo URL that loaded for this team name, if any. */
export function rememberedLogo(name: string | null | undefined): string | null {
  const key = teamNameKey(name);
  if (!key || typeof window === "undefined") return null;
  return load().get(key) ?? null;
}

/** Keep `raw` as this team's logo (the newest wins; oldest entries drop past the cap). */
export function rememberLogo(name: string | null | undefined, raw: string): void {
  const key = teamNameKey(name);
  if (!key || !raw || typeof window === "undefined") return;
  const map = load();
  if (map.get(key) === raw) return;
  map.delete(key);
  map.set(key, raw);
  while (map.size > MAX_ENTRIES) { const oldest = map.keys().next().value; if (oldest === undefined) break; map.delete(oldest); }
  save(map);
}
