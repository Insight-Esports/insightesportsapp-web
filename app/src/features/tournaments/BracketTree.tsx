// tournaments/BracketTree.tsx — the playoff tree (parity 2026-10-29 §1.3).
//
// The two halves of the draw run in from the edges and meet at the final in
// the centre column: QF | SF | FINAL | SF | QF (R16 … for 16 teams). Each
// series is a 58px card with two lines (seed · crest · games won); the
// connectors run from each card's inner edge to the next round — across,
// down, across — violet once the feeder is decided. Under each open
// matchup: its favourite, "SEN 72%".
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
import { roundShort, seriesDecided, seriesIsLive, type Bracket, type BracketSeries, type BracketTeam } from "./data";
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

interface Placed { s: BracketSeries; col: number; cy: number; side: "left" | "right" | "centre" }

/** Where each series sits: column index and vertical centre. */
function layout(b: Bracket): { placed: Placed[]; cols: number; height: number } {
  const R = b.rounds.length;
  if (R === 0) return { placed: [], cols: 0, height: 0 };
  const cols = 2 * R - 1;
  const placed: Placed[] = [];
  const centreOf = (r: number, idx: number) => (idx * 2 ** (r - 1) + (2 ** (r - 1) - 1) / 2) * PITCH + CARD_H / 2;
  for (const round of b.rounds) {
    const r = round.round;
    const list = round.series;
    if (r === R || list.length === 1) {
      // The final (or a lone series): the centre column, level with the semis.
      for (const s of list) placed.push({ s, col: R - 1, cy: R >= 2 ? centreOf(R - 1, 0) : CARD_H / 2, side: "centre" });
      continue;
    }
    const half = list.length / 2;
    list.forEach((s, i) => {
      const left = i < half;
      const idx = left ? i : i - half;
      placed.push({ s, col: left ? r - 1 : cols - r, cy: centreOf(r, idx), side: left ? "left" : "right" });
    });
  }
  const perHalf = Math.max(1, (b.rounds[0]?.series.length ?? 2) / 2);
  const height = R === 1 ? CARD_H + TAIL : (perHalf - 1) * PITCH + CARD_H + TAIL;
  return { placed, cols, height };
}

export function BracketTree({ bracket, wide }: { bracket: Bracket; /** Desktop: wider columns with names. */ wide: boolean }) {
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

  const { placed, cols, height } = layout(bracket);
  const R = bracket.rounds.length;
  const maxCol = wide ? DESK_MAX_COL : PHONE_MAX_COL;
  const colW = avail == null || cols === 0 ? 0 : Math.max(MIN_COL, Math.min(maxCol, Math.floor(avail / cols)));
  const names = colW >= NAMES_FROM;
  const gap = names ? 22 : Math.round(colW * 0.13);
  const cardW = colW - gap;
  const totalW = colW * cols;
  const xOf = (col: number) => col * colW + gap / 2;
  const from = bracketHref(bracket.tournament.id);
  const byId = new Map(placed.map((p) => [p.s.id, p]));

  // Connectors: feeder inner edge → across → down → across → next card.
  const lines = placed.flatMap((p) => {
    const n = p.s.nextSeriesId ? byId.get(p.s.nextSeriesId) : null;
    if (!n || p.side === "centre") return [];
    const x1 = p.side === "left" ? xOf(p.col) + cardW : xOf(p.col);
    const x2 = n.side === "right" ? xOf(n.col) + cardW : n.side === "left" ? xOf(n.col) : p.side === "left" ? xOf(n.col) : xOf(n.col) + cardW;
    const mid = Math.round((x1 + x2) / 2);
    const decided = seriesDecided(p.s);
    return [{ key: p.s.id, d: `M ${x1} ${p.cy} H ${mid} V ${n.cy} H ${x2}`, decided }];
  });

  const labels = Array.from({ length: cols }, (_, c) => {
    const r = c < R ? c + 1 : cols - c;
    const round = bracket.rounds.find((x) => x.round === r);
    return { c, text: roundShort(round?.name, r, R), bo: round ? `Bo${round.bestOf}` : "", final: r === R };
  });

  return (
    <div ref={ref} className="w-full min-w-0">
      {avail == null ? <div style={{ height: height + 48 }} /> : (
        // Too narrow for 66px columns: the tree scrolls sideways, edge to edge.
        <div className={clsx(totalW > avail ? "-mx-4 px-4 overflow-x-auto no-scrollbar" : "w-full")}>
          <div className="relative mx-auto" style={{ width: totalW }}>
            {/* Column labels: QF / SF / FINAL with the length under each. */}
            <div className="flex" style={{ height: 34 }}>
              {labels.map((l) => (
                <div key={l.c} className="flex flex-col items-center justify-start gap-0.5" style={{ width: colW }}>
                  <span className={clsx("text-[11px] font-semibold tracking-[0.14em] leading-none", l.final ? "text-gold" : "text-secondary")}>{l.text}</span>
                  <span className="text-[10px] text-muted leading-none mt-1">{l.bo}</span>
                </div>
              ))}
            </div>
            <div className="relative mt-3.5" style={{ height }}>
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
                  final={p.s.round === R}
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

function SeriesCard({ s, x, y, w, names, final, next, href }: { s: BracketSeries; x: number; y: number; w: number; names: boolean; final: boolean; next: boolean; href: string }) {
  const live = seriesIsLive(s);
  const decided = seriesDecided(s);
  // Edge: live red · next series violet · the final gold until decided · else subtle.
  const edge = live ? "border-[1.5px] border-live" : next ? "border-[1.5px] border-violet" : final && !decided ? "border border-gold/45" : "border border-border-subtle";
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
