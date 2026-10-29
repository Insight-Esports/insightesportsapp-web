// live-matches.ts — the app's ONE shared copy of GET /matches/live
// (parity doc 2026-10-28 §7 "One shared live list").
//
// Every live link, live alert readout and live team list reads from here, so
// scores keep moving instead of freezing at first load. While at least one
// mounted component asks for it (`useLiveMatches()`), the list is refetched
// at most every 10 s (the server memoizes it for 2 s). With nobody watching,
// nothing polls.
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api, endpoints } from "@/lib/api";
import { normalizeMatches, type Match } from "@/lib/types";

const REFRESH_MS = 10_000;

let matches: Match[] = [];
let loadedAt = 0;
let inFlight: Promise<void> | null = null;
let watchers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function emit() { for (const l of listeners) l(); }

/** Refetch now unless a fetch is running or the copy is younger than `maxAgeMs`. */
export function refreshLiveMatches(maxAgeMs = 2_000): Promise<void> {
  if (inFlight) return inFlight;
  if (Date.now() - loadedAt < maxAgeMs) return Promise.resolve();
  inFlight = api.get(endpoints.liveMatches)
    .then((raw) => { matches = normalizeMatches(raw); loadedAt = Date.now(); emit(); })
    .catch(() => { /* keep the last good copy */ })
    .finally(() => { inFlight = null; });
  return inFlight;
}

function startWatching() {
  watchers += 1;
  if (watchers === 1) {
    void refreshLiveMatches();
    timer = setInterval(() => { if (typeof document === "undefined" || document.visibilityState === "visible") void refreshLiveMatches(REFRESH_MS - 500); }, REFRESH_MS);
  }
}
function stopWatching() {
  watchers = Math.max(0, watchers - 1);
  if (watchers === 0 && timer) { clearInterval(timer); timer = null; }
}

/** The current snapshot (no subscription). */
export function liveMatchesSnapshot(): Match[] { return matches; }

/** Subscribe to the shared live list; polls every 10 s while `active`. */
export function useLiveMatches(active = true): Match[] {
  const list = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => matches,
    () => matches,
  );
  useEffect(() => {
    if (!active) return;
    startWatching();
    return stopWatching;
  }, [active]);
  return list;
}

/** The live match a team is playing in right now, if any. */
export function liveMatchForTeam(list: Match[], teamId: string | null | undefined): Match | null {
  if (!teamId) return null;
  return list.find((m) => m.team1Id === teamId || m.team2Id === teamId) ?? null;
}

/** A live match by id. */
export function liveMatchById(list: Match[], id: string | null | undefined): Match | null {
  if (!id) return null;
  return list.find((m) => m.id === id) ?? null;
}

/** Round score from a team's side: [mine, theirs], or null if the team isn't in it. */
export function scoreFromSide(m: Match, teamId: string | null | undefined): [number, number] | null {
  if (!teamId) return null;
  if (m.team1Id === teamId) return [m.team1Score, m.team2Score];
  if (m.team2Id === teamId) return [m.team2Score, m.team1Score];
  return null;
}
