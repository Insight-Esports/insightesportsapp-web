// premium-style.ts — the rules behind Premium flair (PremiumFlair.swift,
// web/ios-parity-2026-10-24.md §1), without any UI:
//
//   • the monthly podium (who holds gold / silver / bronze right now), a
//     tiny module store loaded at app launch and refreshed by every monthly
//     leaderboard load;
//   • the signed-in user's local mirror of their last style choice, which
//     wins over the server value until the server stores it;
//   • resolveFlair: what to draw for a user.
//
// The React side (hooks + <FlairAvatar>/<FlairName>) is
// components/ui/premium-flair.tsx, which re-exports everything here.
import { api, endpoints } from "@/lib/api";
import { int, normalizePremiumStyle, str, type Json, type PremiumStylePiece } from "@/lib/types";

export type Metal = "gold" | "silver" | "bronze";
export const METALS: readonly Metal[] = ["gold", "silver", "bronze"];
export type PodiumPlace = 1 | 2 | 3;

// ── Podium store ──────────────────────────────────────────────────────────
// GET /leaderboard/period?period=monthly&limit=3, only users with points > 0,
// in row order: #1 gold, #2 silver, #3 bronze. The same rule is the ORACLE
// fallback, so nobody holds the title at 0 points on the 1st.
const EMPTY: readonly string[] = Object.freeze([]);
let podium: readonly string[] = EMPTY;
const podiumListeners = new Set<() => void>();

export function getPodium(): readonly string[] { return podium; }
export function getServerPodium(): readonly string[] { return EMPTY; }
export function subscribePodium(fn: () => void): () => void {
  podiumListeners.add(fn);
  return () => { podiumListeners.delete(fn); };
}
function setPodium(ids: string[]) {
  if (ids.length === podium.length && ids.every((id, i) => id === podium[i])) return;
  podium = ids.length ? Object.freeze(ids) : EMPTY;
  podiumListeners.forEach((fn) => fn());
}
/** The monthly board's first rows (bare array or { entries }) → the podium. */
export function setPodiumFromRows(raw: Json): void {
  const rows: Json[] = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
  const ids: string[] = [];
  for (const r of rows) {
    if (ids.length === 3) break;
    if ((int(r?.points) ?? 0) <= 0) continue;
    const id = str(r?.user_id) ?? str(r?.id);
    if (id) ids.push(id);
  }
  setPodium(ids);
}
/** App launch: one small read of the monthly top 3. Best effort. */
export async function loadPodium(): Promise<void> {
  try { setPodiumFromRows(await api.get<Json>(endpoints.leaderboardPeriod("monthly", 3, 0))); } catch { /* keep what we have */ }
}
export function resetPodium(): void { setPodium([]); }
export function podiumPlace(userId: string | null | undefined, ids: readonly string[] = podium): PodiumPlace | null {
  if (!userId) return null;
  const i = ids.indexOf(userId);
  return i >= 0 && i < 3 ? ((i + 1) as PodiumPlace) : null;
}

// ── Own style mirror (localStorage, keyed by user id) ─────────────────────
// PATCH /users/me {premiumStyle} returns 422 until the backend stores the
// field, so the signed-in user's choice lives here and wins over the server
// value until a PATCH comes back with it stored.
const MIRROR_PREFIX = "insight.premiumStyle.";
const mirrorCache = new Map<string, { raw: string | null; value: PremiumStylePiece[] | null }>();
const mirrorListeners = new Set<() => void>();

export function readStyleMirror(userId: string | null | undefined): PremiumStylePiece[] | null {
  if (!userId) return null;
  let raw: string | null = null;
  try { raw = localStorage.getItem(MIRROR_PREFIX + userId); } catch { raw = null; }
  const hit = mirrorCache.get(userId);
  if (hit && hit.raw === raw) return hit.value;
  let value: PremiumStylePiece[] | null = null;
  if (raw !== null) {
    try { value = normalizePremiumStyle(JSON.parse(raw)) ?? null; } catch { value = null; }
  }
  mirrorCache.set(userId, { raw, value });
  return value;
}
export function writeStyleMirror(userId: string, style: PremiumStylePiece[]): void {
  try { localStorage.setItem(MIRROR_PREFIX + userId, JSON.stringify(canonicalStyle(style))); } catch { /* private window */ }
  mirrorListeners.forEach((fn) => fn());
}
export function clearStyleMirror(userId: string): void {
  try { localStorage.removeItem(MIRROR_PREFIX + userId); } catch { /* private window */ }
  mirrorListeners.forEach((fn) => fn());
}
export function subscribeStyleMirror(fn: () => void): () => void {
  mirrorListeners.add(fn);
  // Another tab saved a style: follow it.
  const onStorage = (e: StorageEvent) => { if (!e.key || e.key.startsWith(MIRROR_PREFIX)) fn(); };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    mirrorListeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** Pieces in contract order, no duplicates (stable for comparing). */
export function canonicalStyle(style: readonly PremiumStylePiece[]): PremiumStylePiece[] {
  return (["ring", "shine", "mark", "metal", "shine_metal"] as PremiumStylePiece[]).filter((p) => style.includes(p));
}
export function sameStyle(a: readonly PremiumStylePiece[] | null, b: readonly PremiumStylePiece[] | null): boolean {
  if (a === null || b === null) return a === b;
  const x = canonicalStyle(a), y = canonicalStyle(b);
  return x.length === y.length && x.every((p, i) => p === y[i]);
}
export const DEFAULT_STYLE: readonly PremiumStylePiece[] = Object.freeze(["ring"] as PremiumStylePiece[]);

// ── Resolving what to draw ────────────────────────────────────────────────
/** What any user payload must carry for flair. */
export interface FlairInput {
  id?: string | null;
  isPremium: boolean;
  /** null/undefined = default ["ring"]; [] = nothing. */
  premiumStyle?: PremiumStylePiece[] | null;
  /** 'oracle' | null; undefined = not on the payload (podium fallback). */
  title?: string | null;
}
export interface Flair {
  ring: boolean;
  shine: boolean;
  mark: boolean;
  /** The ring's rank colour (metal + a podium place), else violet. */
  ringMetal: Metal | null;
  /** The name's rank colour (shine_metal + a podium place), else violet. */
  shineMetal: Metal | null;
  /** The ORACLE word (not a Premium perk: the live monthly #1). */
  oracle: boolean;
  place: PodiumPlace | null;
}

/**
 * Draw nothing unless is_premium; otherwise premium_style, or ["ring"] when
 * it's null; [] shows nothing. For the signed-in user (`isMe`) the local
 * mirror wins. `chat`: no avatars, so a ring without a shine becomes the
 * diamond, and a chat shine is always violet (chat rows carry no user id).
 */
export function resolveFlair(
  user: FlairInput,
  opts: { isMe?: boolean; podium?: readonly string[]; mirror?: PremiumStylePiece[] | null; chat?: boolean } = {},
): Flair {
  const ids = opts.podium ?? podium;
  const place = opts.chat ? null : podiumPlace(user.id, ids);
  const oracle = user.title !== undefined ? user.title === "oracle" : place === 1;
  if (!user.isPremium) return { ring: false, shine: false, mark: false, ringMetal: null, shineMetal: null, oracle, place };
  const mirror = opts.isMe && user.id ? (opts.mirror !== undefined ? opts.mirror : readStyleMirror(user.id)) : null;
  const style = mirror ?? user.premiumStyle ?? DEFAULT_STYLE;
  const has = (p: PremiumStylePiece) => style.includes(p);
  const metal = place ? METALS[place - 1] : null;
  let ring = has("ring");
  const shine = has("shine");
  let mark = has("mark");
  let ringMetal = ring && has("metal") ? metal : null;
  const shineMetal = shine && has("shine_metal") && !opts.chat ? metal : null;
  if (opts.chat) {
    if (ring && !shine) mark = true;
    ring = false;
    ringMetal = null;
  }
  return { ring, shine, mark, ringMetal, shineMetal, oracle, place };
}
