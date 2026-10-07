// CompletedMatchScreen.tsx — CompletedMatchView (ResultsView.swift): the
// final score HUD, the round tracker (real per-round winners when the
// backend persisted them, neutral otherwise — no fabricated winners) or
// League objectives + the persisted gold curve, the final scoreboard, and
// the match discussion.
"use client";

import { useEffect, useState } from "react";
import { Page, SkeletonStatRow, SplitLayout } from "@/components/ui";
import { api, endpoints } from "@/lib/api";
import { team1Color, team2Color, type Json, type Match } from "@/lib/types";
import { FollowTeamsRow } from "./FollowTeams";
import { GoldChart } from "./GoldChart";
import { MatchTitleStrip } from "./LiveMatchScreen";
import { MatchCommentsSection } from "./MatchComments";
import { LeagueObjectives, RoundTracker, ScoreHUD, StatsTableSection } from "./sections";
import { formatGameTime, isRoundBasedGame, mapTeamRows, normalizeMatchDetail, normalizeStatRows, splitStatRows, viewerLabel, type GoldTimelinePoint, type LeagueObjective, type LivePlayerStat, type LiveRound } from "./types";

interface CompletedState {
  loading: boolean;
  rounds: LiveRound[];
  objectives: LeagueObjective[];
  goldTimeline: GoldTimelinePoint[];
  gameTime: string;
  seriesInfo: string;
  peakViewers: string;
  team1Score: number;
  team2Score: number;
  team1Maps: number;
  team2Maps: number;
  team1Stats: LivePlayerStat[];
  team2Stats: LivePlayerStat[];
  team1Id: string | null;
  team2Id: string | null;
}

function useCompletedMatch(match: Match): CompletedState {
  const isRoundBased = isRoundBasedGame(match.game);
  const [st, setSt] = useState<CompletedState>(() => ({
    loading: true,
    rounds: [],
    objectives: [],
    goldTimeline: [],
    gameTime: "",
    seriesInfo: isRoundBased ? `Final • ${match.mapName ?? "Map"} • Bo${match.bestOf}` : `Final • Bo${match.bestOf}`,
    peakViewers: viewerLabel(match.viewerCount),
    team1Score: match.team1Score,
    team2Score: match.team2Score,
    team1Maps: 0,
    team2Maps: 0,
    team1Stats: [],
    team2Stats: [],
    team1Id: match.team1Id,
    team2Id: match.team2Id,
  }));

  useEffect(() => {
    let active = true;
    (async () => {
      const next: Partial<CompletedState> = {};
      let team1Id = match.team1Id, team2Id = match.team2Id;
      let t1 = match.team1Score, t2 = match.team2Score, m1 = 0, m2 = 0;
      try {
        const d = normalizeMatchDetail(await api.get<Json>(endpoints.matchDetail(match.id)));
        team1Id = d.team1Id ?? team1Id;
        team2Id = d.team2Id ?? team2Id;
        m1 = d.team1MapScore ?? 0;
        m2 = d.team2MapScore ?? 0;
        if (d.team1Score !== null) t1 = d.team1Score;
        if (d.team2Score !== null) t2 = d.team2Score;
        next.gameTime = d.gameTimeSeconds !== null && d.gameTimeSeconds > 0 ? formatGameTime(d.gameTimeSeconds) : "—";
        if (d.roundHistory && d.roundHistory.length) next.rounds = d.roundHistory.map((w, i) => ({ id: i + 1, winner: w, isCurrent: false }));
        if (d.goldTimeline && d.goldTimeline.length) next.goldTimeline = d.goldTimeline;
        if (match.game === "League") {
          const objectives: LeagueObjective[] = [
            { icon: "dragon", label: "Dragons", team1Count: d.team1DragonKills ?? 0, team2Count: d.team2DragonKills ?? 0 },
            { icon: "baren", label: "Barons", team1Count: d.team1BaronKills ?? 0, team2Count: d.team2BaronKills ?? 0 },
            { icon: "tower2", label: "Towers", team1Count: d.team1TowerKills ?? 0, team2Count: d.team2TowerKills ?? 0 },
          ];
          const inh1 = d.team1InhibitorsUp ?? match.team1InhibitorsUp;
          const inh2 = d.team2InhibitorsUp ?? match.team2InhibitorsUp;
          if (inh1 !== null && inh2 !== null) objectives.push({ icon: "inhibitor", label: "Inhibitors", team1Count: inh1, team2Count: inh2 });
          next.objectives = objectives;
        }
      } catch { /* seed values remain */ }

      try {
        const rows = normalizeStatRows(await api.get<Json>(endpoints.matchStats(match.id)));
        if (rows.length) {
          const [r1, r2] = splitStatRows(rows, team1Id, team2Id, true);
          next.team1Stats = mapTeamRows(r1, match.game, null);
          next.team2Stats = mapTeamRows(r2, match.game, null);
        }
      } catch { /* the table shows its own empty message */ }

      if (isRoundBased && !next.rounds) {
        const total = Math.max(t1 + t2, 1);
        next.rounds = Array.from({ length: total }, (_, i) => ({ id: i + 1, winner: 3, isCurrent: false }));
      }
      if (!isRoundBased && (m1 > 0 || m2 > 0)) {
        const lead = m1 > m2 ? `${match.team1Name} win ${m1}-${m2}` : `${match.team2Name} win ${m2}-${m1}`;
        next.seriesInfo = `Final • ${lead} • Bo${match.bestOf}`;
      }
      if (active) setSt((prev) => ({ ...prev, ...next, loading: false, team1Score: t1, team2Score: t2, team1Maps: m1, team2Maps: m2, team1Id, team2Id }));
    })();
    return () => { active = false; };
  }, [match, isRoundBased]);

  return st;
}

export function CompletedMatchScreen({ match }: { match: Match }) {
  const vm = useCompletedMatch(match);
  const isRoundBased = isRoundBasedGame(match.game);
  const c1 = team1Color(match);
  const c2 = team2Color(match);
  const winnerSide: 1 | 2 | null = vm.team1Score > vm.team2Score ? 1 : vm.team2Score > vm.team1Score ? 2 : null;

  const main = (
    <div className="flex flex-col gap-4">
      <ScoreHUD
        match={match}
        isRoundBased={isRoundBased}
        team1Score={vm.team1Score}
        team2Score={vm.team2Score}
        team1Maps={vm.team1Maps}
        team2Maps={vm.team2Maps}
        gameTime={vm.gameTime}
        seriesInfo={vm.seriesInfo}
        viewerCount={vm.peakViewers}
        winnerSide={winnerSide}
      />
      <FollowTeamsRow match={match} team1Id={vm.team1Id} team2Id={vm.team2Id} />
      {vm.loading ? (
        <SkeletonStatRow columns={4} />
      ) : isRoundBased ? (
        <RoundTracker team1Color={c1} team2Color={c2} rounds={vm.rounds} isComplete />
      ) : (
        <>
          <LeagueObjectives team1Color={c1} team2Color={c2} objectives={vm.objectives} />
          {vm.goldTimeline.length ? <GoldChart team1Color={c1} team2Color={c2} team1Name={match.team1Name} team2Name={match.team2Name} timeline={vm.goldTimeline} /> : null}
        </>
      )}
      <StatsTableSection team1Color={c1} team2Color={c2} game={match.game} team1Name={match.team1Name} team2Name={match.team2Name} team1Stats={vm.team1Stats} team2Stats={vm.team2Stats} />
    </div>
  );

  return (
    <Page wide>
      <MatchTitleStrip match={match} isComplete />
      <SplitLayout main={main} rail={<MatchCommentsSection matchId={match.id} />} />
    </Page>
  );
}
