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

export function useFetch<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: DependencyList, opts: { enabled?: boolean; keepData?: boolean } = {}): FetchState<T> {
  const enabled = opts.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    setConnectionProblem(false);
    if (!opts.keepData) setData(null);
    fetcherRef.current(controller.signal)
      .then((d) => { if (active) { setData(d); setLoading(false); } })
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
