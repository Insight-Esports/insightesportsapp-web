// tournaments/data.ts — the sim tournaments' payloads (backend
// routes/tournaments.js → services/tournamentSimService.js bracket /
// currentForGame, seriesOddsService.tournamentOdds), normalized, plus the
// small derivations the list and the bracket share.
//
//   GET /tournaments/sim/current?game=          → Bracket (404 NO_TOURNAMENT = none yet)
//   GET /tournaments/completed?game=&sim=true   → TournamentRow[] (raw tournaments rows)
//   GET /tournaments/:id/bracket                → Bracket
"use client";

import { ApiError, api, endpoints } from "@/lib/api";
import { bool, int, iso, num, str, type Json } from "@/lib/types";

export interface BracketTeam { id: string; name: string; logoURL: string | null; seed: number | null }
/** upcoming | live | completed | cancelled | tbd */
export type BracketGameStatus = "upcoming" | "live" | "completed" | "cancelled" | "tbd";
export interface BracketGame {
  number: number;
  matchId: string | null;
  status: BracketGameStatus;
  ifNecessary: boolean;
  team1Id: string | null;
  team2Id: string | null;
  winnerId: string | null;
  team1Score: number | null;
  team2Score: number | null;
  mapName: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
}
export interface BracketSeries {
  id: string;
  tournamentId: string | null;
  round: number;
  roundName: string;
  position: number;
  bestOf: number;
  /** upcoming | live | completed — "live" from the first game until decided. */
  status: string;
  team1: BracketTeam | null;
  team2: BracketTeam | null;
  team1Wins: number;
  team2Wins: number;
  winnerId: string | null;
  nextSeriesId: string | null;
  scheduledAt: string | null;
  games: BracketGame[];
  /** Series odds (whole-ish percents) for an open series with both teams. */
  odds: { team1: number; team2: number } | null;
}
export interface BracketRound { round: number; name: string; bestOf: number; series: BracketSeries[] }
export interface TournamentInfo {
  id: string;
  name: string;
  game: string;
  /** upcoming | live | completed */
  status: string;
  edition: number | null;
  teams: number | null;
  startDate: string | null;
  endDate: string | null;
  champion: { id: string; name: string; logoURL: string | null } | null;
}
export interface TitleOddsRow {
  team: BracketTeam;
  /** Chance to win it all (percent, one decimal). */
  champion: number;
  /** Per round: chance to reach it and to win it. */
  rounds: { round: number; name: string | null; reach: number; win: number }[];
  eliminated: boolean;
}
export interface Bracket {
  tournament: TournamentInfo;
  rounds: BracketRound[];
  currentSeriesId: string | null;
  odds: TitleOddsRow[] | null;
}
/** A /tournaments/completed row (the raw tournaments table). */
export interface TournamentRow {
  id: string;
  name: string;
  game: string;
  status: string;
  edition: number | null;
  startDate: string | null;
  endDate: string | null;
  winnerId: string | null;
}

// ── Normalizers ─────────────────────────────────────────────────────────────
function team(raw: Json): BracketTeam | null {
  if (!raw || typeof raw !== "object" || raw.id == null) return null;
  return { id: String(raw.id), name: str(raw.name) ?? "", logoURL: str(raw.logo_url), seed: int(raw.seed) };
}
const GAME_STATUSES = new Set(["upcoming", "live", "completed", "cancelled", "tbd"]);
function game(raw: Json): BracketGame {
  const status = str(raw?.status) ?? "upcoming";
  return {
    number: int(raw?.number) ?? 0,
    matchId: str(raw?.match_id),
    status: (GAME_STATUSES.has(status) ? status : "upcoming") as BracketGameStatus,
    ifNecessary: bool(raw?.if_necessary),
    team1Id: str(raw?.team1_id),
    team2Id: str(raw?.team2_id),
    winnerId: str(raw?.winner_id),
    team1Score: int(raw?.team1_score),
    team2Score: int(raw?.team2_score),
    mapName: str(raw?.map_name),
    scheduledAt: iso(raw?.scheduled_at),
    completedAt: iso(raw?.completed_at),
  };
}
function series(raw: Json): BracketSeries {
  const odds = raw?.odds && num(raw.odds.team1) != null && num(raw.odds.team2) != null ? { team1: num(raw.odds.team1)!, team2: num(raw.odds.team2)! } : null;
  return {
    id: String(raw?.id ?? ""),
    tournamentId: str(raw?.tournament_id),
    round: int(raw?.round) ?? 1,
    roundName: str(raw?.round_name) ?? "",
    position: int(raw?.position) ?? 1,
    bestOf: int(raw?.best_of) ?? 1,
    status: str(raw?.status) ?? "upcoming",
    team1: team(raw?.team1),
    team2: team(raw?.team2),
    team1Wins: int(raw?.team1_wins) ?? 0,
    team2Wins: int(raw?.team2_wins) ?? 0,
    winnerId: str(raw?.winner_id),
    nextSeriesId: str(raw?.next_series_id),
    scheduledAt: iso(raw?.scheduled_at),
    games: (Array.isArray(raw?.games) ? raw.games : []).map(game).sort((a: BracketGame, b: BracketGame) => a.number - b.number),
    odds,
  };
}
function tournamentInfo(raw: Json): TournamentInfo {
  const c = raw?.champion;
  return {
    id: String(raw?.id ?? ""),
    name: str(raw?.name) ?? "",
    game: str(raw?.game) ?? "",
    status: str(raw?.status) ?? "live",
    edition: int(raw?.edition),
    teams: int(raw?.teams),
    startDate: iso(raw?.start_date),
    endDate: iso(raw?.end_date),
    champion: c && c.id != null ? { id: String(c.id), name: str(c.name) ?? "", logoURL: str(c.logo_url) } : null,
  };
}
export function normalizeBracket(raw: Json): Bracket {
  const rounds: BracketRound[] = (Array.isArray(raw?.rounds) ? raw.rounds : []).map((r: Json) => ({
    round: int(r?.round) ?? 1,
    name: str(r?.name) ?? "",
    bestOf: int(r?.best_of) ?? 1,
    series: (Array.isArray(r?.series) ? r.series : []).map(series).sort((a: BracketSeries, b: BracketSeries) => a.position - b.position),
  })).sort((a: BracketRound, b: BracketRound) => a.round - b.round);
  const oddsTeams = Array.isArray(raw?.odds?.teams) ? raw.odds.teams : null;
  return {
    tournament: tournamentInfo(raw?.tournament),
    rounds,
    currentSeriesId: str(raw?.current_series_id),
    odds: oddsTeams
      ? oddsTeams.filter((o: Json) => o?.team?.id != null).map((o: Json) => ({
        team: team(o.team)!,
        champion: num(o.champion) ?? 0,
        rounds: (Array.isArray(o.rounds) ? o.rounds : []).map((x: Json) => ({ round: int(x?.round) ?? 0, name: str(x?.name), reach: num(x?.reach) ?? 0, win: num(x?.win) ?? 0 })),
        eliminated: bool(o.eliminated),
      }))
      : null,
  };
}
export function normalizeTournamentRows(raw: Json): TournamentRow[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.tournaments) ? raw.tournaments : [];
  return arr.filter((r: Json) => r?.id != null).map((r: Json) => ({
    id: String(r.id),
    name: str(r.name) ?? "",
    game: str(r.game) ?? "",
    status: str(r.status) ?? "completed",
    edition: int(r.edition),
    startDate: iso(r.start_date),
    endDate: iso(r.end_date),
    winnerId: str(r.winner_id),
  }));
}

// ── Fetchers ────────────────────────────────────────────────────────────────
/** The active tournament for a game (or the last one during the break); null before the first. */
export async function fetchCurrent(game: string, signal?: AbortSignal): Promise<Bracket | null> {
  try {
    return normalizeBracket(await api.get(endpoints.tournamentCurrent(game), { signal }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
export async function fetchCompleted(game: string, signal?: AbortSignal): Promise<TournamentRow[]> {
  return normalizeTournamentRows(await api.get(endpoints.tournamentsCompleted(game), { signal }));
}
export async function fetchBracket(id: string, signal?: AbortSignal): Promise<Bracket> {
  return normalizeBracket(await api.get(endpoints.tournamentBracket(id), { signal }));
}

// ── Derivations ─────────────────────────────────────────────────────────────
/** The column label: R16 · QF · SF · FINAL (by name, else by distance from the final). */
export function roundShort(name: string | null | undefined, round: number, rounds: number): string {
  const n = (name ?? "").toLowerCase();
  if (n.startsWith("round of")) return `R${n.replace(/\D/g, "") || "16"}`;
  if (n.startsWith("quarter")) return "QF";
  if (n.startsWith("semi")) return "SF";
  if (n === "final" || n === "grand final") return "FINAL";
  return ["FINAL", "SF", "QF", "R16", "R32"][rounds - round] ?? `R${round}`;
}
/** "Quarterfinals", "Semifinals", "Final", "Round of 16". */
export function roundPlural(name: string): string {
  if (/^(quarter|semi)final$/i.test(name)) return `${name}s`;
  return name;
}
/** A series a game is being played in, or one between its games (status live). */
export function seriesIsLive(s: BracketSeries): boolean {
  return s.status === "live" || s.games.some((g) => g.status === "live");
}
export function seriesDecided(s: BracketSeries): boolean {
  return s.status === "completed" || !!s.winnerId;
}
/** The game on now in a series, if any. */
export function liveGameOf(s: BracketSeries): BracketGame | null {
  return s.games.find((g) => g.status === "live") ?? null;
}
/** Every game on now in a bracket, with its series. */
export function liveGames(b: Bracket): { series: BracketSeries; game: BracketGame }[] {
  const out: { series: BracketSeries; game: BracketGame }[] = [];
  for (const r of b.rounds) for (const s of r.series) { const g = liveGameOf(s); if (g && g.matchId) out.push({ series: s, game: g }); }
  return out;
}
export function findSeries(b: Bracket, id: string | null | undefined): BracketSeries | null {
  if (!id) return null;
  for (const r of b.rounds) for (const s of r.series) if (s.id === id) return s;
  return null;
}
/** "8 teams · Bo3 · Bo3 · Bo5" (+ " · Completed"). */
export function formatLine(b: Bracket): string {
  const teams = b.tournament.teams ?? (b.rounds[0] ? b.rounds[0].series.length * 2 : null);
  const parts = [teams ? `${teams} teams` : null, ...b.rounds.map((r) => `Bo${r.bestOf}`)].filter(Boolean) as string[];
  return parts.join(" · ") + (b.tournament.status === "completed" ? " · Completed" : "");
}
/** When a series' next game is due (the first game still to play), else the series' own projected start. */
export function nextStartOf(s: BracketSeries): string | null {
  const g = s.games.find((x) => x.status === "upcoming" || x.status === "tbd");
  return g?.scheduledAt ?? s.scheduledAt;
}
/** "9:10 PM" today, else the weekday ("FRI"). */
export function startLabel(isoTime: string | null, now = new Date()): string | null {
  if (!isoTime) return null;
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return null;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
}
/** A placement word for Honors. */
export function placementWord(p: string): string {
  switch (p) {
    case "champion": return "Champion";
    case "runner_up": return "Runner-up";
    case "semifinalist": return "Semifinal";
    case "quarterfinalist": return "Quarterfinal";
    case "round_of_16": return "Round of 16";
    default: return p ? p.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—";
  }
}
