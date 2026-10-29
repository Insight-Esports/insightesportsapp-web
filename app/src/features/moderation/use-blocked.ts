// moderation/use-blocked.ts — the blocked-ids store as a hook. Any screen
// that hides blocked people reads it; mounting one also makes sure the list
// is loaded for the signed-in user (startDM loads it at sign-in, focus
// reloads it).
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useOptionalAppState } from "@/store/app-state";
import { getBlockedIds, getServerBlockedIds, loadBlocked, subscribeBlocked } from "./blocked";

export function useBlockedIds(): ReadonlySet<string> {
  const app = useOptionalAppState();
  const userId = app?.user?.id ?? null;
  useEffect(() => { if (userId) void loadBlocked(userId); }, [userId]);
  return useSyncExternalStore(subscribeBlocked, getBlockedIds, getServerBlockedIds);
}

export function useIsBlocked(userId: string | null | undefined): boolean {
  const ids = useBlockedIds();
  return !!userId && ids.has(userId);
}
