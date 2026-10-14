// use-fetch.ts — the loading / error / data pattern every SwiftUI screen
// hand-rolls (.task + @State isLoading/error), as one hook.
"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { ApiError, errorMessage } from "./api";

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** True when the failure was "can't reach the server" (not an empty result). */
  connectionProblem: boolean;
  reload: () => void;
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
}

// Screen cache (SwiftUI keeps a tab's view model alive; React remounts the
// page on every visit). A `cacheKey` makes a remount render the last data at
// once and refresh underneath, instead of a skeleton on every tab switch or
// back-navigation.
const screenCache = new Map<string, unknown>();

/** Forget every cached screen (logout): the next account starts from skeletons, not this one's data. */
export function clearScreenCaches() {
  screenCache.clear();
}

/** Seed a screen's cache ahead of its mount (hover prefetch): the next
 *  `useFetch` with this `cacheKey` renders `data` on its first paint and
 *  refreshes underneath. */
export function primeScreenCache<T>(key: string, data: T) {
  screenCache.set(key, data);
}
export function hasScreenCache(key: string): boolean {
  return screenCache.has(key);
}
export function readScreenCache<T>(key: string): T | null {
  return screenCache.has(key) ? (screenCache.get(key) as T) : null;
}

export function useFetch<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: DependencyList, opts: { enabled?: boolean; keepData?: boolean; cacheKey?: string } = {}): FetchState<T> {
  const enabled = opts.enabled ?? true;
  const cached = opts.cacheKey && screenCache.has(opts.cacheKey) ? (screenCache.get(opts.cacheKey) as T) : null;
  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState(enabled && cached === null);
  const [error, setError] = useState<string | null>(null);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const controller = new AbortController();
    let active = true;
    const key = opts.cacheKey;
    const warm = !!key && screenCache.has(key);
    if (warm) setData(screenCache.get(key!) as T); else setLoading(true);
    setError(null);
    setConnectionProblem(false);
    if (!opts.keepData && !warm) setData(null);
    fetcherRef.current(controller.signal)
      .then((d) => { if (key) screenCache.set(key, d); if (active) { setData(d); setLoading(false); } })
      .catch((e) => {
        if (!active || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(errorMessage(e));
        setConnectionProblem(e instanceof ApiError && e.isConnectionProblem);
        setLoading(false);
      });
    return () => { active = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, connectionProblem, reload, setData };
}

/** Poll on an interval while the tab is visible (live screens). */
export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") ref.current(); }, ms);
    return () => clearInterval(id);
  }, [ms]);
}
