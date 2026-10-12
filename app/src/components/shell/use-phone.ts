// use-phone.ts — "are we at phone width?" for screens whose STRUCTURE
// differs between the iPhone replica (< md) and the desktop layout, not
// just their styling. Server snapshot is false, so the first paint matches
// SSR and the phone tree takes over right after hydration.
"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
const getSnapshot = () => (typeof window === "undefined" ? false : window.matchMedia(QUERY).matches);
const getServerSnapshot = () => false;

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
