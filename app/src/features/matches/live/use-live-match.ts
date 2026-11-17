// use-live-match.ts — LiveMatchViewModel as a hook.
//
// Data strategy (identical to the app):
//   INSTANT (socket):   round score, map score, current round, game time,
//                       odds, chat messages, poll vote counts, the
//                       scoreboard (stats_update carries the rows: no
//                       refetch), gold points (gold_update carries the
//                       newest: appended when nothing was missed), League
//                       team gold (match_update)
//   POLLED (REST):      /progress + /stats (+ League objectives), the
//                       socket's fallback: every 30 s while the socket is up
//                       (a reconcile, so a crowd doesn't hit them in step),
//                       8 s while it's down (then it IS the feed). Both are
//                       fetched on open and once per reconnect (pushes sent
//                       while down are lost).
//
// The HUD's dots: a cup game's (the row carries `series`) are the SERIES,
// read from /progress only — its pushes' team1Maps/team2Maps are this game's
// score, 0 until it's won. A standalone multi-map match takes its pushes too.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { api, endpoints, ApiError } from "@/lib/api";
import { getSocket, rooms } from "@/lib/socket";
import { normalizePlayers, type Match, type Json } from "@/lib/types";
import { noteBan } from "@/features/moderation/ban";
import { applyChatChange, onChatLocal } from "@/features/moderation/chat-actions";
import { liveSeriesInfo } from "@/features/tournaments/series/series-logic";
import {
  chatDeletedPayload, chatEditedPayload, formatGameTime, mapTeamRows, normalizeChatHistory, normalizeChatMessage,
  normalizeGoldTimeline, normalizeMatchDetail, normalizePoll, normalizeProgress, normalizeStatRows, placeholderStat,
  resolvedLockedPayout, splitStatRows, teamGoldTotal, viewerLabel, voteCountMap,
  type FanPoll, type GoldTimelinePoint, type LeagueObjective, type LiveChatMessage, type LivePlayerStat, type LiveRound, type MatchStatRow,
} from "./types";

export interface LiveMatchState {
  team1Rounds: number;
  team2Rounds: number;
  /** The HUD's dots: maps won (standalone) or series games won (a cup game). */
  team1Maps: number;
  team2Maps: number;
  /** League: each team's total gold (roster gold_earned summed / the match_update tick). */
  team1Gold: number | null;
  team2Gold: number | null;
  currentRound: number;
  gameTime: string;
  /** The HUD's bottom line: "Quarterfinal · Game 1 of 5" or "Map 2 of 3". */
  seriesInfo: string;
  viewerCount: string;
  team1Side: string | null;
  team2Side: string | null;
  isMatchComplete: boolean;
  rounds: LiveRound[];
  objectives: LeagueObjective[];
  goldTimeline: GoldTimelinePoint[];
  liveGoldDiff: number | null;
  team1Alive: number | null;
  team2Alive: number | null;
  team1WinProbability: number;
  team1Stats: LivePlayerStat[];
  team2Stats: LivePlayerStat[];
  poll: FanPoll | null;
  chatMessages: LiveChatMessage[];
  socketConnected: boolean;
  /** Every first-screen request (progress, detail, stats, odds, poll, chat history) has settled. */
  initialLoaded: boolean;
  /** Per-request arrival, so each section reveals on its own (LiveMatchView's sections load independently). */
  coreLoaded: boolean;
  statsLoaded: boolean;
  railLoaded: boolean;
}

/** The /progress + /stats poll: a reconcile while the socket is up, the feed while it's down. */
const POLL_SOCKET_UP_MS = 30_000;
const POLL_SOCKET_DOWN_MS = 8_000;

// Last known state per match: reopening a match shows the previous
// scoreboard/poll/chat at once while the first-screen requests refresh it.
const liveStateCache = new Map<string, LiveMatchState>();

/** "Quarterfinal · Game 1 of 5" (a cup game) or "Map 2 of 3" / "Game 2 of 3" (standalone). */
function contextLine(seriesHead: string | null, game: string, bestOf: number, team1Maps: number, team2Maps: number, complete: boolean): string {
  if (seriesHead !== null) return seriesHead;
  const played = team1Maps + team2Maps;
  // Live: the map being played; final: the last one played.
  const n = Math.min(Math.max(1, complete ? played : played + 1), bestOf);
  return `${game === "League" ? "Game" : "Map"} ${n} of ${bestOf}`;
}

export function useLiveMatch(match: Match) {
  // A cup game's context ("Quarterfinal · Game 1 of 5"), as a string so callbacks stay stable.
  const seriesHead = match.series ? liveSeriesInfo(match.series) : null;
  const [s, setS] = useState<LiveMatchState>(() => liveStateCache.get(match.id) ?? ({
    team1Rounds: match.team1Score,
    team2Rounds: match.team2Score,
    team1Maps: match.series?.team1Wins ?? 0,
    team2Maps: match.series?.team2Wins ?? 0,
    team1Gold: null,
    team2Gold: null,
    currentRound: 0,
    gameTime: "00:00",
    seriesInfo: contextLine(seriesHead, match.game, match.bestOf, match.series?.team1Wins ?? 0, match.series?.team2Wins ?? 0, false),
    viewerCount: viewerLabel(match.viewerCount),
    team1Side: null,
    team2Side: null,
    isMatchComplete: false,
    rounds: [],
    objectives: [],
    goldTimeline: [],
    liveGoldDiff: null,
    team1Alive: null,
    team2Alive: null,
    team1WinProbability: 50,
    team1Stats: [],
    team2Stats: [],
    poll: null,
    chatMessages: [],
    socketConnected: false,
    initialLoaded: false,
    coreLoaded: false,
    statsLoaded: false,
    railLoaded: false,
  }));

  // Mutable bookkeeping that must not trigger renders.
  const ref = useRef({
    team1Id: match.team1Id,
    team2Id: match.team2Id,
    team1Rounds: match.team1Score,
    team2Rounds: match.team2Score,
    team1Maps: match.series?.team1Wins ?? 0,
    team2Maps: match.series?.team2Wins ?? 0,
    // A cup game: the dots are the series, from /progress only. `seriesBefore`
    // is the series score going into this game (the last live /progress).
    inSeries: !!match.series,
    seriesBefore1: match.series?.team1Wins ?? 0,
    seriesBefore2: match.series?.team2Wins ?? 0,
    gameTimeSeconds: 0,
    hasInitialProgress: false,
    hasRealStats: false,
    isMatchComplete: false,
    pollCycle: 0,
    rateLimitedUntil: 0,
    roundHistory: null as number[] | null,
    observedWinners: {} as Record<number, number>,
    // League smooth clock: anchor + elapsed × rate, monotonic.
    clockAnchorSeconds: 0,
    clockAnchorAt: 0,
    clockRate: 1,
    lastSyncBackend: null as number | null,
    lastSyncAt: 0,
    displayedSeconds: 0,
    lastServerRefresh: 0,
    refreshInFlight: false,
    /** L: the minute of the newest server gold point held (null until /progress serves a timeline). */
    lastServerGoldMinute: null as number | null,
    /** This screen has seen the socket connect: a later connect is a reconnect. */
    socketHasConnected: false,
    /** Re-arms the poll at the cadence the connection calls for (set by the polling effect). */
    rearmPoll: null as (() => void) | null,
    pollId: null as string | null,
    socket: null as Socket | null,
  });
  const isLeague = match.game === "League";

  const patch = useCallback((p: Partial<LiveMatchState> | ((prev: LiveMatchState) => Partial<LiveMatchState>)) => {
    setS((prev) => { const next = { ...prev, ...(typeof p === "function" ? p(prev) : p) }; liveStateCache.set(match.id, next); return next; });
  }, [match.id]);

  // ── Rounds + series helpers ─────────────────────────────────────────────
  const rebuildRounds = useCallback(() => {
    const r = ref.current;
    const played = r.team1Rounds + r.team2Rounds;
    const total = Math.max(24, played + 2);
    const rounds: LiveRound[] = [];
    for (let i = 1; i <= total; i++) {
      let winner: number;
      if (r.roundHistory && i <= r.roundHistory.length) winner = r.roundHistory[i - 1];
      else if (i <= played) winner = r.observedWinners[i] ?? 3;
      else winner = 0;
      rounds.push({ id: i, winner, isCurrent: i === played + 1 });
    }
    patch({ rounds, team1Rounds: r.team1Rounds, team2Rounds: r.team2Rounds });
  }, [patch]);

  // The bottom line carries context only; the dots say who leads.
  const updateSeriesInfo = useCallback((complete = false) => {
    const r = ref.current;
    patch({ seriesInfo: contextLine(seriesHead, match.game, match.bestOf, r.team1Maps, r.team2Maps, complete || r.isMatchComplete), team1Maps: r.team1Maps, team2Maps: r.team2Maps });
  }, [match.bestOf, match.game, patch, seriesHead]);

  /** A cup game's dots at the end: the series going in + this game (the completed /progress maps). */
  const applySeriesCompletion = useCallback((g1: number | null, g2: number | null) => {
    const r = ref.current;
    let a = g1 ?? 0, b = g2 ?? 0;
    if (a + b > 1) {
      // Already the series score (more than one game's worth): take it as is.
      r.team1Maps = a; r.team2Maps = b;
      return;
    }
    if (a + b === 0) {
      // This game's map score not stated: the final score decides it.
      if (r.team1Rounds > r.team2Rounds) a = 1;
      else if (r.team2Rounds > r.team1Rounds) b = 1;
    }
    r.team1Maps = r.seriesBefore1 + a;
    r.team2Maps = r.seriesBefore2 + b;
  }, []);

  // ── Game clock (League) ────────────────────────────────────────────────
  const anchorClock = useCallback((seconds: number) => {
    const r = ref.current;
    r.clockAnchorSeconds = seconds;
    r.clockAnchorAt = Date.now();
    r.displayedSeconds = seconds;
  }, []);

  const syncGameClock = useCallback((backendSeconds: number) => {
    const r = ref.current;
    const now = Date.now();
    if (r.lastSyncBackend !== null) {
      const realDt = (now - r.lastSyncAt) / 1000;
      const backendDt = backendSeconds - r.lastSyncBackend;
      if (realDt >= 3 && backendDt > 0) {
        const measured = backendDt / realDt;
        r.clockRate = Math.min(Math.max(r.clockRate * 0.4 + measured * 0.6, 0.5), 1.5);
      }
    }
    r.lastSyncBackend = backendSeconds;
    r.lastSyncAt = now;
    const drift = backendSeconds - r.displayedSeconds;
    if (drift > 3) anchorClock(backendSeconds);
    else if (drift > 0) anchorClock(r.displayedSeconds + Math.min(drift, 0.75));
    else if (-drift > 300) anchorClock(backendSeconds);
    else anchorClock(r.displayedSeconds);
    r.gameTimeSeconds = Math.floor(r.displayedSeconds);
    patch({ gameTime: formatGameTime(r.gameTimeSeconds) });
  }, [anchorClock, patch]);

  // ── Score application (socket + polling share this) ─────────────────────
  const loadWinProbability = useCallback(async () => {
    try {
      const res = await api.post<Json>(endpoints.livePrediction, { matchId: match.id });
      const p1 = res?.team1?.winProbability;
      if (typeof p1 === "number") patch({ team1WinProbability: Math.round(p1 <= 1 ? p1 * 100 : p1) });
    } catch { /* keep the last known probability */ }
  }, [match.id, patch]);

  const applyRoundScore = useCallback((t1: number | null, t2: number | null) => {
    if (t1 === null || t2 === null) return;
    const r = ref.current;
    let changed = false;
    if (t1 === r.team1Rounds + 1 && t2 === r.team2Rounds) { r.observedWinners[r.team1Rounds + r.team2Rounds + 1] = 1; changed = true; }
    else if (t2 === r.team2Rounds + 1 && t1 === r.team1Rounds) { r.observedWinners[r.team1Rounds + r.team2Rounds + 1] = 2; changed = true; }
    else if (t1 !== r.team1Rounds || t2 !== r.team2Rounds) changed = true;
    r.team1Rounds = t1;
    r.team2Rounds = t2;
    if (changed) {
      rebuildRounds();
      updateSeriesInfo();
      void loadWinProbability();
    }
  }, [loadWinProbability, rebuildRounds, updateSeriesInfo]);

  // ── REST loads ──────────────────────────────────────────────────────────
  const loadPoll = useCallback(async () => {
    try {
      const res = await api.get<Json>(endpoints.pollsForMatch(match.id));
      const polls: Json[] = Array.isArray(res?.polls) ? res.polls : Array.isArray(res) ? res : [];
      const dto = polls.find((p) => p?.status === "active") ?? polls[0];
      if (!dto) { patch({ poll: null }); return; }
      const poll = normalizePoll(dto);
      patch({ poll });
      ref.current.pollId = poll.id;
      if (ref.current.socket?.connected) rooms.joinPoll(ref.current.socket, poll.id);
    } catch {
      patch({ poll: null });
    }
  }, [match.id, patch]);

  const completeMatch = useCallback(() => {
    const r = ref.current;
    if (r.isMatchComplete) return;
    r.isMatchComplete = true;
    patch({ isMatchComplete: true, gameTime: "FINAL" });
    void loadPoll();
    void loadWinProbability();
  }, [loadPoll, loadWinProbability, patch]);

  const checkIfCompleted = useCallback(async () => {
    try {
      const d = normalizeMatchDetail(await api.get<Json>(endpoints.matchDetail(match.id)));
      if (d.status?.toLowerCase() === "completed") completeMatch();
    } catch { /* ignore */ }
  }, [completeMatch, match.id]);

  const handleRateLimit = useCallback(() => {
    ref.current.rateLimitedUntil = Date.now() + 60_000;
  }, []);

  const loadProgress = useCallback(async () => {
    const r = ref.current;
    try {
      const p = normalizeProgress(await api.get<Json>(endpoints.matchProgress(match.id)));
      const completed = p.status?.toLowerCase() === "completed";
      r.team1Id = p.team1Id ?? r.team1Id;
      r.team2Id = p.team2Id ?? r.team2Id;
      if (p.inSeries) r.inSeries = true;
      if (p.roundHistory) r.roundHistory = p.roundHistory;

      const next: Partial<LiveMatchState> = {};
      if (p.team1Side !== null) next.team1Side = p.team1Side;
      if (p.team2Side !== null) next.team2Side = p.team2Side;
      if (p.team1Alive !== null) next.team1Alive = p.team1Alive;
      if (p.team2Alive !== null) next.team2Alive = p.team2Alive;
      if (p.team1Gold !== null && p.team2Gold !== null) next.liveGoldDiff = p.team1Gold - p.team2Gold;
      // THE GOLD RULE: the server's gold_timeline renders VERBATIM.
      if (p.goldTimeline && p.goldTimeline.length) {
        const seeded = p.goldTimeline[0].minute > 0.01 ? [{ minute: 0, goldDiff: 0 }, ...p.goldTimeline] : p.goldTimeline;
        next.goldTimeline = seeded;
        const last = seeded[seeded.length - 1];
        r.lastServerGoldMinute = last.minute;
        anchorClock(Math.max(r.displayedSeconds, last.minute * 60));
      }
      patch(next);

      if (completed) {
        r.team1Rounds = p.team1Rounds ?? r.team1Rounds;
        r.team2Rounds = p.team2Rounds ?? r.team2Rounds;
        if (r.inSeries) applySeriesCompletion(p.team1Maps, p.team2Maps);
        else {
          r.team1Maps = p.team1Maps ?? r.team1Maps;
          r.team2Maps = p.team2Maps ?? r.team2Maps;
        }
        rebuildRounds();
        updateSeriesInfo(true);
        completeMatch();
        return;
      }

      if (r.hasInitialProgress) {
        applyRoundScore(p.team1Rounds, p.team2Rounds);
      } else {
        r.team1Rounds = p.team1Rounds ?? match.team1Score;
        r.team2Rounds = p.team2Rounds ?? match.team2Score;
        r.hasInitialProgress = true;
        rebuildRounds();
        updateSeriesInfo();
      }
      // Live: a cup game's /progress maps are the series score going into this game.
      r.team1Maps = p.team1Maps ?? r.team1Maps;
      r.team2Maps = p.team2Maps ?? r.team2Maps;
      if (r.inSeries) { r.seriesBefore1 = r.team1Maps; r.seriesBefore2 = r.team2Maps; }
      updateSeriesInfo();
      patch({ currentRound: p.currentRound ?? r.team1Rounds + r.team2Rounds + 1 });
      if (p.gameTimeSeconds !== null) syncGameClock(p.gameTimeSeconds);
    } catch (e) {
      if (e instanceof ApiError && e.isRateLimited) handleRateLimit();
      if (r.hasInitialProgress && !r.isMatchComplete) await checkIfCompleted();
      if (!r.hasInitialProgress) {
        r.team1Rounds = match.team1Score;
        r.team2Rounds = match.team2Score;
        r.hasInitialProgress = true;
        rebuildRounds();
        updateSeriesInfo();
      }
    }
  }, [anchorClock, applyRoundScore, applySeriesCompletion, checkIfCompleted, completeMatch, handleRateLimit, match.id, match.team1Score, match.team2Score, patch, rebuildRounds, syncGameClock, updateSeriesInfo]);

  const refreshFromServer = useCallback(async () => {
    const r = ref.current;
    if (r.refreshInFlight || Date.now() - r.lastServerRefresh < 1500) return;
    r.refreshInFlight = true;
    try { await loadProgress(); } finally { r.refreshInFlight = false; r.lastServerRefresh = Date.now(); }
  }, [loadProgress]);

  /** gold_update {matchId, points, prevMinute} (backend live-push-payloads
   *  contract): up to ten of the newest points, oldest first, and the minute
   *  of the point before them. prevMinute <= L (the newest server point held)
   *  → nothing was missed: the points past L append. A gap, a bare push, or no
   *  server timeline yet → read /progress (the served array, verbatim). */
  const applyGoldPush = useCallback((d: Json) => {
    const r = ref.current;
    const L = r.lastServerGoldMinute;
    const raw = d?.prevMinute;
    const prev = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (L === null || !Array.isArray(d?.points) || !Number.isFinite(prev) || prev > L + 0.001) {
      void refreshFromServer();
      return;
    }
    const fresh = normalizeGoldTimeline(d.points).filter((p) => p.minute > L + 0.001);
    const newest = fresh[fresh.length - 1];
    if (!newest) return;
    r.lastServerGoldMinute = newest.minute;
    anchorClock(Math.max(r.displayedSeconds, newest.minute * 60));
    patch((prevState) => ({
      goldTimeline: [...prevState.goldTimeline.filter((p) => p.minute <= L + 0.001), ...fresh],
      liveGoldDiff: newest.goldDiff,
    }));
  }, [anchorClock, patch, refreshFromServer]);

  const loadDetail = useCallback(async () => {
    const r = ref.current;
    try {
      const d = normalizeMatchDetail(await api.get<Json>(endpoints.matchDetail(match.id)));
      if (!r.team1Id) r.team1Id = d.team1Id;
      if (!r.team2Id) r.team2Id = d.team2Id;
      if (d.gameTimeSeconds !== null) syncGameClock(d.gameTimeSeconds);
      if (match.game === "League") {
        const objectives: LeagueObjective[] = [
          { icon: "dragon", label: "Dragons", team1Count: d.team1DragonKills ?? 0, team2Count: d.team2DragonKills ?? 0 },
          { icon: "baren", label: "Barons", team1Count: d.team1BaronKills ?? 0, team2Count: d.team2BaronKills ?? 0 },
          { icon: "tower2", label: "Towers", team1Count: d.team1TowerKills ?? 0, team2Count: d.team2TowerKills ?? 0 },
        ];
        const inh1 = d.team1InhibitorsUp ?? match.team1InhibitorsUp;
        const inh2 = d.team2InhibitorsUp ?? match.team2InhibitorsUp;
        if (inh1 !== null && inh2 !== null) objectives.push({ icon: "inhibitor", label: "Inhibitors", team1Count: inh1, team2Count: inh2 });
        patch({ objectives });
      }
    } catch { /* non-fatal */ }
  }, [match.game, match.id, match.team1InhibitorsUp, match.team2InhibitorsUp, patch, syncGameClock]);

  const loadRosterPlaceholders = useCallback(async () => {
    const r = ref.current;
    if (!r.team1Id || !r.team2Id) return;
    try {
      const [r1, r2] = await Promise.all([
        api.get<Json>(endpoints.teamPlayers(r.team1Id)).then(normalizePlayers),
        api.get<Json>(endpoints.teamPlayers(r.team2Id)).then(normalizePlayers),
      ]);
      patch((prev) => {
        if (!prev.team1Stats.every((x) => x.kills === 0) || !prev.team2Stats.every((x) => x.kills === 0)) return {};
        return {
          team1Stats: r1.length ? r1.slice(0, 5).map(placeholderStat) : prev.team1Stats,
          team2Stats: r2.length ? r2.slice(0, 5).map(placeholderStat) : prev.team2Stats,
        };
      });
    } catch { /* non-fatal */ }
  }, [patch]);

  /** One scoreboard (GET /stats or a stats_update's rows) → the table, and with `gold` the HUD's team totals. */
  const applyStatRows = useCallback(async (rows: MatchStatRow[], gold: boolean) => {
    const r = ref.current;
    if (!rows.length) {
      // No stats yet (pre-game / just started): show the rosters at 0 so
      // the scoreboard isn't empty — only while we have nothing real.
      if (!r.hasRealStats) await loadRosterPlaceholders();
      return;
    }
    const [t1, t2] = splitStatRows(rows, r.team1Id, r.team2Id);
    r.hasRealStats = true;
    const next: Partial<LiveMatchState> = { team1Stats: mapTeamRows(t1, match.game, r.gameTimeSeconds), team2Stats: mapTeamRows(t2, match.game, r.gameTimeSeconds) };
    if (gold && isLeague) {
      const g1 = teamGoldTotal(t1), g2 = teamGoldTotal(t2);
      if (g1 !== null) next.team1Gold = g1;
      if (g2 !== null) next.team2Gold = g2;
    }
    patch(next);
  }, [isLeague, loadRosterPlaceholders, match.game, patch]);

  /** GET /stats. `gold`: the opening scoreboard, or the poll while the socket is down (its pushes feed gold otherwise). */
  const loadStats = useCallback(async (gold = true) => {
    try {
      await applyStatRows(normalizeStatRows(await api.get<Json>(endpoints.matchStats(match.id))), gold);
    } catch (e) {
      if (e instanceof ApiError && e.isRateLimited) handleRateLimit();
    }
  }, [applyStatRows, handleRateLimit, match.id]);

  const loadChatHistory = useCallback(async () => {
    try {
      const history = normalizeChatHistory(await api.get<Json>(endpoints.chatMessages(match.id)));
      patch({ chatMessages: history });
    } catch {
      patch({ chatMessages: [] });
    }
  }, [match.id, patch]);

  // ── Socket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const r = ref.current;
    // Per run (not on the ref): a run cleaned up before its socket arrived never attaches.
    let stopped = false;
    let socket: Socket | null = null;
    r.socketHasConnected = false;

    const onConnect = () => {
      if (!socket) return;
      rooms.joinMatch(socket, match.id);
      if (r.pollId) rooms.joinPoll(socket, r.pollId);
      patch({ socketConnected: true });
      // Pushes sent while the socket was down are lost: read both once on
      // every reconnect (the opening fetch covers the first connect).
      if (r.socketHasConnected && !r.isMatchComplete) {
        void (async () => { await loadProgress(); await loadStats(true); })();
      }
      r.socketHasConnected = true;
      r.rearmPoll?.();
    };
    const onDisconnect = () => { patch({ socketConnected: false }); r.rearmPoll?.(); };
    const pctOf = (v: Json): number | null => (typeof v === "number" ? Math.round(v <= 1 ? v * 100 : v) : null);

    const onRoundUpdate = (d: Json) => {
      if (!d || typeof d !== "object") return;
      if (d.matchId && String(d.matchId) !== match.id) return;
      if (Array.isArray(d.roundHistory)) r.roundHistory = d.roundHistory.map(Number);
      applyRoundScore(typeof d.team1Rounds === "number" ? d.team1Rounds : null, typeof d.team2Rounds === "number" ? d.team2Rounds : null);
      const next: Partial<LiveMatchState> = {};
      if (typeof d.currentRound === "number") next.currentRound = d.currentRound;
      // A cup game's push maps are this game's score — never the series dots.
      if (!r.inSeries) {
        if (typeof d.team1Maps === "number") { r.team1Maps = d.team1Maps; next.team1Maps = d.team1Maps; }
        if (typeof d.team2Maps === "number") { r.team2Maps = d.team2Maps; next.team2Maps = d.team2Maps; }
      }
      if (typeof d.team1Alive === "number" && typeof d.team2Alive === "number") { next.team1Alive = d.team1Alive; next.team2Alive = d.team2Alive; }
      patch(next);
      if (r.roundHistory) rebuildRounds();
      void loadWinProbability();
    };
    const onGameTime = (d: Json) => { if (typeof d?.gameTimeSeconds === "number") syncGameClock(d.gameTimeSeconds); };
    const onOdds = (d: Json) => {
      if (!d || typeof d !== "object") return;
      if (d.matchId && String(d.matchId) !== match.id) return;
      const t1 = pctOf(d.team1WinProbability);
      if (t1 === null) return;
      const decided = d.decided === true;
      patch({ team1WinProbability: decided ? (t1 >= 50 ? 100 : 0) : t1 });
    };
    const onGold = (d: Json) => {
      if (d && typeof d === "object" && d.matchId && String(d.matchId) !== match.id) return;
      applyGoldPush(d);
    };
    const goldOf = (v: Json): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
    // match_update {team1Maps, team2Maps, team1InhibitorsUp, team2InhibitorsUp, team1Gold, team2Gold}
    // (liveDataWriter): the 2s gold tick between scoreboards.
    const onMatchUpdate = (d: Json) => {
      if (!d || typeof d !== "object") return;
      if (d.matchId && String(d.matchId) !== match.id) return;
      const next: Partial<LiveMatchState> = {};
      if (!r.inSeries) {
        if (typeof d.team1Maps === "number") { r.team1Maps = d.team1Maps; }
        if (typeof d.team2Maps === "number") { r.team2Maps = d.team2Maps; }
      }
      const g1 = goldOf(d.team1Gold), g2 = goldOf(d.team2Gold);
      if (g1 !== null && g2 !== null) {
        next.liveGoldDiff = g1 - g2;
        if (isLeague) { next.team1Gold = g1; next.team2Gold = g2; }
      }
      patch(next);
      if (typeof d.team1InhibitorsUp === "number" && typeof d.team2InhibitorsUp === "number") {
        patch((prev) => {
          const obj: LeagueObjective = { icon: "inhibitor", label: "Inhibitors", team1Count: d.team1InhibitorsUp, team2Count: d.team2InhibitorsUp };
          const i = prev.objectives.findIndex((o) => o.label === "Inhibitors");
          const objectives = i >= 0 ? prev.objectives.map((o, k) => (k === i ? obj : o)) : [...prev.objectives, obj];
          return { objectives };
        });
      }
      updateSeriesInfo();
    };
    const onChat = (d: Json) => {
      if (!d || typeof d !== "object") return;
      const m = normalizeChatMessage(d);
      patch((prev) => {
        if (prev.chatMessages.some((x) => x.id === m.id)) return {};
        const list = [...prev.chatMessages, m];
        return { chatMessages: list.length > 100 ? list.slice(list.length - 100) : list };
      });
    };
    // chat:edited — the full message with editedAt (bare or {roomId, message});
    // chat:deleted {roomId, messageId}. Pending on the backend; harmless until then.
    const onChatEdited = (d: Json) => {
      const p = chatEditedPayload(d);
      if (!p || (p.roomId && p.roomId !== match.id)) return;
      patch((prev) => {
        const next = applyChatChange(prev.chatMessages, { type: "edit", roomId: match.id, message: p.message });
        return next === prev.chatMessages ? {} : { chatMessages: next };
      });
    };
    const onChatDeleted = (d: Json) => {
      const p = chatDeletedPayload(d);
      if (!p || (p.roomId && p.roomId !== match.id)) return;
      patch((prev) => {
        const next = applyChatChange(prev.chatMessages, { type: "delete", roomId: match.id, messageId: p.messageId });
        return next === prev.chatMessages ? {} : { chatMessages: next };
      });
    };
    const onPollUpdate = (d: Json) => {
      if (!d || typeof d !== "object" || !d.pollId) return;
      const counts = voteCountMap(d.voteCounts);
      patch((prev) => {
        if (!prev.poll || prev.poll.id !== String(d.pollId)) return {};
        return { poll: { ...prev.poll, options: prev.poll.options.map((o) => (counts[o.id] !== undefined ? { ...o, votes: counts[o.id] } : o)) } };
      });
    };
    const onMatchCompleted = (d: Json) => {
      if (d?.matchId && String(d.matchId) === match.id) void refreshFromServer();
    };
    // stats_update {matchId, stats?}: the rows GET /stats returns ride on the
    // push (emitStatsUpdate); an older bare signal means "refetch now".
    const onStatsUpdate = (d: Json) => {
      if (d && typeof d === "object" && d.matchId && String(d.matchId) !== match.id) return;
      if (Array.isArray(d?.stats)) void applyStatRows(normalizeStatRows(d.stats), true);
      else void loadStats(true);
    };

    (async () => {
      try {
        const sock = await getSocket();
        if (stopped) return;
        socket = sock;
        r.socket = sock;
        sock.on("connect", onConnect);
        sock.on("disconnect", onDisconnect);
        sock.on("round_update", onRoundUpdate);
        sock.on("game_time_update", onGameTime);
        sock.on("odds_update", onOdds);
        sock.on("gold_update", onGold);
        sock.on("match_update", onMatchUpdate);
        sock.on("new_message", onChat);
        sock.on("chat:edited", onChatEdited);
        sock.on("chat:deleted", onChatDeleted);
        sock.on("poll_update", onPollUpdate);
        sock.on("match_completed", onMatchCompleted);
        sock.on("stats_update", onStatsUpdate);
        if (sock.connected) onConnect();
      } catch { /* the 8 s REST poll keeps the screen current */ }
    })();

    return () => {
      stopped = true;
      if (socket) {
        if (socket.connected) {
          rooms.leaveMatch(socket, match.id);
          if (r.pollId) rooms.leavePoll(socket, r.pollId);
        }
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("round_update", onRoundUpdate);
        socket.off("game_time_update", onGameTime);
        socket.off("odds_update", onOdds);
        socket.off("gold_update", onGold);
        socket.off("match_update", onMatchUpdate);
        socket.off("new_message", onChat);
        socket.off("chat:edited", onChatEdited);
        socket.off("chat:deleted", onChatDeleted);
        socket.off("poll_update", onPollUpdate);
        socket.off("match_completed", onMatchCompleted);
        socket.off("stats_update", onStatsUpdate);
      }
      r.socket = null;
    };
  }, [match.id, applyGoldPush, applyRoundScore, applyStatRows, isLeague, loadProgress, loadStats, loadWinProbability, patch, rebuildRounds, refreshFromServer, syncGameClock, updateSeriesInfo]);

  // Your own edits and deletes show up at once (moderation/chat-actions.ts),
  // and come back as they were if the server refuses.
  useEffect(() => onChatLocal((e) => {
    if (e.roomId !== match.id) return;
    patch((prev) => {
      const next = applyChatChange(prev.chatMessages, e);
      return next === prev.chatMessages ? {} : { chatMessages: next };
    });
  }), [match.id, patch]);

  // ── Initial loads + polling + clock ─────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      // Every first-screen request in parallel; each section reveals as its
      // own data lands instead of waiting for the slowest request.
      const core = Promise.all([loadProgress(), loadDetail(), loadWinProbability()]).then(() => { if (active) patch({ coreLoaded: true }); });
      const stats = loadStats().then(() => { if (active) patch({ statsLoaded: true }); });
      const rail = Promise.all([loadPoll(), loadChatHistory()]).then(() => { if (active) patch({ railLoaded: true }); });
      await Promise.all([core, stats, rail]);
      if (active) patch({ initialLoaded: true });
    })();

    // The poll, re-armed at the connection's cadence whenever the socket
    // connects or drops (LiveMatchView.startPolling): 30 s up, 8 s down.
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const pollTick = () => {
      const r = ref.current;
      if (!active || r.isMatchComplete) return;
      if (Date.now() >= r.rateLimitedUntil && document.visibilityState === "visible") {
        r.pollCycle += 1;
        const up = !!r.socket?.connected;
        void (async () => {
          await loadProgress();
          // Team gold comes from the pushes while the socket is up; the poll feeds it only when it's down.
          await loadStats(!up);
          // League objectives change slowly: every slow cycle, or every 3rd fast one.
          if (isLeague && (up || r.pollCycle % 3 === 0)) await loadDetail();
        })();
      }
      armPoll();
    };
    const armPoll = () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      if (!active || ref.current.isMatchComplete) return;
      pollTimer = setTimeout(pollTick, ref.current.socket?.connected ? POLL_SOCKET_UP_MS : POLL_SOCKET_DOWN_MS);
    };
    const book = ref.current;
    book.rearmPoll = armPoll;
    armPoll();

    if (isLeague) anchorClock(ref.current.displayedSeconds);
    const clock = isLeague
      ? setInterval(() => {
          const r = ref.current;
          if (r.isMatchComplete) return;
          const elapsed = (Date.now() - r.clockAnchorAt) / 1000;
          r.displayedSeconds = r.clockAnchorSeconds + elapsed * r.clockRate;
          const whole = Math.floor(r.displayedSeconds);
          if (whole !== r.gameTimeSeconds) {
            r.gameTimeSeconds = whole;
            patch({ gameTime: formatGameTime(whole) });
          }
        }, 250)
      : null;

    const onVis = () => { if (document.visibilityState === "visible") void refreshFromServer(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (book.rearmPoll === armPoll) book.rearmPoll = null;
      if (clock) clearInterval(clock);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const vote = useCallback(async (optionId: string) => {
    const poll = s.poll;
    if (!poll || poll.hasVoted || !poll.isActive) return;
    try {
      const res = await api.post<Json>(endpoints.votePoll(poll.id), { optionId });
      const counts = voteCountMap(res?.voteCounts);
      patch((prev) => prev.poll ? ({
        poll: {
          ...prev.poll,
          options: prev.poll.options.map((o) => (counts[o.id] !== undefined ? { ...o, votes: counts[o.id] } : o)),
          hasVoted: true,
          votedOptionId: optionId,
          lockedPayout: resolvedLockedPayout(res),
        },
      }) : {});
    } catch (e) {
      if (e instanceof ApiError && e.message.toLowerCase().includes("already voted")) {
        patch((prev) => (prev.poll ? { poll: { ...prev.poll, hasVoted: true } } : {}));
      }
    }
  }, [patch, s.poll]);

  /** Returns false when the send failed (the composer restores the draft). */
  const sendMessage = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 500) return false;
    try {
      const sent = normalizeChatMessage(await api.post<Json>(endpoints.chatMessages(match.id), { text: trimmed }));
      patch((prev) => (prev.chatMessages.some((m) => m.id === sent.id) ? {} : { chatMessages: [...prev.chatMessages, sent] }));
      return true;
    } catch (e) {
      // 403 COMMENT_BANNED {ends_at}: the ban line shows above the composer.
      noteBan(e);
      return false;
    }
  }, [match.id, patch]);

  const winnerSide: 1 | 2 | null = s.isMatchComplete ? (s.team1Rounds > s.team2Rounds ? 1 : s.team2Rounds > s.team1Rounds ? 2 : null) : null;
  const winnerTeamName = winnerSide === 1 ? match.team1Name : winnerSide === 2 ? match.team2Name : null;

  // Final-whistle verdict for the fan poll.
  let pollVerdict: { pickedLabel: string; correct: boolean; payout: number | null } | null = null;
  if (s.isMatchComplete && s.poll?.votedOptionId) {
    const picked = s.poll.options.find((o) => o.id === s.poll!.votedOptionId);
    if (picked) {
      let correct: boolean | null = null;
      if (s.poll.winningOptionId) correct = s.poll.winningOptionId === picked.id;
      else if (winnerTeamName) correct = picked.label.toLowerCase().includes(winnerTeamName.toLowerCase()) || winnerTeamName.toLowerCase().includes(picked.label.toLowerCase());
      if (correct !== null) pollVerdict = { pickedLabel: picked.label, correct, payout: correct ? s.poll.lockedPayout : null };
    }
  }

  return { ...s, winnerSide, pollVerdict, vote, sendMessage };
}
