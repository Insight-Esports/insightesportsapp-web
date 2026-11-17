// predictions/Options.tsx — PredictionOptionsView (flow step 3): what to do
// with the selected target, under the entity header (with the live match
// link while they play). Players: breakdown (live or full) + Pick a Stat.
// Teams not playing: Head-to-Head, Map Profile (not League), Full Breakdown.
// A team playing right now (Oct 29 §4): Current Game Breakdown, Pick a Stat,
// Full Breakdown — no Head-to-Head or Map Profile (the breakdown carries the
// map profile for the live map).
//
// Nov 5 §7: picked from "All" but playing right now (the header's Live rule),
// this match's reads come first under a red-dot THIS MATCH label (Current
// Game Breakdown, Live Stat Line), then a violet ALL GAMES label over the
// usual options. The live match line is already under the header.
"use client";

import { useSearchParams } from "next/navigation";
import { Activity, BarChartHorizontal, Flag, Map, Target } from "lucide-react";
import { EntityHeader } from "@/components/ui/entity-header";
import { PredictScreen } from "./PredictScreen";
import { backOr, flowHref, readTarget } from "./flow";
import { OptionRow } from "./shared";
import { OptionsKicker, usePlayingNow } from "./playing-now";

export function OptionsScreen() {
  const sp = useSearchParams();
  const t = readTarget(sp);
  const liveTeam = t.targetType === "team" && t.isLive && !!t.matchId;
  const playing = usePlayingNow(t.targetType, t.targetId, !t.isLive);
  // The live reads come back here (not to the live-mode Analyze page).
  const liveT = playing ? { ...t, isLive: true, matchId: playing.id, back: flowHref.options(t) } : null;

  return (
    <PredictScreen title="Analyze" back={backOr(t, t.isLive && t.matchId ? `/match/${encodeURIComponent(t.matchId)}` : flowHref.select(t.game, t.targetType, false, t.isLive ? "live" : "all"))}>
      <div className="flex flex-col gap-5 pt-3 max-w-2xl w-full mx-auto">
        <div className="px-4">
          <EntityHeader type={t.targetType} id={t.targetId} name={t.targetName} game={t.game} matchId={t.isLive ? t.matchId : null} live={t.isLive} />
        </div>
        {liveT ? (
          <div className="px-4 flex flex-col gap-3">
            <OptionsKicker text="THIS MATCH" live />
            <OptionRow
              href={t.targetType === "player" ? flowHref.live(liveT) : flowHref.liveTeam(liveT)}
              icon={<Activity />}
              title="Current Game Breakdown"
              blurb={t.targetType === "player" ? "How they're performing in this match right now" : "The roster's live lines and the pace they're on"}
            />
            <OptionRow href={flowHref.stat(liveT)} icon={<Target />} title="Live Stat Line" blurb="Predict a stat line for this match, factoring in the live game" />
          </div>
        ) : null}
        <div className="px-4 flex flex-col gap-3">
          {liveT ? <OptionsKicker text="ALL GAMES" /> : null}
          {t.targetType === "player" ? (
            <>
              {t.isLive ? (
                <OptionRow href={flowHref.live(t)} icon={<Activity />} title="Current Game Breakdown" blurb="How they're performing in their live match right now" />
              ) : (
                <OptionRow href={flowHref.breakdown(t)} icon={<BarChartHorizontal />} title="Full Breakdown" blurb="Career averages, map + agent splits, recent form, highs and lows" />
              )}
              <OptionRow href={flowHref.stat(t)} icon={<Target />} title="Pick a Stat" blurb={t.isLive ? "Predict a stat line factoring in the live game" : "Choose a stat and a line to get hit probability"} />
            </>
          ) : (
            <>
              {liveTeam ? (
                <>
                  <OptionRow
                    href={flowHref.liveTeam(t)}
                    icon={<Activity />}
                    title="Current Game Breakdown"
                    blurb={t.game === "League" ? "The roster's live lines and the pace they're on" : "Rounds, the roster's live lines and pace, and both teams on this map"}
                  />
                  <OptionRow href={flowHref.stat(t)} icon={<Target />} title="Pick a Stat" blurb="Team kills or +/− for this series, factoring in the live game" />
                </>
              ) : (
                <>
                  <OptionRow href={flowHref.h2h(t)} icon={<Flag />} title="Head-to-Head" blurb="Pick an opponent (and optionally a map) for win odds with the reasoning behind them" />
                  {t.game !== "League" ? (
                    <OptionRow href={flowHref.mapProfile(t)} icon={<Map />} title="Map Profile" blurb="Each map against their usual, with their recent form there" />
                  ) : null}
                </>
              )}
              <OptionRow href={flowHref.breakdown(t)} icon={<BarChartHorizontal />} title="Full Breakdown" blurb="Record, win rate, +/−, and map performance over time" />
            </>
          )}
        </div>
      </div>
    </PredictScreen>
  );
}
