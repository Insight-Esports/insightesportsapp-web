// tournaments/stages/GroupStage.tsx — a group stage (iOS TournamentStages.swift
// GroupStageView): one underline tab a group (Group A …), its STANDINGS
// ("Top 2 advance": the place once decided, else the seed; 1st and 2nd ADV,
// 3rd and 4th OUT; ± the map difference), then its series by round in
// playing order (Opening, Winners, Elimination, Decider), each "Best of 3".
// Opens on the group with a game on, else the next with a series to play,
// else the first. Desktop: the table and the rounds side by side.
"use client";

import { useState } from "react";
import { FilterSegment } from "@/components/ui";
import { seriesDecided, seriesIsLive, type Bracket, type BracketRound, type Stage, type StageGroup } from "../data";
import { TourLabel } from "../ui";
import { SeriesRoundList } from "./SeriesRoundList";
import { StandingsTable } from "./StandingsTable";

/** A group's series by round, in playing order: Opening, Winners, Elimination, Decider (Winners and Elimination share round 2). */
function roundsOf(g: StageGroup): BracketRound[] {
  const out: BracketRound[] = [];
  for (const s of g.series.slice().sort((a, b) => a.round - b.round || a.position - b.position)) {
    const r = out.find((x) => x.round === s.round && x.name === s.roundName);
    if (r) r.series.push(s);
    else out.push({ round: s.round, name: s.roundName, bestOf: s.bestOf, bracket: null, series: [s] });
  }
  return out;
}

export function GroupStage({ stage, bracket, from }: { stage: Stage; bracket: Bracket; from: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const groups = stage.groups;
  const current = groups.find((g) => g.name === picked)
    ?? groups.find((g) => g.series.some(seriesIsLive))
    ?? groups.find((g) => g.series.some((s) => !seriesDecided(s)))
    ?? groups[0]
    ?? null;
  const short = groups.length > 4;
  const perGroup = stage.advance && groups.length > 0 && stage.advance % groups.length === 0 ? stage.advance / groups.length : null;

  if (!current) {
    return stage.standings.length ? <StandingsTable rows={stage.standings} /> : null;
  }
  return (
    <div className="flex flex-col gap-5">
      {groups.length > 1 ? (
        <FilterSegment
          options={groups.map((g) => ({ label: short ? g.name : `Group ${g.name}`, value: g.name }))}
          value={current.name}
          onChange={setPicked}
          className="px-1"
        />
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-2 lg:gap-x-6 lg:items-start">
        <section className="flex flex-col gap-2.5 min-w-0">
          <TourLabel trailing={perGroup ? `Top ${perGroup} advance` : null}>Standings</TourLabel>
          <StandingsTable rows={current.standings} />
        </section>
        <div className="flex flex-col gap-6 min-w-0">
          {roundsOf(current).map((r) => (
            <SeriesRoundList key={`${r.round}-${r.name}`} title={r.name} detail={`Best of ${r.bestOf}`} series={r.series} currentId={bracket.currentSeriesId} from={from} />
          ))}
        </div>
      </div>
    </div>
  );
}
