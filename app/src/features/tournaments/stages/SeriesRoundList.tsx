// tournaments/stages/SeriesRoundList.tsx — a round's series as a list (iOS
// SeriesRoundList + SeriesEntry): a caps kicker with its detail ("Best of 3",
// "Bo1 · Bo3"), then one row a series — seed · crest · name · games won per
// team, the state on the right (LIVE red, FINAL, NEXT violet, else its start)
// — each opening the series. A slot still waiting on its team reads TBD with
// the dashed crest (a Major's Stage 2/3 Round 1 before the stage ahead ends).
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { TeamMark } from "@/components/ui";
import { clsx } from "@/lib/format";
import { seriesHref } from "../routes";
import { nextStartOf, seriesDecided, seriesIsLive, startLabel, type BracketSeries, type BracketTeam } from "../data";
import { TbdCrest, TourLabel } from "../ui";

export function SeriesRoundList({ title, detail, series, currentId, from, empty }: {
  title: string;
  detail?: string | null;
  series: BracketSeries[];
  /** The tournament's next series up (NEXT). */
  currentId: string | null;
  /** The page a series returns to. */
  from: string;
  /** Said in place of the list when the round has no series yet. */
  empty?: string;
}) {
  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <TourLabel trailing={detail}>{title}</TourLabel>
      {series.length ? (
        <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden [&>*+*]:border-t [&>*+*]:border-border-subtle">
          {series.map((s) => <RoundRow key={s.id} s={s} current={s.id === currentId} from={from} />)}
        </div>
      ) : (
        <p className="rounded-2xl border border-border-subtle bg-card px-4 py-5 t-body-sm text-muted text-center">{empty ?? "No series yet."}</p>
      )}
    </section>
  );
}

export function RoundRow({ s, current, from }: { s: BracketSeries; current: boolean; from: string }) {
  const live = seriesIsLive(s);
  const decided = seriesDecided(s);
  const state = live
    ? <span className="text-[11px] font-bold tracking-[0.1em] text-live">LIVE</span>
    : decided ? <span className="text-[11px] font-semibold tracking-[0.1em] text-muted">FINAL</span>
    : current ? <span className="text-[11px] font-bold tracking-[0.1em] text-violet">NEXT</span>
    : <span className="t-label-md text-secondary tabular-nums">{startLabel(nextStartOf(s)) ?? ""}</span>;
  return (
    <Link href={seriesHref(s.id, from)} className="pressable relative flex items-center gap-3 pl-4 pr-3.5 py-2.5 hover:bg-surface/50 transition-colors">
      {live ? <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-live" /> : null}
      <span className="flex flex-col gap-1.5 flex-1 min-w-0">
        <RowTeam team={s.team1} wins={s.team1Wins} s={s} />
        <RowTeam team={s.team2} wins={s.team2Wins} s={s} />
      </span>
      <span className="w-[64px] shrink-0 text-right">{state}</span>
      <ChevronRight size={14} className="text-muted shrink-0 -ml-1" />
    </Link>
  );
}

function RowTeam({ team, wins, s }: { team: BracketTeam | null; wins: number; s: BracketSeries }) {
  const decided = seriesDecided(s);
  const won = !!team && s.winnerId === team.id;
  const lost = !!team && decided && !won;
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="w-3.5 shrink-0 text-right font-mono text-[10px] text-muted">{team?.seed ?? ""}</span>
      {team ? <span className={clsx("inline-flex shrink-0", lost && "opacity-45")}><TeamMark name={team.name} logoURL={team.logoURL} size={20} /></span> : <TbdCrest size={20} />}
      <span className={clsx("flex-1 min-w-0 truncate t-body-sm", !team ? "text-muted" : won ? "text-primary font-semibold" : lost ? "text-muted" : "text-primary")}>{team ? team.name : "TBD"}</span>
      {team ? <span className={clsx("shrink-0 font-mono text-[13px] tabular-nums", won ? "text-violet font-bold" : lost ? "text-muted" : "text-primary")}>{wins}</span> : null}
    </span>
  );
}
