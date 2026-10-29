// moderation/blocked.ts — the one store of people you blocked
// (Moderation.swift, web/ios-parity-2026-10-28.md §2).
//
// Loaded from GET /users/me/blocked at sign-in (startDM) and again on focus
// while anything shows people; every block / unblock in the app goes
// through here, so live chat, comments, follow lists and the DM inbox hide
// a person the moment you block them. No React here (the DM service and
// app state import it); the hook is use-blocked.ts.
import { api, blockUser as postBlock, endpoints, unblockUser as deleteBlock } from "@/lib/api";
import { str, type Json } from "@/lib/types";

const EMPTY: ReadonlySet<string> = Object.freeze(new Set<string>()) as ReadonlySet<string>;
let ids: ReadonlySet<string> = EMPTY;
let owner: string | null = null;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
/** Local changes the next server read must not undo while it is in flight. */
const pending = new Map<string, boolean>();
const listeners = new Set<() => void>();
const blockListeners = new Set<(userId: string, blocked: boolean) => void>();

function publish(next: ReadonlySet<string>) {
  ids = next.size ? next : EMPTY;
  listeners.forEach((fn) => fn());
}

export function getBlockedIds(): ReadonlySet<string> { return ids; }
export function getServerBlockedIds(): ReadonlySet<string> { return EMPTY; }
export function isBlocked(userId: string | null | undefined): boolean { return !!userId && ids.has(userId); }

/** GET /users/me/blocked → the store. Throttled to one read per 10 s unless forced. */
export function loadBlocked(userId: string, force = false): Promise<void> {
  if (owner !== userId) { owner = userId; loadedAt = 0; inflight = null; pending.clear(); publish(EMPTY); }
  if (inflight) return inflight;
  if (!force && Date.now() - loadedAt < 10_000) return Promise.resolve();
  const run = async () => {
    try {
      const raw = await api.get<Json>(endpoints.blockedUsers);
      if (owner !== userId) return;
      const next = new Set<string>();
      for (const r of Array.isArray(raw) ? raw : []) {
        const id = str(r?.id) ?? str(r?.user_id) ?? str(r?.blocked_user_id);
        if (id) next.add(id);
      }
      for (const [id, blocked] of pending) { if (blocked) next.add(id); else next.delete(id); }
      loadedAt = Date.now();
      publish(next);
    } catch { /* keep what we have */ }
  };
  const p: Promise<void> = run().finally(() => { if (inflight === p) inflight = null; });
  inflight = p;
  return p;
}

/** Sign-out: forget the list. */
export function resetBlocked() {
  owner = null; loadedAt = 0; inflight = null; pending.clear();
  publish(EMPTY);
}

/** Re-read on focus while anything that hides people is on screen. */
let focusAttached = false;
function onFocus() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  if (owner && listeners.size > 0) void loadBlocked(owner);
}
export function subscribeBlocked(fn: () => void): () => void {
  listeners.add(fn);
  if (!focusAttached && typeof window !== "undefined") {
    focusAttached = true;
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
  }
  return () => { listeners.delete(fn); };
}

/** Someone was blocked or unblocked here (the DM inbox drops their thread). */
export function onBlockChange(fn: (userId: string, blocked: boolean) => void): () => void {
  blockListeners.add(fn);
  return () => { blockListeners.delete(fn); };
}

function setLocal(userId: string, blocked: boolean) {
  const next = new Set(ids);
  if (blocked) next.add(userId); else next.delete(userId);
  pending.set(userId, blocked);
  publish(next);
  blockListeners.forEach((fn) => { try { fn(userId, blocked); } catch { /* listener bug */ } });
  // The next full read is the truth again.
  setTimeout(() => { if (pending.get(userId) === blocked) pending.delete(userId); }, 15_000);
}

/** POST /dm/blocks {userId}. Throws when the server refuses; the store changes only on success. */
export async function blockUser(userId: string): Promise<void> {
  await postBlock(userId);
  setLocal(userId, true);
}

/** DELETE /dm/blocks/:userId. Throws when the server refuses. */
export async function unblockUser(userId: string): Promise<void> {
  await deleteBlock(userId);
  setLocal(userId, false);
}

export const BLOCK_FAILED = "Couldn't block. Check your connection and try again.";
