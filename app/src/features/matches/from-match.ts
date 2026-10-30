// from-match.ts — a team or player opened from a match screen carries
// `?from=match:<id>` so its back chevron returns to that match instead
// of the Teams / Players tab (the app pops back to the match it came from).
// The Schedule calendar opened from a team / player page carries
// `?from=<that page's path>` the same way.

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
