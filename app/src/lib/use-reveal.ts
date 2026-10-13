// use-reveal.ts — the app's "show it all at once" rule as a hook.
//
// Every SwiftUI screen keeps its skeleton up until EVERY request for the
// first screen has finished and the first page of images has been warmed
// (ImagePrefetcher.prefetch, cap 24 / 1.5 s), then reveals the content in
// one go — rows arrive complete, no per-cell pop-in. `useReveal` is that
// gate for the web: pass the combined loading flag of the screen's initial
// requests (`a.loading || b.loading`) and a thunk that lists the logos /
// photos of the first page; it returns `true` only once both have settled.
//
// When `loading` flips back to true (game tab change, explicit reload) the
// gate closes again, exactly like the app's `isLoading = true` paths.
"use client";

import { useEffect, useRef, useState } from "react";
import { prefetchImages, type PrefetchOptions } from "./prefetch";

export function useReveal(loading: boolean, imageUrls: () => (string | null | undefined)[], opts: PrefetchOptions = {}): boolean {
  // Cached data at mount (useFetch cacheKey) reveals immediately.
  const [revealed, setRevealed] = useState(!loading);
  const urlsRef = useRef(imageUrls);
  urlsRef.current = imageUrls;
  const { cap, timeoutMs } = opts;

  useEffect(() => {
    if (loading) {
      setRevealed(false);
      return;
    }
    let active = true;
    void prefetchImages(urlsRef.current(), { cap, timeoutMs }).then(() => {
      if (active) setRevealed(true);
    });
    return () => { active = false; };
  }, [loading, cap, timeoutMs]);

  // `!loading &&` closes the gate on the very frame loading starts, before
  // the effect above has had a chance to run.
  return !loading && revealed;
}

/** `loading` for a screen made of several `useFetch` hooks: any one still in flight keeps the skeleton. */
export function anyLoading(...flags: boolean[]): boolean {
  return flags.some(Boolean);
}
