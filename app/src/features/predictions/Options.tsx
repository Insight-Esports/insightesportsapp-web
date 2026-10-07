// predictions/Options.tsx — PredictionOptionsView (flow step 3): what to do
// with the selected target. Players: breakdown (live or full) + Pick a Stat.
// Teams: Head-to-Head, Map Profile (not League), Full Breakdown.
"use client";

import { useSearchParams } from "next/navigation";
import { Activity, BarChartHorizontal, Flag, Map, Target } from "lucide-react";
import { gameLabel } from "@/lib/types";
import { PredictScreen } from "./PredictScreen";
import { flowHref, readTarget } from "./flow";
import { OptionRow, StepHeader } from "./shared";

export function OptionsScreen() {
  const sp = useSearchParams();
  const t = readTarget(sp);

  return (
    <PredictScreen title="Analyze" back={flowHref.select(t.game, t.targetType, false, t.isLive ? "live" : "all")}>
      <div className="flex flex-col gap-5 pt-2">
        <StepHeader title={t.targetName} subtitle={`${gameLabel(t.game)} · ${t.targetType === "player" ? "Player" : "Team"}`} center live={t.isLive} />
        <div className="px-4 flex flex-col gap-3 max-w-2xl w-full mx-auto">
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
              <OptionRow href={flowHref.h2h(t)} icon={<Flag />} title="Head-to-Head" blurb="Pick an opponent (and optionally a map) for win odds with the reasoning behind them" />
              {t.game !== "League" ? (
                <OptionRow href={flowHref.mapProfile(t)} icon={<Map />} title="Map Profile" blurb="Win rate and average stats on a specific map" />
              ) : null}
              <OptionRow href={flowHref.breakdown(t)} icon={<BarChartHorizontal />} title="Full Breakdown" blurb="Record, win rate, +/−, and map performance over time" />
            </>
          )}
        </div>
      </div>
    </PredictScreen>
  );
}
