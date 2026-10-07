// use-live-match.ts — LiveMatchViewModel as a hook.
//
// Data strategy (identical to the app):
//   INSTANT (socket):   round score, map score, current round, game time,
//                       odds, chat messages, poll vote counts
//   POLLED (8s REST):   player stats table, League objectives + gold
//                       timeline, AND match progress as a socket fallback —
//                       score and round coloring keep working even if the
//                       socket can't connect; sockets just make them instant.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { api, endpoints, ApiError } from "@/lib/api";
import { getSocket, rooms } from "@/lib/socket";
import { normalizePlayers, type Match, type Json } from "@/lib/types";
import {
  formatGameTime, mapTeamRows, normalizeChatHistory, normalizeChatMessage,
  normalizeMatchDetail, normalizePoll, normalizeProgress, normalizeStatRows, placeholderStat,
  resolvedLockedPayout, splitStatRows, viewerLabel, voteCountMap,
  type FanPoll, type GoldTimelinePoint, type LeagueObjective, type LiveChatMessage, type LivePlayerStat, type LiveRound,
} from "./types";

export interface LiveMatchState {
  team1Rounds: number;
  team2Rounds: number;
  team1Maps: number;
  team2Maps: number;
  currentRound: number;
  gameTime: string;
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
}

const STATS_POLL_MS = 8000;

export function useLiveMatch(match: Match) {
  const [s, setS] = useState<LiveMatchState>(() => ({
    team1Rounds: match.team1Score,
    team2Rounds: match.team2Score,
    team1Maps: 0,
    team2Maps: 0,
    currentRound: 0,
    gameTime: "00:00",
    seriesInfo: "",
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
  }));

  // Mutable bookkeeping that must not trigger renders.
  const ref = useRef({
    team1Id: match.team1Id,
    team2Id: match.team2Id,
    team1Rounds: match.team1Score,
    team2Rounds: match.team2Score,
    team1Maps: 0,
    team2Maps: 0,
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
    pollId: null as string | null,
    socket: null as Socket | null,
    stopped: false,
  });
  const isLeague = match.game === "League";

  const patch = useCallback((p: Partial<LiveMatchState> | ((prev: LiveMatchState) => Partial<LiveMatchState>)) => {
    setS((prev) => ({ ...prev, ...(typeof p === "function" ? p(prev) : p) }));
  }, []);

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

  const updateSeriesInfo = useCallback(() => {
    const r = ref.current;
    const mapsPlayed = r.team1Maps + r.team2Maps;
    const gameNumber = mapsPlayed + 1;
    const label = match.game === "League" ? "Game" : "Map";
    let lead = `Series tied ${r.team1Maps}-${r.team2Maps}`;
    if (r.team1Maps > r.team2Maps) lead = `${match.team1Name} leads ${r.team1Maps}-${r.team2Maps}`;
    else if (r.team2Maps > r.team1Maps) lead = `${match.team2Name} leads ${r.team2Maps}-${r.team1Maps}`;
    patch({ seriesInfo: `${label} ${Math.min(gameNumber, match.bestOf)} of ${match.bestOf} • ${lead}`, team1Maps: r.team1Maps, team2Maps: r.team2Maps });
  }, [match.bestOf, match.game, match.team1Name, match.team2Name, patch]);

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
        anchorClock(Math.max(r.displayedSeconds, last.minute * 60));
      }
      patch(next);

      if (completed) {
        r.team1Rounds = p.team1Rounds ?? r.team1Rounds;
        r.team2Rounds = p.team2Rounds ?? r.team2Rounds;
        r.team1Maps = p.team1Maps ?? r.team1Maps;
        r.team2Maps = p.team2Maps ?? r.team2Maps;
        rebuildRounds();
        updateSeriesInfo();
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
      r.team1Maps = p.team1Maps ?? r.team1Maps;
      r.team2Maps = p.team2Maps ?? r.team2Maps;
      patch({ team1Maps: r.team1Maps, team2Maps: r.team2Maps, currentRound: p.currentRound ?? r.team1Rounds + r.team2Rounds + 1 });
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
  }, [anchorClock, applyRoundScore, checkIfCompleted, completeMatch, handleRateLimit, match.id, match.team1Score, match.team2Score, patch, rebuildRounds, syncGameClock, updateSeriesInfo]);

  const refreshFromServer = useCallback(async () => {
    const r = ref.current;
    if (r.refreshInFlight || Date.now() - r.lastServerRefresh < 1500) return;
    r.refreshInFlight = true;
    try { await loadProgress(); } finally { r.refreshInFlight = false; r.lastServerRefresh = Date.now(); }
  }, [loadProgress]);

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

  const loadStats = useCallback(async () => {
    const r = ref.current;
    try {
      const rows = normalizeStatRows(await api.get<Json>(endpoints.matchStats(match.id)));
      if (!rows.length) {
        // No stats yet (pre-game / just started): show the rosters at 0 so
        // the scoreboard isn't empty — only while we have nothing real.
        if (!r.hasRealStats) await loadRosterPlaceholders();
        return;
      }
      const [t1, t2] = splitStatRows(rows, r.team1Id, r.team2Id);
      r.hasRealStats = true;
      patch({ team1Stats: mapTeamRows(t1, match.game, r.gameTimeSeconds), team2Stats: mapTeamRows(t2, match.game, r.gameTimeSeconds) });
    } catch (e) {
      if (e instanceof ApiError && e.isRateLimited) handleRateLimit();
    }
  }, [handleRateLimit, loadRosterPlaceholders, match.game, match.id, patch]);

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
    r.stopped = false;
    let socket: Socket | null = null;

    const onConnect = () => {
      if (!socket) return;
      rooms.joinMatch(socket, match.id);
      if (r.pollId) rooms.joinPoll(socket, r.pollId);
      patch({ socketConnected: true });
    };
    const onDisconnect = () => patch({ socketConnected: false });
    const pctOf = (v: Json): number | null => (typeof v === "number" ? Math.round(v <= 1 ? v * 100 : v) : null);

    const onRoundUpdate = (d: Json) => {
      if (!d || typeof d !== "object") return;
      if (d.matchId && String(d.matchId) !== match.id) return;
      if (Array.isArray(d.roundHistory)) r.roundHistory = d.roundHistory.map(Number);
      applyRoundScore(typeof d.team1Rounds === "number" ? d.team1Rounds : null, typeof d.team2Rounds === "number" ? d.team2Rounds : null);
      const next: Partial<LiveMatchState> = {};
      if (typeof d.currentRound === "number") next.currentRound = d.currentRound;
      if (typeof d.team1Maps === "number") { r.team1Maps = d.team1Maps; next.team1Maps = d.team1Maps; }
      if (typeof d.team2Maps === "number") { r.team2Maps = d.team2Maps; next.team2Maps = d.team2Maps; }
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
    const onGold = () => { void refreshFromServer(); };
    const onMatchUpdate = (d: Json) => {
      if (!d || typeof d !== "object") return;
      if (d.matchId && String(d.matchId) !== match.id) return;
      const next: Partial<LiveMatchState> = {};
      if (typeof d.team1Maps === "number") { r.team1Maps = d.team1Maps; }
      if (typeof d.team2Maps === "number") { r.team2Maps = d.team2Maps; }
      if (typeof d.team1Gold === "number" && typeof d.team2Gold === "number") next.liveGoldDiff = d.team1Gold - d.team2Gold;
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

    (async () => {
      try {
        const sock = await getSocket();
        if (r.stopped) return;
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
        sock.on("poll_update", onPollUpdate);
        sock.on("match_completed", onMatchCompleted);
        if (sock.connected) onConnect();
      } catch { /* the 8s REST polling keeps the screen current */ }
    })();

    return () => {
      r.stopped = true;
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
        socket.off("poll_update", onPollUpdate);
        socket.off("match_completed", onMatchCompleted);
      }
      r.socket = null;
    };
  }, [match.id, applyRoundScore, loadWinProbability, patch, rebuildRounds, refreshFromServer, syncGameClock, updateSeriesInfo]);

  // ── Initial loads + polling + clock ─────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.all([loadProgress(), loadDetail()]);
      if (!active) return;
      await Promise.all([loadStats(), loadWinProbability(), loadPoll(), loadChatHistory()]);
    })();

    const poll = setInterval(() => {
      const r = ref.current;
      if (r.isMatchComplete || Date.now() < r.rateLimitedUntil) return;
      if (document.visibilityState !== "visible") return;
      r.pollCycle += 1;
      void (async () => {
        await loadProgress();
        await loadStats();
        if (isLeague && r.pollCycle % 3 === 0) await loadDetail();
      })();
    }, STATS_POLL_MS);

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
      clearInterval(poll);
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
    } catch {
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
