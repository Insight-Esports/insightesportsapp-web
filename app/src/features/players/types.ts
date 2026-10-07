// features/players/types.ts — local shapes for the Players screens
// (PlayersView / PlayerDetailView / RecentGamesList / PlayerCommentsView),
// decoded tolerantly like src/lib/types.ts.
import { int, iso, normalizeComment, num, str, type Json, type PlayerComment } from "@/lib/types";

// ── Filter options (GET /players/filters) ─────────────────────────────────
export interface PlayerFilterOptions {
  regions: string[];
  roles: string[];
}
export function normalizeFilterOptions(raw: Json): PlayerFilterOptions {
  const list = (v: Json) => (Array.isArray(v) ? v.map(String) : []);
  return { regions: list(raw?.regions), roles: list(raw?.roles) };
}

// Fallback filter options, used only if /players/filters fails. These match
// the backend's VALID_ROLES / VALID_REGIONS exactly.
export function rolesForGame(game: string): string[] {
  switch (game) {
    case "VALORANT": return ["Duelist", "Controller", "Initiator", "Sentinel"];
    case "CS2": return ["AWPer", "Rifler", "Entry", "Support", "IGL"];
    case "League": return ["Top", "Jungle", "Mid", "Bot", "Support"];
    default: return [];
  }
}
export function regionsForGame(game: string): string[] {
  switch (game) {
    case "VALORANT": return ["NA", "EMEA", "APAC", "Brazil"];
    case "CS2": return ["NA", "Europe", "CIS", "Asia"];
    case "League": return ["LCK", "LEC", "LCS", "LPL"];
    default: return [];
  }
}

// ── One row of GET /players/:id/matches (PlayerGameRow) ───────────────────
// Tolerant: every field optional, `completed_at` is the paging cursor
// (falls back to start_time).
export interface PlayerGameRow {
  id: string;
  matchId: string | null;
  opponentName: string | null;
  opponentLogoURL: string | null;
  mapName: string | null;
  startTime: string | null;
  completedAt: string | null;
  kills: number;
  deaths: number;
  assists: number;
  acs: number | null;
  rating: number | null;
  kda: number | null;
  side: string | null;
}
export function normalizePlayerGameRow(raw: Json): PlayerGameRow {
  const matchId = str(raw.match_id);
  const startTime = iso(raw.start_time);
  const opponentName = str(raw.opponent_name);
  const mapName = str(raw.map_name);
  return {
    id: matchId ?? `${startTime ?? ""}|${opponentName ?? ""}|${mapName ?? ""}`,
    matchId,
    opponentName,
    opponentLogoURL: str(raw.opponent_logo_url),
    mapName,
    startTime,
    completedAt: iso(raw.completed_at),
    kills: int(raw.kills) ?? 0,
    deaths: int(raw.deaths) ?? 0,
    assists: int(raw.assists) ?? 0,
    acs: num(raw.acs),
    rating: num(raw.rating),
    kda: num(raw.kda),
    side: str(raw.side),
  };
}
export function normalizePlayerGameRows(raw: Json): PlayerGameRow[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.matches) ? raw.matches : Array.isArray(raw?.data) ? raw.data : [];
  const out: PlayerGameRow[] = [];
  for (const r of arr) { try { out.push(normalizePlayerGameRow(r)); } catch { /* skip */ } }
  return out;
}
/** When the game happened: completed_at, else start_time (the paging key). */
export function rowWhen(r: PlayerGameRow): string {
  return r.completedAt ?? r.startTime ?? "1970-01-01T00:00:00.000Z";
}
/** KDA computes from the row itself when the payload doesn't send it — (K+A)/D. */
export function rowKDA(r: PlayerGameRow): number {
  return r.kda ?? (r.kills + r.assists) / Math.max(r.deaths, 1);
}

// ── Agent / champion breakdown (predictions/player-overview) ──────────────
export interface AgentStats {
  name: string;
  matches: number;
  winRate: number;        // 0–100, 0 = unknown (rendered "—")
  avgStat: number;        // avg kills (VAL/CS2) or KDA (League)
  avgKDA: number | null;
  avgMarquee: number | null;   // ACS (VAL) / rating (CS2) when served
}
export interface PlayerOverview {
  agents: AgentStats[];
  seasonWinRate: string | null;
  seasonGamesPlayed: number | null;
}
export function normalizePlayerOverview(raw: Json, game: string): PlayerOverview {
  const items: Json[] = Array.isArray(raw?.agentBreakdown) ? raw.agentBreakdown : Array.isArray(raw?.agent_breakdown) ? raw.agent_breakdown : [];
  const agents: AgentStats[] = [];
  for (const item of items) {
    const name = str(item?.agent) ?? str(item?.champion) ?? str(item?.name);
    if (!name) continue;
    const games = int(item?.gamesPlayed ?? item?.games_played) ?? 0;
    // Win rate: served ("62%" / 62 / 0.62) or wins/games when the payload carries wins.
    let wr = 0;
    const wrRaw = item?.winRate ?? item?.win_rate;
    if (typeof wrRaw === "string") wr = num(wrRaw.replace("%", "")) ?? 0;
    else if (typeof wrRaw === "number") wr = wrRaw <= 1 ? wrRaw * 100 : wrRaw;
    else {
      const wins = int(item?.wins);
      if (wins != null && games > 0) wr = (wins / games) * 100;
    }
    agents.push({
      name,
      matches: games,
      winRate: wr,
      avgStat: num(item?.avgStat ?? item?.avg_stat) ?? 0,
      avgKDA: num(item?.avgKDA ?? item?.avg_kda),
      avgMarquee: game === "VALORANT" ? num(item?.avgACS ?? item?.avg_acs) : num(item?.avgRating ?? item?.avg_rating),
    });
  }
  agents.sort((a, b) => b.matches - a.matches);
  const season = raw?.season && typeof raw.season === "object" ? raw.season : null;
  return {
    agents: agents.slice(0, 5),
    seasonWinRate: season ? str(season.winRate ?? season.win_rate) : null,
    seasonGamesPlayed: season ? int(season.gamesPlayed ?? season.games_played) : null,
  };
}

// ── Comments ──────────────────────────────────────────────────────────────
/** Backend returns { comments: [...], limit, offset, count }; tolerate a bare array. */
export function normalizeCommentsPage(raw: Json): PlayerComment[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.comments) ? raw.comments : [];
  const out: PlayerComment[] = [];
  for (const r of arr) { try { if (r?.id != null) out.push(normalizeComment(r)); } catch { /* skip */ } }
  return out;
}
/** Decodes EITHER { comment: {...} } or a bare comment. */
export function normalizeCreatedComment(raw: Json): PlayerComment | null {
  const obj = raw?.comment && typeof raw.comment === "object" ? raw.comment : raw;
  if (!obj || obj.id == null) return null;
  try { return normalizeComment(obj); } catch { return null; }
}
