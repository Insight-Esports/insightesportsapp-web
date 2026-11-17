// tournaments/BracketTree.tsx — the playoff tree (parity 2026-10-29 §1.3,
// 2026-11-05 §1; iOS Tournaments.swift BracketLayout).
//
// Three shapes:
//   mirrored  up to three rounds (an 8-team draw): the two halves run in from
//             the edges and meet at the final in the centre column,
//             QF | SF | FINAL | SF | QF.
//   linear    four rounds and more (16 and 32 teams): left to right,
//             R16 · QF · SF · FINAL, the final on the right.
//   double    double elimination: the upper bracket on top (UQF · USF · UF),
//             the lower under it with its own column labels (LR1 · LR2 ·
//             LR3 · LF), the grand final (GF) in its own column on the right,
//             level with the middle of the two finals.
// Each series is a 58px card with two lines (seed · crest · games won); the
// connectors follow next_series_id from each feeder to the series its
// winner goes to — across, down, across — violet once the feeder is
// decided. Under each open matchup: its favourite, "SEN 72%".
//
// Columns share the width from 66px up to 96px on phones (below 66 the tree
// scrolls sideways); on desktop they grow and the cards carry team names.
// Everything is placed absolutely from one measured width, so cards,
// connectors and labels always line up.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TeamMark } from "@/components/ui";
import { clsx } from "@/lib/format";
import { teamLetters } from "@/lib/team-letters";
import { pctText } from "./format";
import { bracketHref, seriesHref } from "./routes";
import { roundShort, seriesDecided, seriesIsLive, stageIsDouble, type Bracket, type BracketRound, type BracketSeries, type BracketTeam, type Stage } from "./data";
import { TbdCrest } from "./ui";

const CARD_H = 58;
/** Card + the favourite label's room beneath it. */
const PITCH = CARD_H + 26;
/** Room under the last row for its favourite label. */
const TAIL = 22;
const MIN_COL = 66;
const PHONE_MAX_COL = 96;
const DESK_MAX_COL = 212;
/** Cards carry team names from this column width up. */
const NAMES_FROM = 132;
/** Double elimination: the lower bracket's label row sits this far under the upper bracket… */
const LOWER_LABEL_GAP = 10;
/** …and its cards this far under that label row's top (the top row's 34 + 14). */
const LOWER_CARDS_GAP = 48;

/** `ltr`: a linear or double-elimination slot, its connectors run left to right. */
interface Placed { s: BracketSeries; col: number; cy: number; side: "left" | "right" | "centre" | "ltr" }
interface ColumnLabel { text: string; bo: string }
interface Layout {
  placed: Placed[];
  cols: number;
  height: number;
  /** Column → the top label row (the upper or only bracket, and the grand final). */
  labels: Map<number, ColumnLabel>;
  /** Column → the lower bracket's label row, at `lowerLabelTop` in the tree. */
  lowerLabels: Map<number, ColumnLabel>;
  lowerLabelTop: number | null;
}
const labelOf = (r: BracketRound, rounds = 1): ColumnLabel => ({ text: roundShort(r.name, r.round, rounds), bo: `Bo${r.bestOf}` });

/** Where each series sits: column index and vertical centre. */
function layout(stage: Stage): Layout {
  const rounds = stage.rounds;
  if (stageIsDouble(stage)) return doubleLayout(rounds);
  if (rounds.length > 3) return linearLayout(rounds);
  return mirroredLayout(rounds);
}

/** Up to three rounds: the two halves of the draw meet at the final in the centre column. */
function mirroredLayout(rounds: BracketRound[]): Layout {
  const R = rounds.length;
  const labels = new Map<number, ColumnLabel>();
  if (R === 0) return { placed: [], cols: 0, height: 0, labels, lowerLabels: new Map(), lowerLabelTop: null };
  const cols = 2 * R - 1;
  const placed: Placed[] = [];
  const centreOf = (r: number, idx: number) => (idx * 2 ** (r - 1) + (2 ** (r - 1) - 1) / 2) * PITCH + CARD_H / 2;
  rounds.forEach((round, i) => {
    const r = i + 1;
    const list = round.series;
    if (r === R || list.length === 1) {
      // The final (or a lone series): the centre column, level with the semis.
      for (const s of list) placed.push({ s, col: R - 1, cy: R >= 2 ? centreOf(R - 1, 0) : CARD_H / 2, side: "centre" });
      return;
    }
    const half = list.length / 2;
    list.forEach((s, k) => {
      const left = k < half;
      const idx = left ? k : k - half;
      placed.push({ s, col: left ? r - 1 : cols - r, cy: centreOf(r, idx), side: left ? "left" : "right" });
    });
  });
  for (let c = 0; c < cols; c++) {
    const r = c < R ? c + 1 : cols - c;
    labels.set(c, labelOf(rounds[r - 1], R));
  }
  const perHalf = Math.max(1, (rounds[0]?.series.length ?? 2) / 2);
  const height = R === 1 ? CARD_H + TAIL : (perHalf - 1) * PITCH + CARD_H + TAIL;
  return { placed, cols, height, labels, lowerLabels: new Map(), lowerLabelTop: null };
}

/**
 * One bracket's rounds left to right from column 0, the first round in rows
 * from `top`, each later series level with the middle of the series that
 * feed it (by next_series_id; by position when a payload has none).
 */
function chain(rounds: BracketRound[], top: number): { placed: Placed[]; cy: Map<string, number>; height: number } {
  const placed: Placed[] = [];
  const cy = new Map<string, number>();
  let prev: BracketSeries[] = [];
  rounds.forEach((round, r) => {
    round.series.forEach((s, i) => {
      let feeders = prev.filter((p) => p.nextSeriesId === s.id);
      if (!feeders.length && r > 0) {
        feeders = prev.length === round.series.length ? [prev[i]].filter(Boolean) : [prev[2 * i], prev[2 * i + 1]].filter(Boolean);
      }
      const ys = feeders.map((f) => cy.get(f.id)).filter((y): y is number => y != null);
      const y = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : top + i * PITCH + CARD_H / 2;
      cy.set(s.id, y);
      placed.push({ s, col: r, cy: y, side: "ltr" });
    });
    prev = round.series;
  });
  const rows = Math.max(1, rounds[0]?.series.length ?? 1);
  return { placed, cy, height: (rows - 1) * PITCH + CARD_H + TAIL };
}

/** Four rounds and more (16 and 32 teams): left to right, the final on the right. */
function linearLayout(rounds: BracketRound[]): Layout {
  const { placed, height } = chain(rounds, 0);
  const labels = new Map(rounds.map((r, i) => [i, labelOf(r, rounds.length)] as const));
  return { placed, cols: Math.max(1, rounds.length), height, labels, lowerLabels: new Map(), lowerLabelTop: null };
}

/** Double elimination: upper on top, lower under it, the grand final on the right of both. */
function doubleLayout(rounds: BracketRound[]): Layout {
  const upper = rounds.filter((r) => r.bracket !== "lower" && r.bracket !== "grand_final");
  const lower = rounds.filter((r) => r.bracket === "lower");
  const grand = rounds.filter((r) => r.bracket === "grand_final");
  const up = chain(upper, 0);
  const lowerLabelTop = up.height + LOWER_LABEL_GAP;
  const low = chain(lower, lowerLabelTop + LOWER_CARDS_GAP);
  const gfCol = Math.max(upper.length, lower.length);
  const labels = new Map(upper.map((r) => [upper.indexOf(r), labelOf(r)] as const));
  const lowerLabels = new Map(lower.map((r) => [lower.indexOf(r), labelOf(r)] as const));
  // The grand final: level with the middle of the two finals.
  const finals = [...(upper[upper.length - 1]?.series ?? []), ...(lower[lower.length - 1]?.series ?? [])];
  const ys = finals.map((s) => up.cy.get(s.id) ?? low.cy.get(s.id)).filter((y): y is number => y != null);
  const lowerBottom = lower.length ? lowerLabelTop + LOWER_CARDS_GAP + low.height : up.height;
  const gfY = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : lowerBottom / 2;
  const placed = [...up.placed, ...low.placed];
  for (const round of grand) {
    labels.set(gfCol, labelOf(round));
    for (const s of round.series) placed.push({ s, col: gfCol, cy: gfY, side: "ltr" });
  }
  return {
    placed,
    cols: gfCol + (grand.length ? 1 : 0),
    height: lowerBottom,
    labels,
    lowerLabels,
    lowerLabelTop: lower.length ? lowerLabelTop : null,
  };
}

export function BracketTree({ bracket, stage, wide }: { bracket: Bracket; /** The playoff stage drawn (a cup's only stage). */ stage: Stage; /** Desktop: wider columns with names. */ wide: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setAvail(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { placed, cols, height, labels, lowerLabels, lowerLabelTop } = layout(stage);
  const maxCol = wide ? DESK_MAX_COL : PHONE_MAX_COL;
  const colW = avail == null || cols === 0 ? 0 : Math.max(MIN_COL, Math.min(maxCol, Math.floor(avail / cols)));
  const names = colW >= NAMES_FROM;
  const gap = names ? 22 : Math.round(colW * 0.13);
  const cardW = colW - gap;
  const totalW = colW * cols;
  const xOf = (col: number) => col * colW + gap / 2;
  const from = bracketHref(bracket.tournament.id);
  const byId = new Map(placed.map((p) => [p.s.id, p]));

  // Connectors: feeder inner edge → across → down → across → next card
  // (left to right in a linear or double-elimination tree).
  const lines = placed.flatMap((p) => {
    const n = p.s.nextSeriesId ? byId.get(p.s.nextSeriesId) : null;
    if (!n || p.side === "centre") return [];
    let x1: number, x2: number;
    if (p.side === "ltr") {
      if (n.col <= p.col) return [];
      x1 = xOf(p.col) + cardW;
      x2 = xOf(n.col);
    } else {
      x1 = p.side === "left" ? xOf(p.col) + cardW : xOf(p.col);
      x2 = n.side === "right" ? xOf(n.col) + cardW : n.side === "left" ? xOf(n.col) : p.side === "left" ? xOf(n.col) : xOf(n.col) + cardW;
    }
    const mid = Math.round((x1 + x2) / 2);
    const decided = seriesDecided(p.s);
    return [{ key: p.s.id, d: `M ${x1} ${p.cy} H ${mid} V ${n.cy} H ${x2}`, decided }];
  });

  return (
    <div ref={ref} className="w-full min-w-0">
      {avail == null ? <div style={{ height: height + 48 }} /> : (
        // Too narrow for 66px columns: the tree scrolls sideways, edge to edge.
        <div className={clsx(totalW > avail ? "-mx-4 px-4 overflow-x-auto no-scrollbar" : "w-full")}>
          <div className="relative mx-auto" style={{ width: totalW }}>
            {/* Column labels: QF / SF / FINAL with the length under each. */}
            <div className="flex" style={{ height: 34 }}>
              {Array.from({ length: cols }, (_, c) => <ColumnHead key={c} label={labels.get(c) ?? null} width={colW} />)}
            </div>
            <div className="relative mt-3.5" style={{ height }}>
              {/* Double elimination: the lower bracket's own labels, under the upper. */}
              {lowerLabelTop != null ? (
                <div className="absolute left-0 flex" style={{ top: lowerLabelTop, height: 34 }}>
                  {Array.from({ length: cols }, (_, c) => <ColumnHead key={c} label={lowerLabels.get(c) ?? null} width={colW} />)}
                </div>
              ) : null}
              <svg className="absolute inset-0 pointer-events-none" width={totalW} height={height} aria-hidden>
                {lines.filter((l) => !l.decided).map((l) => <path key={l.key} d={l.d} fill="none" stroke="var(--border-strong)" strokeWidth={1} shapeRendering="crispEdges" />)}
                {lines.filter((l) => l.decided).map((l) => <path key={l.key} d={l.d} fill="none" stroke="var(--violet)" strokeOpacity={0.7} strokeWidth={1.5} />)}
              </svg>
              {placed.map((p) => (
                <SeriesCard
                  key={p.s.id}
                  s={p.s}
                  x={xOf(p.col)}
                  y={p.cy - CARD_H / 2}
                  w={cardW}
                  names={names}
                  next={p.s.id === bracket.currentSeriesId}
                  href={seriesHref(p.s.id, from)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnHead({ label, width }: { label: ColumnLabel | null; width: number }) {
  return (
    <div className="flex flex-col items-center justify-start gap-0.5" style={{ width }}>
      {label ? (
        <>
          <span className="text-[11px] font-semibold tracking-[0.14em] leading-none text-secondary whitespace-nowrap">{label.text}</span>
          <span className="text-[10px] text-muted leading-none mt-1">{label.bo}</span>
        </>
      ) : null}
    </div>
  );
}

function SeriesCard({ s, x, y, w, names, next, href }: { s: BracketSeries; x: number; y: number; w: number; names: boolean; next: boolean; href: string }) {
  const live = seriesIsLive(s);
  const decided = seriesDecided(s);
  // Edge: live red · next series violet · else subtle (the final too — no gold).
  const edge = live ? "border-[1.5px] border-live" : next ? "border-[1.5px] border-violet" : "border border-border-subtle";
  const fav = !decided && s.team1 && s.team2 && s.odds ? (s.odds.team1 >= s.odds.team2 ? { t: s.team1, p: s.odds.team1 } : { t: s.team2, p: s.odds.team2 }) : null;
  return (
    <>
      <Link
        href={href}
        aria-label={`${s.roundName}: ${s.team1?.name ?? "TBD"} vs ${s.team2?.name ?? "TBD"}`}
        className={clsx("absolute flex flex-col rounded-[9px] bg-card overflow-hidden hover:bg-surface transition-colors", edge)}
        style={{ left: x, top: y, width: w, height: CARD_H }}
      >
        <CardLine team={s.team1} wins={s.team1Wins} s={s} names={names} tight={w < 62} />
        <span className="h-px shrink-0 bg-border-subtle" />
        <CardLine team={s.team2} wins={s.team2Wins} s={s} names={names} tight={w < 62} />
      </Link>
      {live ? <span aria-hidden className="absolute size-[7px] rounded-full bg-live live-dot" style={{ left: x + w - 5, top: y - 2 }} /> : null}
      {fav ? (
        <span className={clsx("absolute text-center font-mono leading-[11px] text-secondary whitespace-nowrap tracking-[0.04em]", names ? "text-[10px]" : "text-[9px]")} style={{ left: x - 6, width: w + 12, top: y + CARD_H + 4 }}>
          {teamLetters(fav.t.name)}&nbsp;&nbsp;{pctText(fav.p)}
        </span>
      ) : null}
    </>
  );
}

function CardLine({ team, wins, s, names, tight }: { team: BracketTeam | null; wins: number; s: BracketSeries; names: boolean; /** Narrow cards (< 62px): less padding. */ tight: boolean }) {
  const decided = seriesDecided(s);
  const won = !!team && !!s.winnerId && s.winnerId === team.id;
  const lost = !!team && decided && !won;
  return (
    <span className={clsx("flex-1 min-h-0 flex items-center", tight ? "gap-[4px] pl-[4px] pr-[5px]" : "gap-[5px] pl-[6px] pr-[7px]", won && "bg-violet/[.08]")}>
      <span className="min-w-[9px] shrink-0 text-right font-mono text-[9px] leading-none text-muted">{team?.seed ?? ""}</span>
      {team ? (
        <span className={clsx("shrink-0 inline-flex", lost && "opacity-45")}><TeamMark name={team.name} logoURL={team.logoURL} size={18} /></span>
      ) : (
        <TbdCrest size={18} />
      )}
      {names ? (
        <span className={clsx("flex-1 min-w-0 truncate t-label-md", !team ? "text-muted" : won ? "text-primary font-semibold" : lost ? "text-muted" : "text-primary")}>{team ? team.name : "TBD"}</span>
      ) : <span className="flex-1" />}
      {team ? (
        <span className={clsx("shrink-0 font-mono text-[13px] leading-none tabular-nums", won ? "text-violet font-bold" : lost ? "text-muted" : "text-primary")}>{wins}</span>
      ) : null}
    </span>
  );
}
