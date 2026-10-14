// usePagedList — the PlayersViewModel / TeamsViewModel paging pattern:
// a small first page, then `pageSize` more every time the end is reached.
// A page shorter than the limit means the end.
"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { ApiError, errorMessage } from "@/lib/api";

export interface PagedList<T> {
  items: T[];
  /** First page in flight (or not yet requested). */
  loading: boolean;
  loadingMore: boolean;
  /** First page answered (rows or empty) — empty states render only after this. */
  hasLoaded: boolean;
  error: string | null;
  connectionProblem: boolean;
  reachedEnd: boolean;
  reload: () => void;
  loadMore: () => void;
  setItems: (updater: (prev: T[]) => T[]) => void;
}

// First pages kept across remounts (and primed at launch by lib/warm.ts, the
// app's ListWarmStore), so a list renders at once and refreshes underneath.
const pageCache = new Map<string, unknown[]>();
export function primePagedCache<T>(key: string, items: T[]) { pageCache.set(key, items); }
export function hasPagedCache(key: string) { return pageCache.has(key); }
/** Forget every cached first page (logout). */
export function clearPagedCache() { pageCache.clear(); }

export function usePagedList<T>(
  fetchPage: (limit: number, offset: number, signal: AbortSignal) => Promise<T[]>,
  deps: DependencyList,
  opts: { firstPage?: number; pageSize?: number; enabled?: boolean; cacheKey?: string } = {},
): PagedList<T> {
  const firstPage = opts.firstPage ?? 20;
  const pageSize = opts.pageSize ?? 20;
  const enabled = opts.enabled ?? true;
  const cached = opts.cacheKey && pageCache.has(opts.cacheKey) ? (pageCache.get(opts.cacheKey) as T[]) : null;
  const [items, setItems] = useState<T[]>(cached ?? []);
  const [loading, setLoading] = useState(enabled && cached === null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(cached !== null);
  const [error, setError] = useState<string | null>(null);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [tick, setTick] = useState(0);
  const fetcher = useRef(fetchPage);
  fetcher.current = fetchPage;
  const offset = useRef(0);
  const inFlight = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const gen = ++generation.current;
    const controller = new AbortController();
    const key = opts.cacheKey;
    const warm = key ? (pageCache.get(key) as T[] | undefined) : undefined;
    if (warm) { setItems(warm); setHasLoaded(true); offset.current = warm.length; setReachedEnd(warm.length < firstPage); } else { setLoading(true); setReachedEnd(false); offset.current = 0; }
    setError(null);
    setConnectionProblem(false);
    fetcher.current(firstPage, 0, controller.signal)
      .then((page) => {
        if (key) pageCache.set(key, page);
        if (gen !== generation.current) return;
        setItems(page);
        offset.current = page.length;
        setReachedEnd(page.length < firstPage);
        setHasLoaded(true);
        setLoading(false);
      })
      .catch((e) => {
        if (gen !== generation.current || (e instanceof DOMException && e.name === "AbortError")) return;
        setItems([]);
        setError(errorMessage(e));
        setConnectionProblem(e instanceof ApiError && e.isConnectionProblem);
        setReachedEnd(true);
        setHasLoaded(true);
        setLoading(false);
      });
    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled, firstPage]);

  const loadMore = useCallback(() => {
    if (reachedEnd || inFlight.current || loading || !hasLoaded) return;
    inFlight.current = true;
    setLoadingMore(true);
    const gen = generation.current;
    const controller = new AbortController();
    fetcher.current(pageSize, offset.current, controller.signal)
      .then((page) => {
        if (gen !== generation.current) return;
        setItems((prev) => prev.concat(page));
        offset.current += page.length;
        setReachedEnd(page.length < pageSize);
      })
      .catch(() => { if (gen === generation.current) setReachedEnd(true); })
      .finally(() => { inFlight.current = false; setLoadingMore(false); });
  }, [reachedEnd, loading, hasLoaded, pageSize]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setItemsFn = useCallback((updater: (prev: T[]) => T[]) => setItems(updater), []);

  return { items, loading, loadingMore, hasLoaded, error, connectionProblem, reachedEnd, reload, loadMore, setItems: setItemsFn };
}
