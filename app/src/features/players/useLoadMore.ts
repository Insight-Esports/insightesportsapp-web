// useLoadMore — the web's `.onAppear` on the last row: an IntersectionObserver
// sentinel that fires `onReach` when it scrolls into view. Returns the ref to
// attach to the sentinel element.
"use client";

import { useEffect, useRef, useState } from "react";

export function useLoadMore(onReach: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useRef(onReach);
  cb.current = onReach;
  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) cb.current();
    }, { rootMargin: "240px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}

/** Debounced value (the 300ms search debounce the view models use). */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
