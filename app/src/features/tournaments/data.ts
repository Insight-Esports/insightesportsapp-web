// tournaments/data.ts — the sim tournaments' payloads (backend
// routes/tournaments.js → services/tournamentSimService.js bracket /
// currentForGame, seriesOddsService.tournamentOdds, and for a staged
// tournament tournamentStagesService.decorate / stagedOdds), normalized,
// plus the small derivations the list and the bracket share.
//
//   GET /tournaments/sim/current?game=          → Bracket (404 NO_TOURNAMENT = none yet)
//   GET /tournaments/completed?game=&sim=true   → TournamentRow[] (raw tournaments rows)
//   GET /tournaments/:id/bracket                → Bracket
//
// Stages (iOS Tournaments.swift TournamentBracket.Stage): a cup is one
// playoff bracket; swiss16 / groups16 / major32 carry stages[] (Swiss,
// groups, then the playoffs, single or double elimination). A payload from
// before stages is read as one playoff stage of its rounds.
"use client";

import { ApiError, api, endpoints } from "@/lib/api";
import { bool, int, iso, num, str, type Json } from "@/lib/types";

export interface BracketTeam { id: string; name: string; logoURL: string | null; seed: number | null }
/** Double elimination: which bracket a round or series is in; null in a single elimination, a Swiss round or a group. */
export type BracketSide = "upper" | "lower" | "grand_final" | null;
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
  bracket: BracketSide;
  /** The group this series is in, in a group stage. */
  group: string | null;
}
export interface BracketRound { round: number; name: string; bestOf: number; bracket: BracketSide; series: BracketSeries[] }

/** One team's line in a Swiss or group table. */
export interface Standing {
  team: BracketTeam;
  wins: number;
  losses: number;
  /** Map (or round, in best-of-ones) difference, the tiebreak. */
  diff: number | null;
  /** advanced | eliminated | playing */
  status: string | null;
  /** A group: 1st to 4th once decided (1st and 2nd go through). */
  place: number | null;
}
export interface StageGroup { name: string; standings: Standing[]; series: BracketSeries[] }
export type StageKind = "swiss" | "groups" | "bracket" | "unknown";
/** One stage, in playing order: a Swiss stage, a group stage or the playoff bracket. */
export interface Stage {
  id: string;
  kind: StageKind;
  name: string;
  position: number;
  /** upcoming | live | completed */
  status: string;
  /** Bracket: single | double. Groups: gsl | round_robin. */
  format: string | null;
  teams: number | null;
  /** How many go through to the next stage. */
  advance: number | null;
  /** Upper (or the only) rounds first, then the lower, the grand final last. Swiss: every round, the unpaired ones empty. */
  rounds: BracketRound[];
  standings: Standing[];
  groups: StageGroup[];
}
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
  /** swiss16 · groups16 · major32 · cup16; null for an 8-team cup. */
  template: string | null;
}
export interface TitleOddsRow {
  team: BracketTeam;
  /** Chance to win it all (percent, one decimal). */
  champion: number;
  /** Per column the server lists: the chance to reach it ("Playoffs" is round 0 with a stage before). */
  rounds: { round: number; name: string | null; reach: number; win: number }[];
  eliminated: boolean;
}
export interface Bracket {
  tournament: TournamentInfo;
  /** The stages in playing order (one playoff stage for a cup). */
  stages: Stage[];
  /** The playoff rounds (the last bracket stage's). */
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
const SIDES = new Set(["upper", "lower", "grand_final"]);
const side = (v: unknown): BracketSide => (typeof v === "string" && SIDES.has(v) ? (v as BracketSide) : null);
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
    bracket: side(raw?.bracket),
    group: str(raw?.group),
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
    template: str(raw?.template),
  };
}
const SIDE_ORDER: Record<string, number> = { upper: 0, lower: 1, grand_final: 2 };
/** Upper (or the only) rounds first, then the lower, the grand final last; by round within. */
function roundOrder(a: BracketRound, b: BracketRound): number {
  return (SIDE_ORDER[a.bracket ?? "upper"] - SIDE_ORDER[b.bracket ?? "upper"]) || a.round - b.round;
}
function rounds(raw: Json): BracketRound[] {
  return (Array.isArray(raw) ? raw : []).map((r: Json) => {
    const list: BracketSeries[] = (Array.isArray(r?.series) ? r.series : []).map(series).sort((a: BracketSeries, b: BracketSeries) => a.position - b.position);
    const n = int(r?.round) ?? 1;
    return {
      round: n,
      name: str(r?.name) ?? `Round ${n}`,
      // An unpaired Swiss round has no length yet (best_of null).
      bestOf: int(r?.best_of) ?? (list.length ? Math.min(...list.map((x) => x.bestOf)) : 1),
      bracket: side(r?.bracket) ?? list.find((x) => x.bracket)?.bracket ?? null,
      series: list,
    };
  }).sort(roundOrder);
}
function standing(raw: Json): Standing | null {
  const t = team(raw?.team);
  if (!t) return null;
  return { team: t, wins: int(raw?.wins) ?? 0, losses: int(raw?.losses) ?? 0, diff: int(raw?.diff), status: str(raw?.status), place: int(raw?.place) };
}
const standings = (raw: Json): Standing[] => (Array.isArray(raw) ? raw : []).map(standing).filter((x: Standing | null): x is Standing => !!x);
const KINDS = new Set(["swiss", "groups", "bracket"]);
function stage(raw: Json): Stage {
  const position = int(raw?.position) ?? 1;
  const kind = str(raw?.kind);
  return {
    id: str(raw?.id) ?? `stage-${position}`,
    kind: (kind && KINDS.has(kind) ? kind : "unknown") as StageKind,
    name: str(raw?.name) ?? `Stage ${position}`,
    position,
    status: str(raw?.status) ?? "upcoming",
    format: str(raw?.format),
    teams: int(raw?.teams),
    advance: int(raw?.advance),
    rounds: rounds(raw?.rounds),
    standings: standings(raw?.standings),
    groups: (Array.isArray(raw?.groups) ? raw.groups : []).map((g: Json) => ({
      name: str(g?.name) ?? "A",
      standings: standings(g?.standings),
      series: (Array.isArray(g?.series) ? g.series : []).map(series),
    })),
  };
}
export function normalizeBracket(raw: Json): Bracket {
  const tournament = tournamentInfo(raw?.tournament);
  const listed: Stage[] = (Array.isArray(raw?.stages) ? raw.stages : []).map(stage).sort((a: Stage, b: Stage) => a.position - b.position);
  // A payload from before stages: its rounds are the playoffs.
  const stages: Stage[] = listed.length ? listed : [{
    id: "playoffs", kind: "bracket", name: "Playoffs", position: 1, status: tournament.status,
    format: null, teams: null, advance: null, rounds: rounds(raw?.rounds), standings: [], groups: [],
  }];
  const playoffs = [...stages].reverse().find((s) => s.kind === "bracket") ?? stages[stages.length - 1];
  const oddsTeams = Array.isArray(raw?.odds?.teams) ? raw.odds.teams : null;
  return {
    tournament,
    stages,
    rounds: playoffs?.rounds ?? [],
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
/**
 * The column label (iOS BracketView.shortRound): Round of 16 → R16,
 * Quarterfinal → QF, Round 3 → R3, Playoffs → PO, Upper Quarterfinal → UQF,
 * Upper Final → UF, Lower Round 2 → LR2, Lower Final → LF, Grand Final → GF.
 * Without a name: by distance from the final.
 */
export function roundShort(name: string | null | undefined, round = 1, rounds = 1): string {
  let n = (name ?? "").trim().toLowerCase();
  if (!n) return ["FINAL", "SF", "QF", "R16", "R32"][rounds - round] ?? `R${round}`;
  if (n.startsWith("grand")) return "GF";
  if (n.startsWith("playoff")) return "PO";
  let sideMark = "";
  if (n.startsWith("upper ")) { n = n.slice(6); sideMark = "U"; } else if (n.startsWith("lower ")) { n = n.slice(6); sideMark = "L"; }
  let core: string;
  if (n.startsWith("round")) core = `R${n.replace(/\D/g, "")}`;
  else if (n.startsWith("quarter")) core = "QF";
  else if (n.startsWith("semi")) core = "SF";
  else if (n.startsWith("final")) core = sideMark ? "F" : "FINAL";
  else core = n.slice(0, 3).toUpperCase();
  return sideMark + core;
}
/** "Quarterfinals", "Upper Semifinals", "Final", "Round of 16": a round name with several series takes the plural (iOS roundTitle). */
export function roundPlural(name: string, count = 1): string {
  return count > 1 && /final$/i.test(name) ? `${name}s` : name;
}

// ── Stages ──────────────────────────────────────────────────────────────────
export function stageSeries(st: Stage): BracketSeries[] {
  return [...st.rounds.flatMap((r) => r.series), ...st.groups.flatMap((g) => g.series)];
}
/** Every series of the tournament, in stage order. */
export function allSeries(b: Bracket): BracketSeries[] {
  return b.stages.flatMap(stageSeries);
}
export function stageIsLive(st: Stage): boolean {
  return st.status === "live" || stageSeries(st).some(seriesIsLive);
}
export function stageIsDone(st: Stage): boolean {
  return st.status === "completed";
}
/** A double elimination: format double, or rounds that name their bracket. */
export function stageIsDouble(st: Stage): boolean {
  return st.format === "double" || st.rounds.some((r) => r.bracket != null);
}
/** The stage to open on: the one being played, else the next one up, else the last. */
export function defaultStage(b: Bracket): Stage | null {
  return b.stages.find(stageIsLive) ?? b.stages.find((s) => !stageIsDone(s)) ?? b.stages[b.stages.length - 1] ?? null;
}
export function stageOf(b: Bracket, seriesId: string): Stage | null {
  return b.stages.find((st) => stageSeries(st).some((s) => s.id === seriesId)) ?? null;
}
/** "Swiss · Round 3" with several stages, "Quarterfinal" in a cup. */
export function roundLabel(b: Bracket, s: BracketSeries): string {
  const st = b.stages.length > 1 ? stageOf(b, s.id) : null;
  return st ? `${st.name} · ${s.roundName}` : s.roundName;
}
/** "Best of 1", or "Bo1 · Bo3" when a round mixes lengths (a Swiss round's deciders are longer). */
export function roundFormat(r: BracketRound): string {
  const lengths = [...new Set(r.series.map((s) => s.bestOf))].sort((a, b) => a - b);
  if (lengths.length <= 1) return `Best of ${lengths[0] ?? r.bestOf}`;
  return lengths.map((n) => `Bo${n}`).join(" · ");
}
export const standingRecord = (s: Standing) => `${s.wins}–${s.losses}`;
export const standingAdvanced = (s: Standing) => s.status === "advanced" || (s.place != null && s.place <= 2);
export const standingOut = (s: Standing) => s.status === "eliminated" || (s.place != null && s.place >= 3);
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
/** Every game on now in a tournament, with its series. */
export function liveGames(b: Bracket): { series: BracketSeries; game: BracketGame }[] {
  const out: { series: BracketSeries; game: BracketGame }[] = [];
  for (const s of allSeries(b)) { const g = liveGameOf(s); if (g && g.matchId) out.push({ series: s, game: g }); }
  return out;
}
export function findSeries(b: Bracket, id: string | null | undefined): BracketSeries | null {
  if (!id) return null;
  return allSeries(b).find((s) => s.id === id) ?? null;
}
/** The header's shape, from the template: "Three Swiss stages · Playoffs", "Swiss · Playoffs", "Groups · Double elimination"; a cup's lengths "Bo3 · Bo3 · Bo5". */
export function shapeLine(b: Bracket): string {
  switch (b.tournament.template) {
    case "major32": return "Three Swiss stages · Playoffs";
    case "swiss16": return "Swiss · Playoffs";
    case "groups16": return "Groups · Double elimination";
  }
  if (b.stages.length > 1) return b.stages.map((s) => s.name).join(" · ");
  const po = b.stages[0];
  if (po && stageIsDouble(po)) {
    const last = po.rounds[po.rounds.length - 1];
    return `Double elimination${last ? ` · Final Bo${last.bestOf}` : ""}`;
  }
  return b.rounds.map((r) => `Bo${r.bestOf}`).join(" · ");
}
/** "8 teams · Bo3 · Bo3 · Bo5", "32 teams · Three Swiss stages · Playoffs" (+ " · Completed"). */
export function formatLine(b: Bracket): string {
  const teams = b.tournament.teams ?? (b.stages.length === 1 && b.rounds[0] ? b.rounds[0].series.length * 2 : null);
  const shape = shapeLine(b);
  const parts = [teams ? `${teams} teams` : null, shape || null, b.tournament.status === "completed" ? "Completed" : null].filter(Boolean) as string[];
  return parts.join(" · ");
}
/** The tournament reads live: its status, or a game on in any series. */
export function tournamentIsLive(b: Bracket): boolean {
  return b.tournament.status === "live" || allSeries(b).some(seriesIsLive);
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
/** A placement word for Honors (iOS TeamHonors.Placement.word). */
export function placementWord(p: string): string {
  switch (p) {
    case "champion": return "Champion";
    case "runner_up": return "Runner-up";
    case "semifinalist": return "Semifinal";
    case "quarterfinalist": return "Quarterfinal";
    case "round_of_16": return "Round of 16";
    case "round_of_32": return "Round of 32";
    case "swiss_stage": return "Swiss stage";
    case "group_stage": return "Group stage";
    case "top_8": return "Top 8";
    case "top_6": return "Top 6";
    case "fourth": return "4th";
    case "third": return "3rd";
    default: return p ? p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
  }
}
