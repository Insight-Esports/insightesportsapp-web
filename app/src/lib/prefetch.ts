// prefetch.ts — the web port of Components.swift's ImagePrefetcher.
//
// Instagram-style reveal support: warms the browser's image cache for a
// list's first page BEFORE the list is shown, so rows appear complete — no
// per-cell pop-in. Bounded: at most `cap` distinct URLs, and a hard timeout
// so slow images can never hold the reveal hostage. A failed image simply
// counts as settled (the row will show its fallback mark).
"use client";

import { imageSrc } from "@/components/ui";

export interface PrefetchOptions {
  /** Maximum distinct URLs to warm (the app's default is 24). */
  cap?: number;
  /** Hard ceiling on how long the reveal waits for images (the app's default is 1.5 s). */
  timeoutMs?: number;
}

function loadOne(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
      // Already cached and complete: some browsers never fire onload again.
      if (img.complete && img.naturalWidth > 0) resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Warm `urls` (nulls ignored, duplicates collapsed, first `cap` kept) and
 * resolve when every image has settled OR `timeoutMs` has elapsed —
 * whichever comes first. Never rejects.
 */
export function prefetchImages(urls: (string | null | undefined)[], opts: PrefetchOptions = {}): Promise<void> {
  const cap = opts.cap ?? 24;
  const timeoutMs = opts.timeoutMs ?? 1500;
  if (typeof window === "undefined") return Promise.resolve();

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    if (!raw) continue;
    const u = imageSrc(raw) ?? raw;
    if (!u || seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
    if (unique.length >= cap) break;
  }
  if (unique.length === 0) return Promise.resolve();

  const all = Promise.all(unique.map(loadOne)).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([all, timeout]);
}
