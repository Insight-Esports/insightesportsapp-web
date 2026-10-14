// entity-cache.ts — the Player / Team a list row was tapped with, so the
// detail screen's header renders at once (like the app, which hands the
// row's model into PlayerDetailView / TeamDetailView) while GET /players/:id
// or /teams/:id refreshes it underneath. Same idea as matches/match-cache.ts.
//
// Also the hover prefetch: `prefetchPlayer` / `prefetchTeam` fetch the detail
// into the useFetch screen cache (one request per entity, deduped), so a
// click that follows a hover finds the full record already there.
"use client";

import { api, endpoints } from "@/lib/api";
import { normalizePlayer, normalizeTeam, type Player, type Team } from "@/lib/types";
import { hasScreenCache, primeScreenCache } from "@/lib/use-fetch";

const CAP = 64;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Insert-or-refresh with the oldest entry evicted past `CAP` (a Map keeps insertion order). */
function lruSet<V>(map: Map<string, V>, key: string, value: V) {
  map.delete(key);
  map.set(key, value);
  if (map.size > CAP) map.delete(map.keys().next().value as string);
}
function lruGet<V>(map: Map<string, V>, key: string): V | null {
  const hit = map.get(key);
  if (hit === undefined) return null;
  map.delete(key);
  map.set(key, hit);
  return hit;
}

// ── Screen cache keys (shared by the detail screens and the prefetchers) ──
export const playerCacheKey = (id: string) => `player:${id}`;
/** Team links can carry a NAME as the id with `?game=`; the hint is part of the key then. */
export const teamCacheKey = (idOrName: string, gameHint?: string | null) => (gameHint && !UUID.test(idOrName) ? `team:${idOrName}|${gameHint}` : `team:${idOrName}`);
/** What TeamDetail keeps under `teamCacheKey`: the team plus whether the backend knows it by this id. */
export interface ResolvedTeam { team: Team; stub: boolean }
export const isUUID = (s: string) => UUID.test(s);

// ── Remember / recall ─────────────────────────────────────────────────────
const players = new Map<string, Player>();
const teams = new Map<string, Team>();
const nameKey = (name: string) => `name:${name.trim().toLowerCase()}`;

export function rememberPlayer(p: Player) {
  if (!p?.id) return;
  lruSet(players, p.id, p);
}
export function recallPlayer(id: string): Player | null {
  return lruGet(players, id);
}

export function rememberTeam(t: Team) {
  if (!t?.id && !t?.name) return;
  if (t.id) lruSet(teams, t.id, t);
  if (t.name) lruSet(teams, nameKey(t.name), t);
}
export function recallTeam(idOrName: string): Team | null {
  return lruGet(teams, idOrName) ?? lruGet(teams, nameKey(idOrName));
}

/** Forget every remembered row (logout). */
export function clearEntityCaches() {
  players.clear();
  teams.clear();
}

// ── Hover prefetch (deduped, one request per entity) ──────────────────────
const inFlight = new Set<string>();

export function prefetchPlayer(id: string) {
  if (!id || typeof window === "undefined") return;
  const key = playerCacheKey(id);
  if (hasScreenCache(key) || inFlight.has(key)) return;
  inFlight.add(key);
  api.get(endpoints.playerDetail(id))
    .then((raw) => { const p = normalizePlayer(raw); primeScreenCache(key, p); rememberPlayer(p); })
    .catch(() => { /* the screen fetches on its own */ })
    .finally(() => inFlight.delete(key));
}

/** Only real ids are prefetched: a bare name needs TeamDetail's search fallback. */
export function prefetchTeam(id: string | null | undefined) {
  if (!id || !UUID.test(id) || typeof window === "undefined") return;
  const key = teamCacheKey(id);
  if (hasScreenCache(key) || inFlight.has(key)) return;
  inFlight.add(key);
  api.get(endpoints.teamDetail(id))
    .then((raw) => { const team = normalizeTeam(raw); primeScreenCache<ResolvedTeam>(key, { team, stub: false }); rememberTeam(team); })
    .catch(() => { /* the screen fetches on its own */ })
    .finally(() => inFlight.delete(key));
}
