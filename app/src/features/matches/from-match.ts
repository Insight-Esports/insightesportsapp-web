// from-match.ts — a team or player opened from a match screen carries
// `?from=match:<id>` so its back chevron returns to that match instead
// of the Teams / Players tab (the app pops back to the match it came from).
// The Schedule calendar opened from a team / player page carries
// `?from=<that page's path>` the same way.
//
// Never a second copy of a screen (iOS LiveMatchOrigin / `returns`): a link
// to the screen directly beneath this one goes back to it instead of
// stacking it again (useBackToScreen). A live match's series and bracket
// links, and a series page's Watch row, use it.
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { BASE_PATH } from "@/lib/base-path";

/** Append `from=match:<id>` to an in-app href (keeps any existing query / hash). */
export function withFromMatch(href: string, matchId: string | null | undefined): string {
  if (!matchId) return href;
  const hashAt = href.indexOf("#");
  const base = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}from=${encodeURIComponent(`match:${matchId}`)}${hash}`;
}

/** Where a detail screen's back chevron goes: the match named by `from`, a
 *  series page path (`/tournaments/series/<id>?from=…`, so match → series →
 *  bracket unwinds in order), else the tab. */
export function backHrefFrom(from: string | null | undefined, fallback: string): string {
  if (from && from.startsWith("match:")) {
    const id = from.slice("match:".length);
    if (id) return `/match/${encodeURIComponent(id)}`;
  }
  const series = seriesPathFrom(from);
  if (series) return series;
  return fallback;
}

/** The series page a `from` names (an in-app `/tournaments/series/…` path), or null. */
export function seriesPathFrom(from: string | null | undefined): string | null {
  const path = pagePathFrom(from);
  return path && path.startsWith("/tournaments/series/") ? path : null;
}

/** The in-app path a calendar `from` names, or null (never another origin). */
export function pagePathFrom(from: string | null | undefined): string | null {
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.includes("\\")) return null;
  return from;
}

// ── Back to the screen beneath ────────────────────────────────────────────

/** The screen an in-app path names: its pathname, decoded ("/a/b%20c?x#y" → "/a/b c"). */
export function pathnameOf(path: string): string {
  const cut = path.search(/[?#]/);
  const p = (cut >= 0 ? path.slice(0, cut) : path).replace(/\/+$/, "") || "/";
  try { return decodeURIComponent(p); } catch { return p; }
}

/** A match page's own path, keeping the `from` it was opened with, so a
 *  page opened from it can hand the exact page back. */
export function matchSelfPath(matchId: string, from: string | null | undefined): string {
  const base = `/match/${encodeURIComponent(matchId)}`;
  return from ? `${base}?from=${encodeURIComponent(from)}` : base;
}

/** The match a page path names ("/match/<id>?from=…") and that match's own `from`, or null. */
export function matchPathParts(path: string | null | undefined): { id: string; from: string | null } | null {
  const hit = path ? /^\/match\/([^/?#]+)/.exec(path) : null;
  if (!path || !hit) return null;
  const q = path.indexOf("?");
  const from = q >= 0 ? new URLSearchParams(path.slice(q + 1).split("#")[0]).get("from") : null;
  let id = hit[1];
  try { id = decodeURIComponent(id); } catch { /* keep as written */ }
  return { id, from };
}

/** The match page a page was opened from: `pagePath`'s own `from`, when it
 *  names a match page (a series page opened from its live game). */
export function matchOpenedFrom(pagePath: string): { id: string; from: string | null; path: string } | null {
  const q = pagePath.indexOf("?");
  const path = pagePathFrom(q >= 0 ? new URLSearchParams(pagePath.slice(q + 1).split("#")[0]).get("from") : null);
  const parts = matchPathParts(path);
  return parts && path ? { ...parts, path } : null;
}

interface NavEntry { url: string | null; index: number }
interface NavApi { currentEntry: NavEntry | null; entries(): NavEntry[] }

/** The in-app path of the history entry directly beneath this one (the
 *  Navigation API). null: nothing beneath (a deep link, another site);
 *  undefined: this browser can't say. */
export function pathBeneath(): string | null | undefined {
  if (typeof window === "undefined") return undefined;
  const nav = (window as Window & { navigation?: NavApi }).navigation;
  const cur = nav?.currentEntry;
  if (!nav || !cur || typeof nav.entries !== "function") return undefined;
  const prev = cur.index > 0 ? nav.entries().find((e) => e.index === cur.index - 1) : null;
  if (!prev?.url) return null;
  try {
    const u = new URL(prev.url);
    if (u.origin !== window.location.origin) return null;
    let p = u.pathname;
    if (BASE_PATH && (p === BASE_PATH || p.startsWith(`${BASE_PATH}/`))) p = p.slice(BASE_PATH.length) || "/";
    return p + u.search;
  } catch {
    return null;
  }
}

/** `target`'s screen sits directly beneath this one. `openedFrom`: this
 *  page's `from` names it, the guess when the browser can't list its history. */
export function isScreenBeneath(target: string, openedFrom = false): boolean {
  const beneath = pathBeneath();
  if (beneath === undefined) return openedFrom && typeof window !== "undefined" && window.history.length > 1;
  return beneath !== null && pathnameOf(beneath) === pathnameOf(target);
}

/** onClick for a link to `target` (or onClickCapture on a wrapper around
 *  one): a plain click goes back when that screen is directly beneath, never
 *  a second copy of it. Otherwise (and for new-tab clicks) the link opens. */
export function useBackToScreen(target: string | null, openedFrom = false): (e: MouseEvent) => void {
  const router = useRouter();
  return (e) => {
    if (!target || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!isScreenBeneath(target, openedFrom)) return;
    e.preventDefault();
    router.back();
  };
}
