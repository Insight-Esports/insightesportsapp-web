// features/teams/types.ts — TeamDetailView.swift / Mappoolsection.swift
// response models, decoded tolerantly.
import { bool, int, num, str, type Json } from "@/lib/types";

export type TeamSortOption = "Ranking" | "Win Rate" | "Alphabetical";
export const TEAM_SORT_OPTIONS: TeamSortOption[] = ["Ranking", "Win Rate", "Alphabetical"];

// Correct 2026 regions per game (TeamsViewModel.regionsForGame)
export function teamRegionsForGame(game: string): string[] {
  switch (game) {
    case "VALORANT": return ["NA", "EMEA", "APAC", "Brazil"];
    case "CS2": return ["NA", "Europe", "CIS", "Asia"];
    case "League": return ["LCK", "LEC", "LCS", "LPL"];
    default: return [];
  }
}

// ── Titles ────────────────────────────────────────────────────────────────
export interface TeamTitle {
  id: string;
  title: string;
  tournament: string;
  year: number | null;
  game: string | null;
  isMajor: boolean;
}
export interface TeamTitles {
  totalTitles: number;
  majorTitles: number;
  titles: TeamTitle[];
}
export function normalizeTeamTitles(raw: Json): TeamTitles {
  const arr: Json[] = Array.isArray(raw?.titles) ? raw.titles : [];
  const titles: TeamTitle[] = arr.filter((t) => t?.id != null).map((t) => {
    const tournament = str(t.tournament) ?? "";
    return {
      id: String(t.id),
      title: str(t.title) ?? tournament,
      tournament,
      year: int(t.year),
      game: str(t.game),
      isMajor: bool(t.is_major ?? t.isMajor),
    };
  });
  return {
    totalTitles: int(raw?.totalTitles) ?? titles.length,
    majorTitles: int(raw?.majorTitles) ?? titles.filter((t) => t.isMajor).length,
    titles,
  };
}

// ── Sides ─────────────────────────────────────────────────────────────────
export interface TeamSide {
  side: string;
  label: string;
  matchesPlayed: number;
  avgKills: number;
  avgDeaths: number;
  avgAdr: number;
  avgPlusMinus: number;
}
export function normalizeTeamSides(raw: Json): TeamSide[] {
  const arr: Json[] = Array.isArray(raw?.sides) ? raw.sides : Array.isArray(raw) ? raw : [];
  return arr.filter((s) => s?.side != null).map((s) => ({
    side: String(s.side),
    label: str(s.label) ?? String(s.side),
    matchesPlayed: int(s.matchesPlayed ?? s.matches_played) ?? 0,
    avgKills: num(s.avgKills ?? s.avg_kills) ?? 0,
    avgDeaths: num(s.avgDeaths ?? s.avg_deaths) ?? 0,
    avgAdr: num(s.avgAdr ?? s.avg_adr) ?? 0,
    avgPlusMinus: num(s.avgPlusMinus ?? s.avg_plus_minus) ?? 0,
  }));
}

// ── Stats ─────────────────────────────────────────────────────────────────
export interface TeamStats {
  totalMatches: number;
  avgTeamAcs: number | null;
  avgTeamAdr: number | null;
  hltvRanking: number | null;
  hltvRating: number | null;
  avgGoldDiffAt15: number | null;
  avgKda: number | null;
  worldsAppearances: number | null;
  worldsTitles: number | null;
}
export function normalizeTeamStats(raw: Json): TeamStats {
  const a = raw?.avgStats && typeof raw.avgStats === "object" ? raw.avgStats : raw?.avg_stats ?? {};
  // The backend coalesces missing aggregates to 0 — treat 0 as "not served".
  const nz = (v: Json) => { const n = num(v); return n == null || n === 0 ? null : n; };
  return {
    totalMatches: int(raw?.totalMatches ?? raw?.total_matches) ?? 0,
    avgTeamAcs: nz(a.avgTeamAcs ?? a.avg_team_acs),
    avgTeamAdr: nz(a.avgTeamAdr ?? a.avg_team_adr),
    hltvRanking: int(a.hltvRanking ?? a.hltv_ranking),
    hltvRating: nz(a.hltvRating ?? a.hltv_rating),
    avgGoldDiffAt15: num(a.avgGoldDiffAt15 ?? a.avg_gold_diff_at_15),
    avgKda: nz(a.avgKda ?? a.avg_kda),
    worldsAppearances: int(a.worldsAppearances ?? a.worlds_appearances),
    worldsTitles: int(a.worldsTitles ?? a.worlds_titles),
  };
}

// ── Map pool (free route; tolerant: either key style) ─────────────────────
export interface MapPoolEntry {
  id: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}
function entry(id: string, name: string, games: number, wins: number, losses: number | null): MapPoolEntry {
  const l = losses ?? Math.max(0, games - wins);
  return { id, name, games, wins, losses: l, winRate: games > 0 ? wins / games : 0 };
}
function sideEntries(sides: Json): MapPoolEntry[] {
  const out: MapPoolEntry[] = [];
  for (const [key, label] of [["blue", "Blue side"], ["red", "Red side"]] as const) {
    const s = sides?.[key];
    const g = int(s?.games ?? s?.games_played);
    if (s && g != null && g > 0) out.push(entry(key, label, g, int(s.wins) ?? 0, int(s.losses)));
  }
  return out;
}
export function normalizeMapPool(raw: Json, isLeague: boolean): MapPoolEntry[] {
  if (isLeague && raw?.sides) return sideEntries(raw.sides);
  const maps: Json[] = Array.isArray(raw?.maps) ? raw.maps : [];
  const out: MapPoolEntry[] = [];
  for (const m of maps) {
    const name = str(m?.map) ?? str(m?.mapName) ?? str(m?.map_name);
    const g = int(m?.games ?? m?.gamesPlayed ?? m?.games_played);
    if (!name || g == null || g <= 0) continue;
    out.push(entry(name, name, g, int(m.wins) ?? 0, int(m.losses)));
  }
  return out.sort((a, b) => (a.games !== b.games ? b.games - a.games : b.winRate - a.winRate));
}

// ── Coach (GET /coaches/:id — history) ────────────────────────────────────
export interface CoachHistoryRow {
  teamName: string | null;
  teamLogoURL: string | null;
  role: string | null;
  from: string | null;
  to: string | null;
}
export function normalizeCoachHistory(raw: Json): CoachHistoryRow[] {
  const arr: Json[] = Array.isArray(raw?.history) ? raw.history : Array.isArray(raw?.teams) ? raw.teams : [];
  return arr.map((h) => ({
    teamName: str(h?.team_name) ?? str(h?.teamName),
    teamLogoURL: str(h?.team_logo_url) ?? str(h?.teamLogoURL),
    role: str(h?.role),
    from: str(h?.from) ?? str(h?.since),
    to: str(h?.to) ?? str(h?.until),
  }));
}
