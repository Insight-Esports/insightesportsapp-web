// useFollow — FollowService.swift for the web.
//
// One module-level store of what the current user follows (users, players,
// teams). Every FollowButton reads/writes here so Profile, Team/Player detail
// and the Following lists stay in sync. Backed by POST /follow and
// POST /unfollow ({ targetType, targetId }, idempotent); membership loads
// once per session from GET /users/me/following?type=.
"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, endpoints } from "@/lib/api";
import { str, type Json } from "@/lib/types";

export type FollowTargetType = "user" | "player" | "team";

interface FollowState {
  users: ReadonlySet<string>;
  players: ReadonlySet<string>;
  teams: ReadonlySet<string>;
  loaded: boolean;
}

let state: FollowState = { users: new Set(), players: new Set(), teams: new Set(), loaded: false };
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: FollowState) {
  state = next;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
function getSnapshot() { return state; }

function setFor(type: FollowTargetType): ReadonlySet<string> {
  switch (type) {
    case "user": return state.users;
    case "player": return state.players;
    case "team": return state.teams;
  }
}

function apply(type: FollowTargetType, id: string, following: boolean) {
  const next = new Set(setFor(type));
  if (following) next.add(id); else next.delete(id);
  setState({ ...state, [type === "user" ? "users" : type === "player" ? "players" : "teams"]: next });
}

// Tolerant row for /users/me/following?type= — only the id is required.
function idsOf(raw: Json): string[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.following) ? raw.following : Array.isArray(raw?.data) ? raw.data : [];
  const out: string[] = [];
  for (const r of arr) {
    const id = str(r?.target_id) ?? str(r?.id);
    if (id) out.push(id);
  }
  return out;
}

/** Loads followed ids for all three types (parallel). Fetches once per session unless forced. */
export function loadFollowsIfNeeded(force = false): Promise<void> {
  if (!force && (state.loaded || loadPromise)) return loadPromise ?? Promise.resolve();
  loadPromise = (async () => {
    const [users, players, teams] = await Promise.all(
      (["user", "player", "team"] as const).map((t) =>
        api.get<Json>(endpoints.following("me", 500, 0, t)).then(idsOf).catch(() => [] as string[]),
      ),
    );
    setState({ users: new Set(users), players: new Set(players), teams: new Set(teams), loaded: true });
  })().finally(() => { loadPromise = null; });
  return loadPromise;
}

export function isFollowingTarget(type: FollowTargetType, id: string): boolean {
  return setFor(type).has(id);
}

/** Optimistic toggle: flips locally, POSTs, reverts on failure. Resolves to the new state. */
export async function toggleFollow(type: FollowTargetType, id: string): Promise<boolean> {
  const was = isFollowingTarget(type, id);
  apply(type, id, !was);
  try {
    await api.post(was ? endpoints.unfollow : endpoints.follow, { targetType: type, targetId: id });
    return !was;
  } catch {
    apply(type, id, was);
    return was;
  }
}

/** Called on logout so the next account doesn't inherit this one's state. */
export function resetFollowService() {
  setState({ users: new Set(), players: new Set(), teams: new Set(), loaded: false });
}

/** Read the whole follow store (for lists that mark many rows). */
export function useFollowStore(): FollowState {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => { void loadFollowsIfNeeded(); }, []);
  return snap;
}

/** `useFollow("team", id)` → { isFollowing, toggle, busy, loaded }. */
export function useFollow(targetType: FollowTargetType, targetId: string) {
  const snap = useFollowStore();
  const [busy, setBusy] = useState(false);
  const isFollowing = targetId ? (targetType === "user" ? snap.users : targetType === "player" ? snap.players : snap.teams).has(targetId) : false;
  const toggle = useCallback(async () => {
    if (!targetId || busy) return;
    setBusy(true);
    try { await toggleFollow(targetType, targetId); } finally { setBusy(false); }
  }, [targetType, targetId, busy]);
  return { isFollowing, toggle, busy, loaded: snap.loaded };
}
