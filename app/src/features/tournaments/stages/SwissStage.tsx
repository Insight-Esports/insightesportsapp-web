// tournaments/stages/SwissStage.tsx — a Swiss stage (iOS TournamentStages.swift
// SwissStageView): STANDINGS ("Top 8 advance") by record, then the rounds
// under the underline tabs (Round 1 … or R1 … past four), the round picked
// as a list of its series ("Best of 1", or "Bo1 · Bo3" when it mixes).
// Opens on the round being played, else the next one up, else the last. A
// Major's Stage 2/3 Round 1 lists its series with the open side as TBD.
// Desktop: the table and the rounds side by side.
"use client";

import { useState } from "react";
import { FilterSegment } from "@/components/ui";
import { roundFormat, seriesDecided, seriesIsLive, type Bracket, type Stage } from "../data";
import { TourLabel } from "../ui";
import { SeriesRoundList } from "./SeriesRoundList";
import { StandingsTable } from "./StandingsTable";

export function SwissStage({ stage, bracket, from }: { stage: Stage; bracket: Bracket; from: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const rounds = stage.rounds;
  const current = rounds.find((r) => r.round === picked)
    ?? rounds.find((r) => r.series.some(seriesIsLive))
    ?? rounds.find((r) => r.series.some((s) => !seriesDecided(s)))
    ?? rounds[rounds.length - 1]
    ?? null;
  const short = rounds.length > 4;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-2 lg:gap-x-6 lg:items-start">
      {stage.standings.length ? (
        <section className="flex flex-col gap-2.5 min-w-0">
          <TourLabel trailing={stage.advance ? `Top ${stage.advance} advance` : null}>Standings</TourLabel>
          <StandingsTable rows={stage.standings} byRecord />
        </section>
      ) : null}
      {current ? (
        <section className="flex flex-col gap-4 min-w-0">
          <FilterSegment
            options={rounds.map((r) => ({ label: short ? `R${r.round}` : `Round ${r.round}`, value: r.round }))}
            value={current.round}
            onChange={setPicked}
            className="px-1"
          />
          <SeriesRoundList
            title="Matches"
            detail={current.series.length ? roundFormat(current) : null}
            series={current.series}
            currentId={bracket.currentSeriesId}
            from={from}
            empty={current.round > 1 ? `Paired once Round ${current.round - 1} is done.` : "Not drawn yet."}
          />
        </section>
      ) : null}
    </div>
  );
}
