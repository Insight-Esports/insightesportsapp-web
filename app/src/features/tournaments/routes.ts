// tournaments/routes.ts — the shared hrefs for tournaments, brackets and
// series. Back navigation is carried in `from` so match → series → bracket
// unwinds in order.

function withFrom(path: string, from?: string | null): string {
  return from ? `${path}${path.includes("?") ? "&" : "?"}from=${encodeURIComponent(from)}` : path;
}

/** Schedule → Tournaments tab. */
export const tournamentsHref = (game?: string | null) => `/tournaments${game && game !== "all" ? `?game=${encodeURIComponent(game)}` : ""}`;
/** A tournament's bracket page. */
export const bracketHref = (tournamentId: string | number) => `/tournaments/${encodeURIComponent(String(tournamentId))}`;
/** A series page; `from` is the bracket (or page) to return to. */
export const seriesHref = (seriesId: string | number, from?: string | null) => withFrom(`/tournaments/series/${encodeURIComponent(String(seriesId))}`, from);
/** A match opened from a series page; Back returns to the series. */
export const matchFromSeriesHref = (matchId: string | number, seriesPath: string) => withFrom(`/match/${encodeURIComponent(String(matchId))}`, seriesPath);
