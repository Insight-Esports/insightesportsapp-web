// LiveMatchScreen.tsx — LiveMatchView: the live match screen. Score HUD,
// round/map state, win probability, scoreboard, fan poll, predictions
// teaser, live chat, match discussion. Two columns on wide screens:
// scoreboard + stats on the left, chat / poll / discussion in the rail.
"use client";

import { useEffect, useRef, useState } from "react";
import { Flag } from "lucide-react";
import { AssetIcon, LiveBadge, Page, SplitLayout } from "@/components/ui";
import { team1Color, team2Color, type Match } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { featureState } from "./feature-status";
import { FollowTeamsRow } from "./FollowTeams";
import { GoldChart } from "./GoldChart";
import { LiveChatSection } from "./LiveChat";
import { MatchCommentsSection } from "./MatchComments";
import { CollapsedScoreBar, FanPollSection, LeagueObjectives, PredictionTeaserSection, RoundTracker, ScoreHUD, StatsTableSection, WinProbabilityBar } from "./sections";
import { isRoundBasedGame } from "./types";
import { useLiveMatch } from "./use-live-match";

/** Title strip above the HUD: Live/Final + tournament (the iOS principal toolbar). */
export function MatchTitleStrip({ match, isComplete, children }: { match: Match; isComplete: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 min-w-0">
      {isComplete ? (
        <span className="text-[10px] font-bold text-muted px-1.5 py-0.5 rounded-full bg-surface">FINAL</span>
      ) : (
        <LiveBadge />
      )}
      <span className="t-label-md text-secondary truncate">{match.tournamentName ?? "Unknown Tournament"}</span>
      <span className="flex-1" />
      {children}
    </div>
  );
}

export function LiveMatchScreen({ match }: { match: Match }) {
  const { isPremium, status } = useAppState();
  const vm = useLiveMatch(match);
  const isRoundBased = isRoundBasedGame(match.game);
  const c1 = team1Color(match);
  const c2 = team2Color(match);
  const polls = featureState(status, "polls");
  const chat = featureState(status, "live_chat");

  // The HUD collapses to a compact sticky bar once it scrolls away.
  const hudRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = hudRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting), { threshold: 0, rootMargin: "-8px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const [voting, setVoting] = useState(false);
  const onVote = async (optionId: string) => {
    if (polls.off || polls.degraded) return;
    setVoting(true);
    try { await vm.vote(optionId); } finally { setVoting(false); }
  };
  const onSend = async (text: string) => {
    if (chat.off || chat.degraded) return false;
    return vm.sendMessage(text);
  };

  const main = (
    <div className="flex flex-col gap-4">
      <div ref={hudRef}>
        <ScoreHUD
          match={match}
          isRoundBased={isRoundBased}
          team1Score={vm.team1Rounds}
          team2Score={vm.team2Rounds}
          team1Maps={vm.team1Maps}
          team2Maps={vm.team2Maps}
          gameTime={vm.gameTime}
          seriesInfo={vm.seriesInfo}
          viewerCount={vm.viewerCount}
          team1Side={vm.team1Side}
          team2Side={vm.team2Side}
          winnerSide={vm.winnerSide}
          team1Alive={vm.team1Alive}
          team2Alive={vm.team2Alive}
          isLive={!vm.isMatchComplete}
        />
      </div>

      {vm.isMatchComplete ? (
        <div className="flex flex-col rounded-xl overflow-hidden border border-border-subtle">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-card">
            <Flag size={12} className="text-secondary" />
            <span className="t-label-md text-secondary">Match complete — this game has ended</span>
          </div>
          {vm.pollVerdict ? (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-card hairline-t">
              <AssetIcon name={vm.pollVerdict.correct ? "correct" : "wrong"} height={16} />
              <span className="t-label-md text-primary">{vm.pollVerdict.correct ? `You picked ${vm.pollVerdict.pickedLabel} — correct!` : `You picked ${vm.pollVerdict.pickedLabel} — wrong this time`}</span>
              <span className="flex-1" />
              {vm.pollVerdict.payout !== null ? <span className="t-mono-sm text-success">+{vm.pollVerdict.payout} pts</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <FollowTeamsRow match={match} team1Id={match.team1Id} team2Id={match.team2Id} />

      {isRoundBased ? (
        <RoundTracker team1Color={c1} team2Color={c2} rounds={vm.rounds} isComplete={vm.isMatchComplete} />
      ) : (
        <>
          <LeagueObjectives team1Color={c1} team2Color={c2} objectives={vm.objectives} />
          <GoldChart team1Color={c1} team2Color={c2} team1Name={match.team1Name} team2Name={match.team2Name} timeline={vm.goldTimeline} liveDiff={vm.liveGoldDiff} />
        </>
      )}

      <WinProbabilityBar team1Color={c1} team2Color={c2} team1Name={match.team1Name} team2Name={match.team2Name} team1Probability={vm.team1WinProbability} />

      <StatsTableSection team1Color={c1} team2Color={c2} game={match.game} team1Name={match.team1Name} team2Name={match.team2Name} team1Stats={vm.team1Stats} team2Stats={vm.team2Stats} />

      <PredictionTeaserSection
        team1Color={c1}
        team2Color={c2}
        game={match.game}
        matchId={match.id}
        team1TopPlayer={vm.team1Stats[0] ?? null}
        team2TopPlayer={vm.team2Stats[0] ?? null}
        team1Name={match.team1Name}
        team2Name={match.team2Name}
        isPremium={isPremium}
      />
    </div>
  );

  const rail = (
    <div className="flex flex-col gap-4">
      {vm.poll ? (
        <FanPollSection
          poll={vm.poll}
          team1Color={c1}
          team2Color={c2}
          team1Name={match.team1Name}
          team2Name={match.team2Name}
          team1LogoURL={match.team1LogoURL}
          team2LogoURL={match.team2LogoURL}
          team1Probability={vm.team1WinProbability}
          onVote={(id) => void onVote(id)}
          degradedMessage={polls.off || polls.degraded ? polls.message ?? "Polls are temporarily unavailable." : null}
          voting={voting}
        />
      ) : null}
      <div className="lg:hidden">
        <LiveChatSection match={match} team1Score={vm.team1Rounds} team2Score={vm.team2Rounds} messages={vm.chatMessages} onSend={onSend} isComplete={vm.isMatchComplete} sendDisabled={chat.off || chat.degraded} variant="compact" />
      </div>
      <div className="hidden lg:block">
        <LiveChatSection match={match} team1Score={vm.team1Rounds} team2Score={vm.team2Rounds} messages={vm.chatMessages} onSend={onSend} isComplete={vm.isMatchComplete} sendDisabled={chat.off || chat.degraded} variant="panel" />
      </div>
      <MatchCommentsSection matchId={match.id} />
    </div>
  );

  return (
    <Page wide>
      <MatchTitleStrip match={match} isComplete={vm.isMatchComplete}>
        {!vm.socketConnected && !vm.isMatchComplete ? <span className="t-label-sm text-muted" title="Live socket not connected — updating every few seconds">polling</span> : null}
      </MatchTitleStrip>
      <div className={`sticky top-0 z-20 px-4 pb-2 bg-bg transition-opacity ${collapsed ? "opacity-100" : "opacity-0 pointer-events-none h-0 pb-0 overflow-hidden"}`} aria-hidden={!collapsed}>
        <CollapsedScoreBar match={match} team1Score={vm.team1Rounds} team2Score={vm.team2Rounds} isComplete={vm.isMatchComplete} />
      </div>
      <SplitLayout main={main} rail={rail} />
    </Page>
  );
}
