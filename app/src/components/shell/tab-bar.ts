// tab-bar.ts — AppState.hidesTabBar for the web.
//
// A screen that wants the phone tab bar gone while it is on screen (the DM
// thread, like MessageThreadView's `.toolbar(.hidden, for: .tabBar)`) calls
// useHideTabBar(); the shell reads the flag with useTabBarHidden(). A tiny
// external store rather than context so src/store/app-state.tsx stays as is.
"use client";

import { useEffect, useSyncExternalStore } from "react";

let hiders = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => hiders > 0;
const getServerSnapshot = () => false;

/** True while at least one mounted screen asked for the tab bar to hide. */
export function useTabBarHidden(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Hide the phone tab bar for the lifetime of the calling component. */
export function useHideTabBar(active = true): void {
  useEffect(() => {
    if (!active) return;
    hiders += 1; emit();
    return () => { hiders -= 1; emit(); };
  }, [active]);
}
