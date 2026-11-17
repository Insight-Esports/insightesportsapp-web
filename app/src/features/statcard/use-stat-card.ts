// use-stat-card.ts — PlayerStatCardViewModel: the card's whole life on
// screen. The match now, their usual once, then the match again every 15 s
// for as long as it is live:
//   GET /matches/:id           the match, its score and its clock
//   GET /matches/:id/stats     every player's line; this player's is the card
//   GET /players/:id/matches   their earlier games: what "usual" is
// Opened from a scoreboard (a seed) it draws at once; the score waits for
// the match's own answer. Leaving the screen ends the loop.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, endpoints } from "@/lib/api";
import { int, normalizeMatch, type Json, type Match } from "@/lib/types";
import { recallMatch } from "@/features/matches/match-cache";
import { normalizeStatRows, statFromRow, type LivePlayerStat, type MatchStatRow } from "@/features/matches/live/types";
import { buildCard, makeUsual, normalizeUsualGames, tableOf, USUAL_WINDOW, type CardModel, type PlayerUsual } from "./model";
import { recallCardSeed } from "./seed";

export type CardPhase = "loading" | "ready" | "noStats" | "failed";

interface CardData {
  phase: CardPhase;
  match: Match | null;
  scoreIsCurrent: boolean;
  clockSeconds: number | null;
  stat: LivePlayerStat | null;
  side: 1 | 2 | null;
  /** Every line of the match, for where this one stands. */
  lobby: MatchStatRow[];
  usual: PlayerUsual | null;
  /** The last try for their games failed; a live card asks again on its next pass. */
  usualFailed: boolean;
}

const LIVE_REFRESH_MS = 15_000;

function initial(matchId: string, playerId: string): CardData {
  const seed = recallCardSeed(matchId, playerId);
  const match = seed?.match ?? null;
  let side: 1 | 2 | null = null;
  if (match && seed?.teamName) side = seed.teamName === match.team1Name ? 1 : seed.teamName === match.team2Name ? 2 : null;
  return {
    phase: "loading",
    match,
    // A finished game's score doesn't move; a live one waits for the match itself.
    scoreIsCurrent: match?.status === "completed",
    clockSeconds: null,
    stat: seed?.stat ?? null,
    side,
    lobby: [],
    usual: null,
    usualFailed: false,
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

export function useStatCard(matchId: string, playerId: string) {
  const [data, setData] = useState<CardData>(() => initial(matchId, playerId));
  /** Bumped by Retry: the loop starts over. */
  const [attempt, setAttempt] = useState(0);
  // The loop's own copy, carried across a Retry (written only from the effect).
  const latest = useRef<CardData | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const { signal } = ctrl;
    const d: CardData = { ...(latest.current ?? initial(matchId, playerId)) };
    const publish = () => { if (!signal.aborted) { latest.current = { ...d }; setData(latest.current); } };

    const refresh = async () => {
      // A retry: the card's silhouette again while it loads.
      if (d.phase === "failed") { d.phase = "loading"; publish(); }
      try {
        const [rowRaw, statsRaw] = await Promise.all([
          api.get<Json>(endpoints.matchDetail(matchId), { signal }),
          api.get<Json>(endpoints.matchStats(matchId), { signal }),
        ]);
        if (signal.aborted) return;
        const fresh = normalizeMatch(rowRaw);
        // A row without logos keeps the ones we came in with (GET /matches/:id doesn't join them).
        const known = d.match ?? recallMatch(matchId);
        if (!fresh.team1LogoURL) fresh.team1LogoURL = known?.team1LogoURL ?? null;
        if (!fresh.team2LogoURL) fresh.team2LogoURL = known?.team2LogoURL ?? null;
        d.match = fresh;
        d.scoreIsCurrent = true;
        d.clockSeconds = int(rowRaw?.game_time_seconds);
        const lobby = normalizeStatRows(statsRaw);
        d.lobby = lobby;
        const mine = lobby.find((r) => r.playerId === playerId);
        if (mine) {
          // Their table on the scoreboard gives their side, and their team's totals (League's shares of kills and damage).
          let mates: MatchStatRow[] = [];
          const table = tableOf(mine, fresh);
          if (table !== null) {
            d.side = table;
            mates = lobby.filter((r) => tableOf(r, fresh) === table);
          }
          d.stat = statFromRow(mine, fresh.game, d.clockSeconds,
            mates.reduce((s, r) => s + (r.kills ?? 0), 0),
            mates.reduce((s, r) => s + (r.damageDealt ?? 0), 0));
        }
        d.phase = d.stat ? "ready" : "noStats";
        publish();
      } catch {
        // Something is already on screen: keep it, and try again on the next pass.
        if (signal.aborted) return;
        if (!d.stat || !d.match) { d.phase = "failed"; publish(); }
      }
    };

    /** Their last games before this one. Asked once their line is in; a failed try is asked again. */
    const loadUsual = async () => {
      if (d.usual || !d.stat || !d.match) return;
      const m = d.match;
      let games: ReturnType<typeof normalizeUsualGames> | null = null;
      try {
        const path = m.status === "completed" && m.completedAt
          ? endpoints.playerMatchesBefore(playerId, USUAL_WINDOW, m.completedAt, matchId)
          : endpoints.playerMatches(playerId, USUAL_WINDOW + 1);
        games = normalizeUsualGames(await api.get<Json>(path, { signal }));
      } catch {
        games = null;
      }
      if (signal.aborted) return;
      if (games) d.usual = makeUsual(games.filter((g) => g.matchId !== matchId).slice(0, USUAL_WINDOW));
      d.usualFailed = games === null;
      publish();
    };

    (async () => {
      // A seed draws at once.
      if (d.stat && d.match && d.phase === "loading") { d.phase = "ready"; publish(); }
      await refresh();
      await loadUsual();
      while (!signal.aborted && d.match?.status === "live") {
        await sleep(LIVE_REFRESH_MS, signal);
        if (signal.aborted) return;
        // A tab in the background skips a pass.
        if (typeof document !== "undefined" && document.visibilityState === "hidden") continue;
        await refresh();
        await loadUsual();   // only if their games aren't in yet
      }
    })();
    return () => ctrl.abort();
  }, [matchId, playerId, attempt]);

  const card: CardModel | null = useMemo(() => {
    if (!data.match || !data.stat) return null;
    return buildCard({ playerId, match: data.match, stat: data.stat, side: data.side, scoreIsCurrent: data.scoreIsCurrent, clockSeconds: data.clockSeconds, lobby: data.lobby, usual: data.usual, usualFailed: data.usualFailed });
  }, [data, playerId]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    card,
    phase: data.phase,
    /** The game is over: a missing line won't arrive. */
    isOver: data.match?.status === "completed",
    retry,
  };
}
