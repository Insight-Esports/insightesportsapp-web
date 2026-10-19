// match-cache.ts — the Match a list card was tapped with, so the detail
// screen renders at once (like the app, which hands the Match object into
// LiveMatchView) while GET /matches/:id refreshes it in the background.
"use client";

import type { Json, Match } from "@/lib/types";

const KEY = "insight.match.";
const mem = new Map<string, Match>();

export function rememberMatch(m: Match) {
  mem.set(m.id, m);
  try { sessionStorage.setItem(KEY + m.id, JSON.stringify(m)); } catch { /* quota / private mode */ }
}

export function recallMatch(id: string): Match | null {
  const hit = mem.get(id);
  if (hit) return hit;
  try {
    const raw = sessionStorage.getItem(KEY + id);
    if (!raw) return null;
    const m = JSON.parse(raw) as Json;
    // Stored camelCase; normalizeMatch wants the wire shape, so trust it as-is
    // (a Match cached before `streams` existed just has none).
    if (!m || typeof m !== "object" || !m.id) return null;
    return { ...m, streams: Array.isArray(m.streams) ? m.streams : null } as Match;
  } catch {
    return null;
  }
}
