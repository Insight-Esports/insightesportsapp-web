// Keys for the paged-list cache (usePagedList cacheKey) — shared with the
// launch warm-up in lib/warm.ts so a primed page is the one the list reads.
export const playersCacheKey = (game: string, role: string | null, region: string | null, query: string) => `players:${game}|${role ?? ""}|${region ?? ""}|${query.trim()}`;
export const teamsCacheKey = (game: string, query: string, tier: number | null) => `teams:${game}|${query.trim()}|${tier ?? ""}`;
