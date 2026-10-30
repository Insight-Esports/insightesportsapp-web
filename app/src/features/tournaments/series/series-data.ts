// series-data.ts — GET /tournaments/series/:id and /odds (tournamentSimService
// .seriesDetail / seriesOddsService.seriesOdds), normalized, plus the page's
// polling hook and the Match a series game is shown with on an Upcoming card.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, endpoints, errorMessage, ApiError } from "@/lib/api";
import { bool, int, iso, num, normalizeMatch, str, type Json, type Match, type MatchSeries } from "@/lib/types";
import { adjustmentsSentence, normalizeAdjustments, type SeriesAdjustment } from "./series-logic";

// ── Series ────────────────────────────────────────────────────────────────
export interface SeriesTeam { id: string; name: string; logoURL: string | null; seed: number | null }
export type SeriesGameStatus = "upcoming" | "live" | "completed" | "cancelled" | "tbd";
export interface SeriesGame {
  number: number;
  matchId: string | null;
  status: SeriesGameStatus;
  ifNecessary: boolean;
  /** The game's seats (createGame seats the series' team1 first; check, don't assume). */
  team1Id: string | null;
  team2Id: string | null;
  winnerId: string | null;
  team1Score: number | null;
  team2Score: number | null;
  mapName: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
}
export interface SeriesInfo {
  id: string;
  tournamentId: string | null;
  round: number | null;
  roundName: string | null;
  bestOf: number;
  /** upcoming | live | completed */
  status: string;
  team1: SeriesTeam | null;
  team2: SeriesTeam | null;
  team1Wins: number;
  team2Wins: number;
  winnerId: string | null;
  scheduledAt: string | null;
  /** Cancelled ("if necessary" games the series didn't need) are already left out. */
  games: SeriesGame[];
}
export interface SeriesTournament { id: string; name: string | null; game: string; status: string | null }
export interface SeriesDetail { tournament: SeriesTournament | null; series: SeriesInfo }

function team(raw: Json): SeriesTeam | null {
  if (!raw || typeof raw !== "object" || raw.id == null) return null;
  return { id: String(raw.id), name: str(raw.name) ?? "TBD", logoURL: str(raw.logo_url), seed: int(raw.seed) };
}
const GAME_STATUS: SeriesGameStatus[] = ["upcoming", "live", "completed", "cancelled", "tbd"];

export function normalizeSeriesDetail(raw: Json): SeriesDetail | null {
  const s = raw?.series;
  if (!s || typeof s !== "object" || s.id == null) return null;
  const games: SeriesGame[] = (Array.isArray(s.games) ? s.games : [])
    .map((g: Json): SeriesGame => {
      const st = String(g?.status ?? "").toLowerCase();
      return {
        number: int(g?.number) ?? 0,
        matchId: str(g?.match_id),
        status: (GAME_STATUS.includes(st as SeriesGameStatus) ? st : "upcoming") as SeriesGameStatus,
        ifNecessary: bool(g?.if_necessary),
        team1Id: str(g?.team1_id),
        team2Id: str(g?.team2_id),
        winnerId: str(g?.winner_id),
        team1Score: int(g?.team1_score),
        team2Score: int(g?.team2_score),
        mapName: str(g?.map_name),
        scheduledAt: iso(g?.scheduled_at),
        completedAt: iso(g?.completed_at),
      };
    })
    .filter((g: SeriesGame) => g.number > 0 && g.status !== "cancelled")
    .sort((a: SeriesGame, b: SeriesGame) => a.number - b.number);
  const t = raw?.tournament;
  return {
    tournament: t && typeof t === "object" && t.id != null ? { id: String(t.id), name: str(t.name), game: str(t.game) ?? "VALORANT", status: str(t.status) } : null,
    series: {
      id: String(s.id),
      tournamentId: str(s.tournament_id) ?? (t?.id != null ? String(t.id) : null),
      round: int(s.round),
      roundName: str(s.round_name),
      bestOf: int(s.best_of) ?? 3,
      status: String(s.status ?? "upcoming").toLowerCase(),
      team1: team(s.team1),
      team2: team(s.team2),
      team1Wins: int(s.team1_wins) ?? 0,
      team2Wins: int(s.team2_wins) ?? 0,
      winnerId: str(s.winner_id),
      scheduledAt: iso(s.scheduled_at),
      games,
    },
  };
}

/** Decided: completed, or a side on the wins it needs. */
export function seriesDecided(s: SeriesInfo): boolean {
  const need = Math.floor(s.bestOf / 2) + 1;
  return s.status === "completed" || !!s.winnerId || s.team1Wins >= need || s.team2Wins >= need;
}

/** A game's score from the series' team1 side (flipped when the game seats the series' team2 first). */
export function gameScoreFromSeries(s: SeriesInfo, g: SeriesGame): [number | null, number | null] {
  const flipped = !!s.team2 && g.team1Id === s.team2.id;
  return flipped ? [g.team2Score, g.team1Score] : [g.team1Score, g.team2Score];
}

/**
 * The key game: the open one (the next game, upcoming), else the live one,
 * else the first upcoming one. Its own row gives team colours and odds.
 */
export function keyGame(s: SeriesInfo): SeriesGame | null {
  const played = s.team1Wins + s.team2Wins;
  const withRow = s.games.filter((g) => g.matchId);
  return withRow.find((g) => g.status === "upcoming" && g.number <= played + 1)
    ?? withRow.find((g) => g.status === "live")
    ?? withRow.find((g) => g.status === "upcoming")
    ?? null;
}

// ── Odds ──────────────────────────────────────────────────────────────────
export interface SeriesScoreOdds { score: string; winner: "team1" | "team2"; team1Wins: number; team2Wins: number; probability: number }
export interface SeriesNextGame { number: number; live: boolean; matchId: string | null; team1: number | null; team2: number | null; adjustments: SeriesAdjustment[] }
export interface SeriesGameOdds { number: number; status: string; matchId: string | null; played: number | null; ifNecessary: boolean }
export interface SeriesOdds {
  available: boolean;
  decided: boolean;
  team1Id: string | null;
  team2Id: string | null;
  team1Series: number | null;
  team2Series: number | null;
  scores: SeriesScoreOdds[];
  nextGame: SeriesNextGame | null;
  games: SeriesGameOdds[];
  disclaimer: string | null;
}

export function normalizeSeriesOdds(raw: Json): SeriesOdds | null {
  if (!raw || typeof raw !== "object") return null;
  const ng = raw.next_game;
  return {
    available: bool(raw.available),
    decided: bool(raw.decided),
    team1Id: raw.team1?.id != null ? String(raw.team1.id) : null,
    team2Id: raw.team2?.id != null ? String(raw.team2.id) : null,
    team1Series: num(raw.team1_series),
    team2Series: num(raw.team2_series),
    scores: (Array.isArray(raw.scores) ? raw.scores : []).map((x: Json): SeriesScoreOdds => ({
      score: String(x?.score ?? "").replace("-", "–"),
      winner: x?.winner === "team2" ? "team2" : "team1",
      team1Wins: int(x?.team1_wins) ?? 0,
      team2Wins: int(x?.team2_wins) ?? 0,
      probability: num(x?.probability) ?? 0,
    })),
    nextGame: ng && typeof ng === "object" ? {
      number: int(ng.number) ?? 0,
      live: bool(ng.live),
      matchId: str(ng.match_id),
      team1: num(ng.team1),
      team2: num(ng.team2),
      adjustments: normalizeAdjustments(ng.adjustments),
    } : null,
    games: (Array.isArray(raw.games) ? raw.games : []).map((g: Json): SeriesGameOdds => ({
      number: int(g?.number) ?? 0,
      status: String(g?.status ?? ""),
      matchId: str(g?.match_id),
      played: num(g?.played),
      ifNecessary: bool(g?.if_necessary),
    })),
    disclaimer: str(raw.disclaimer),
  };
}

/** GET /tournaments/series/:id/odds once (the match preview). null on any failure. */
export async function fetchSeriesOdds(seriesId: string, signal?: AbortSignal): Promise<SeriesOdds | null> {
  try { return normalizeSeriesOdds(await api.get<Json>(endpoints.tournamentSeriesOdds(seriesId), { signal })); } catch { return null; }
}

// ── The live page's series line (POST /predictions/live → seriesFactor) ──
/** { team1_wins, team2_wins, best_of, shift, adjustments } — adjustments use the match's sides. */
export interface SeriesFactor { team1Wins: number; team2Wins: number; adjustments: SeriesAdjustment[] }

export function normalizeSeriesFactor(raw: Json): SeriesFactor | null {
  if (!raw || typeof raw !== "object") return null;
  return { team1Wins: int(raw.team1_wins) ?? 0, team2Wins: int(raw.team2_wins) ?? 0, adjustments: normalizeAdjustments(raw.adjustments) };
}

/** "Series 0–1 · FUT Esports +4 bounce back"; null when there are no adjustments. */
export function seriesFactorLine(f: SeriesFactor, team1Name: string, team2Name: string): string | null {
  const sentence = adjustmentsSentence(f.adjustments, team1Name, team2Name);
  return sentence ? `Series ${f.team1Wins}–${f.team2Wins} · ${sentence}` : null;
}

/**
 * The live model's `seriesFactor` for a tournament game. The effects come
 * from the series score before this game, so they don't move while it's on:
 * one read per match (the live screen's own probability polling is untouched).
 */
export function useSeriesFactor(matchId: string, enabled: boolean): SeriesFactor | null {
  const [factor, setFactor] = useState<{ id: string; f: SeriesFactor | null } | null>(null);
  const done = factor?.id === matchId;
  useEffect(() => {
    if (!enabled || done) return;
    let on = true;
    api.post<Json>(endpoints.livePrediction, { matchId })
      .then((res) => { if (on) setFactor({ id: matchId, f: normalizeSeriesFactor(res?.seriesFactor) }); })
      .catch(() => { /* no line */ });
    return () => { on = false; };
  }, [matchId, enabled, done]);
  return done ? factor!.f : null;
}

// ── A series game as a Match (the Upcoming card) ─────────────────────────
/**
 * The Match an upcoming series game is shown with: names and crests from
 * the series (seated as the game seats them), colours from the key game's
 * row (flipped when that row seats the other side first), odds only when
 * this IS the key game.
 */
export function seriesGameMatch(d: SeriesDetail, g: SeriesGame, keyRow: Match | null): Match | null {
  const s = d.series;
  if (!g.matchId || !s.team1 || !s.team2) return null;
  const flipped = g.team1Id === s.team2.id;
  const [a, b] = flipped ? [s.team2, s.team1] : [s.team1, s.team2];
  const isKey = !!keyRow && keyRow.id === g.matchId;
  const keyFlipped = !!keyRow && keyRow.team1Id != null && keyRow.team1Id !== a.id && keyRow.team1Id === b.id;
  const c1 = keyRow ? (keyFlipped ? keyRow.team2ColorHex : keyRow.team1ColorHex) : null;
  const c2 = keyRow ? (keyFlipped ? keyRow.team1ColorHex : keyRow.team2ColorHex) : null;
  const series: MatchSeries = {
    id: s.id, tournamentId: s.tournamentId, tournamentName: d.tournament?.name ?? null,
    round: s.round, roundName: s.roundName, bestOf: s.bestOf, gameNumber: g.number, ifNecessary: g.ifNecessary,
    team1Wins: flipped ? s.team2Wins : s.team1Wins, team2Wins: flipped ? s.team1Wins : s.team2Wins,
    status: s.status, winnerId: s.winnerId,
  };
  return {
    id: g.matchId,
    game: d.tournament?.game ?? keyRow?.game ?? "VALORANT",
    team1Name: a.name, team2Name: b.name,
    team1Score: 0, team2Score: 0,
    team1LogoURL: a.logoURL, team2LogoURL: b.logoURL,
    tournamentName: d.tournament?.name ?? null,
    stage: null,
    status: "upcoming",
    scheduledAt: g.scheduledAt ?? new Date().toISOString(),
    completedAt: null,
    mapName: g.mapName,
    roundNumber: null,
    bestOf: 1,
    viewerCount: null,
    team1ColorHex: c1, team2ColorHex: c2,
    team1Id: a.id, team2Id: b.id,
    team1InhibitorsUp: null, team2InhibitorsUp: null,
    team1WinProbability: isKey ? keyRow!.team1WinProbability : null,
    team2WinProbability: isKey ? keyRow!.team2WinProbability : null,
    streams: null,
    series,
  };
}

// ── The page hook ─────────────────────────────────────────────────────────
const LIVE_MS = 10_000;
const IDLE_MS = 20_000;

export interface SeriesPageState {
  detail: SeriesDetail | null;
  odds: SeriesOdds | null;
  /** GET /matches/:id of the key game (team colours, its odds). */
  keyRow: Match | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  connectionProblem: boolean;
  reload: () => void;
}

/**
 * The series and its odds, every 10 s while a game is live and 20 s
 * otherwise, until the series is decided. The key game's own row is
 * fetched when the key game changes, and again on each poll while its
 * odds are missing.
 */
export function useSeriesPage(seriesId: string): SeriesPageState {
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [odds, setOdds] = useState<SeriesOdds | null>(null);
  const [keyRow, setKeyRow] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [tick, setTick] = useState(0);
  const [polls, setPolls] = useState(0);

  const load = useCallback(async (signal: AbortSignal, first: boolean) => {
    const [d, o] = await Promise.all([
      api.get<Json>(endpoints.tournamentSeries(seriesId), { signal }).then(normalizeSeriesDetail),
      fetchSeriesOdds(seriesId, signal),
    ]);
    if (signal.aborted) return;
    if (!d) throw new ApiError(404, "Series not found");
    setDetail(d);
    setOdds(o);
    setPolls((n) => n + 1);
    if (first) { setLoading(false); setError(null); }
  }, [seriesId]);

  // First load (and Retry).
  useEffect(() => {
    if (!seriesId) return;
    const c = new AbortController();
    setLoading(true); setError(null); setNotFound(false); setConnectionProblem(false);
    load(c.signal, true).catch((e) => {
      if (c.signal.aborted) return;
      setError(errorMessage(e));
      setNotFound(e instanceof ApiError && e.isNotFound);
      setConnectionProblem(e instanceof ApiError && e.isConnectionProblem);
      setLoading(false);
    });
    return () => c.abort();
  }, [seriesId, tick, load]);

  // Polling: 10 s while a game is live, 20 s otherwise, until decided.
  const s = detail?.series ?? null;
  const decided = s ? seriesDecided(s) : false;
  const anyLive = !!s?.games.some((g) => g.status === "live");
  const interval = !s || decided ? null : anyLive ? LIVE_MS : IDLE_MS;
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (interval === null) return;
    const c = new AbortController();
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadRef.current(c.signal, false).catch(() => { /* keep the last good copy */ });
    }, interval);
    return () => { clearInterval(id); c.abort(); };
  }, [interval]);

  // The key game's own row.
  const key = s ? keyGame(s) : null;
  const keyId = key?.matchId ?? null;
  const keyHasOdds = !!keyRow && keyRow.id === keyId && keyRow.team1WinProbability != null && keyRow.team2WinProbability != null;
  const keyPoll = keyHasOdds ? 0 : polls;   // re-run on each poll only while odds are missing
  useEffect(() => {
    if (!keyId) return;
    const c = new AbortController();
    api.get<Json>(endpoints.matchDetail(keyId), { signal: c.signal })
      .then((raw) => { if (!c.signal.aborted) setKeyRow(normalizeMatch(raw)); })
      .catch(() => { /* colours fall back; odds stay hidden */ });
    return () => c.abort();
  }, [keyId, keyPoll]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const keyRowForKey = useMemo(() => (keyRow && keyRow.id === keyId ? keyRow : null), [keyRow, keyId]);
  return { detail, odds, keyRow: keyRowForKey, loading, error, notFound, connectionProblem, reload };
}
