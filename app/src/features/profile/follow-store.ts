// features/profile/follow-store.ts — FollowService.swift for the web.
//
// One source of truth for what the current user follows (users, players,
// teams) so every FollowButton on screen agrees. Loaded once per session from
// GET /users/me/following?type=, toggled optimistically via POST /follow and
// POST /unfollow ({ targetType, targetId }), reverted on failure.
"use client";

import { useCallback, useSyncExternalStore } from "react";
import { api, endpoints } from "@/lib/api";
import { str, type Json } from "@/lib/types";

export type FollowTargetType = "user" | "player" | "team";

type Sets = Record<FollowTargetType, Set<string>>;
let sets: Sets = { user: new Set(), player: new Set(), team: new Set() };
let loaded = false;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
const getSnapshot = () => version;

function idsOf(raw: Json): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((r: Json) => str(r?.target_id) ?? str(r?.id)).filter(Boolean) as string[];
}

/** Fetches once per session unless forced. Safe to call often. */
export function loadFollowsIfNeeded(force = false): Promise<void> {
  if (!force && (loaded || loading)) return loading ?? Promise.resolve();
  loaded = true;
  loading = (async () => {
    const [users, players, teams] = await Promise.all(
      (["user", "player", "team"] as FollowTargetType[]).map((t) =>
        api.get<Json>(endpoints.following("me", 500, 0, t)).then(idsOf).catch(() => null),
      ),
    );
    sets = {
      user: users ? new Set(users) : sets.user,
      player: players ? new Set(players) : sets.player,
      team: teams ? new Set(teams) : sets.team,
    };
    loading = null;
    emit();
  })();
  return loading;
}

export function isFollowingId(type: FollowTargetType, id: string): boolean {
  return sets[type].has(id);
}

/** Seed from a row that already knows (`is_following`) without a refetch. */
export function seedFollow(type: FollowTargetType, id: string, following: boolean) {
  const has = sets[type].has(id);
  if (has === following) return;
  if (following) sets[type].add(id); else sets[type].delete(id);
  emit();
}

function apply(type: FollowTargetType, id: string, following: boolean) {
  if (following) sets[type].add(id); else sets[type].delete(id);
  emit();
}

/** Optimistic toggle: flips locally, POSTs, reverts on failure. */
export async function toggleFollow(type: FollowTargetType, id: string): Promise<boolean> {
  const was = isFollowingId(type, id);
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
export function resetFollows() {
  sets = { user: new Set(), player: new Set(), team: new Set() };
  loaded = false;
  loading = null;
  emit();
}

/** Subscribe to one target's follow state (re-renders on any change). */
export function useFollowState(type: FollowTargetType, id: string) {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const following = isFollowingId(type, id);
  const toggle = useCallback(() => toggleFollow(type, id), [type, id]);
  return { following, toggle };
}
