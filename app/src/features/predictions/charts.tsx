// predictions/charts.tsx — the result screen's two visuals: the probability
// dial and the recent-games bar chart with its over/under baseline.
//
// Chart correctness (from PredictionResultView.swift):
// - Backend returns recent games most-recent FIRST; bars read oldest → newest.
// - The scale includes the baseline, a dashed gold line marks it, and a bar
//   is green only by the identical rule the backend counts hits with:
//   over → statValue >= baseline, under → statValue < baseline.
// - Value labels up to 12 bars; beyond that labels drop and spacing tightens.
"use client";

import { clsx } from "@/lib/format";
import { PredictionFormat, type PredictionGame } from "./types";

const BAR_MAX = 90;
const LABEL_H = 14;
const LABEL_LIMIT = 12;

export function ProbabilityDial({ confidence, exact, prediction, probabilityText }: { confidence: number; exact: number | null; prediction: string; probabilityText: string | null }) {
  const pct = Math.min(0.995, (exact ?? confidence) / 100);
  const color = prediction === "LIKELY" ? "var(--success)" : prediction === "UNLIKELY" ? "var(--error)" : "var(--gold)";
  const r = 71, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="relative size-[150px]">
        <svg viewBox="0 0 150 150" className="size-full -rotate-90">
          <circle cx="75" cy="75" r={r} fill="none" stroke="var(--surface)" strokeWidth="8" />
          <circle cx="75" cy="75" r={r} fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${Math.max(0.003, pct) * c} ${c}`} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-5">
          <span className="t-score text-[34px] text-primary leading-none whitespace-nowrap">{probabilityText ?? PredictionFormat.percent(exact, confidence)}</span>
          <span className="text-[10px] font-semibold tracking-[0.14em] text-muted">CHANCE</span>
        </div>
      </div>
      <span className="font-rounded text-[13px] font-black tracking-[0.15em]" style={{ color }}>{prediction}</span>
    </div>
  );
}

function hitColor(value: number, baseline: number | null, isUnder: boolean): string {
  if (baseline == null) return "var(--violet)";
  const hit = isUnder ? value < baseline : value >= baseline;
  return hit ? "var(--success)" : "rgb(239 68 68 / 0.45)";
}

/** Bars + the dashed baseline. `games` arrive most-recent first. */
export function GamesBars({ games, baseline, direction, showLabels }: { games: PredictionGame[]; baseline: number | null; direction: string | null; showLabels?: boolean }) {
  const ordered = [...games].reverse();
  const labels = showLabels ?? ordered.length <= LABEL_LIMIT;
  const gap = ordered.length <= LABEL_LIMIT ? 6 : 3;
  const dataMax = Math.max(...ordered.map((g) => g.statValue), 1);
  const chartMax = Math.max(dataMax, baseline ?? 0, 1);
  const isUnder = direction === "under";
  const height = BAR_MAX + (labels ? LABEL_H + 4 : 4);
  const baselineY = baseline != null ? (baseline / chartMax) * BAR_MAX : null;
  return (
    <div className="relative" style={{ height }}>
      <div className="absolute inset-x-0 bottom-0 flex items-end" style={{ gap, height }}>
        {ordered.map((g, i) => {
          const h = Math.max(2, (g.statValue / chartMax) * BAR_MAX);
          return (
            <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end gap-[3px]" title={[g.matchup, g.mapName, g.agent, g.matchDate].filter(Boolean).join(" · ")}>
              {labels ? <span className="text-[9px] font-semibold text-muted leading-none whitespace-nowrap">{PredictionFormat.compact(g.statValue)}</span> : null}
              <span className="block w-full rounded-[1.5px]" style={{ height: h, background: hitColor(g.statValue, baseline, isUnder) }} />
            </div>
          );
        })}
      </div>
      {baseline != null && baselineY != null ? (
        <div className="absolute inset-x-0 pointer-events-none" style={{ bottom: baselineY - 0.75 }}>
          <div className="border-t-[1.5px] border-dashed border-gold" />
          <span className="absolute right-0 -top-[13px] px-1 bg-card t-label-sm text-gold leading-none">{PredictionFormat.compact(baseline)}</span>
        </div>
      ) : null}
    </div>
  );
}

function Dot({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: color }} /><span className="t-label-sm text-muted">{label}</span></span>;
}

export function GamesLegend({ baseline, direction }: { baseline: number | null; direction: string | null }) {
  if (baseline == null) return null;
  const isUnder = direction === "under";
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Dot color="var(--success)" label={isUnder ? `Hit (under ${PredictionFormat.stat(baseline)})` : `Hit (${PredictionFormat.stat(baseline)}+)`} />
      <Dot color="rgb(239 68 68 / 0.45)" label="Missed" />
      <Dot color="var(--gold)" label="Line" />
    </div>
  );
}

/** Bordered card with bars + legend (the live screen's liveGamesCard). */
export function GamesCard({ title, games, baseline, direction, average, className }: { title: string; games: PredictionGame[]; baseline: number | null; direction: string | null; average: number | null; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-2.5 p-3.5 rounded-xl bg-card border border-border-subtle", className)}>
      <div className="flex items-center justify-between">
        <span className="t-label-sm text-muted uppercase">{title}</span>
        {average != null ? <span className="t-label-sm text-violet">avg {PredictionFormat.stat(average)}</span> : null}
      </div>
      <GamesBars games={games} baseline={baseline} direction={direction} showLabels />
      <GamesLegend baseline={baseline} direction={direction} />
    </div>
  );
}
