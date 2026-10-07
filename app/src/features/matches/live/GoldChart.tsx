// GoldChart.tsx — LeagueGoldChart: the broadcast "Gold Difference: Entire
// Game" graph. Jagged linear line (no smoothing), solid fills on each
// team's side of the center line, and the line color ALWAYS matches the
// side it's on — team1 above zero, team2 below, flipping exactly at every
// crossing (sign runs with an inserted crossing point, so it's structural,
// not stateful). Adds a hover crosshair + tooltip for the web.
"use client";

import { useId, useMemo, useRef, useState } from "react";
import { SectionBox, abbr } from "./sections";
import type { GoldTimelinePoint } from "./types";

const W = 640;
const H = 200;
const PAD = { top: 10, right: 12, bottom: 22, left: 40 };

function formatK(v: number): string {
  const a = Math.abs(v);
  return a >= 1000 ? `${(a / 1000).toFixed(1)}k` : String(a);
}
function axisLabel(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return "0";
  return a >= 1000 ? `${Math.round(a / 1000)}k` : String(a);
}
function minuteLabel(m: number): string {
  return m < 1 && m > 0 ? `${Math.round(m * 60)}s` : `${Math.floor(m)}m`;
}

// DISPLAY-ONLY densification: deterministic (seeded by minute) so every
// viewer draws byte-identical texture from the same server array.
function densify(timeline: GoldTimelinePoint[]): GoldTimelinePoint[] {
  if (timeline.length < 2) return timeline;
  const out: GoldTimelinePoint[] = [];
  for (let i = 0; i < timeline.length - 1; i++) {
    const a = timeline[i], b = timeline[i + 1];
    out.push(a);
    const delta = b.goldDiff - a.goldDiff;
    const amp = Math.min(140, Math.abs(delta) * 0.3 + 25);
    const steps = 3;
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 1);
      const minute = a.minute + (b.minute - a.minute) * t;
      const seed = Math.sin(minute * 12.9898) * 43758.5453;
      const jitter = (seed - Math.floor(seed) - 0.5) * 2 * amp;
      out.push({ minute, goldDiff: Math.trunc(a.goldDiff + delta * t + jitter) });
    }
  }
  out.push(timeline[timeline.length - 1]);
  return out;
}

interface Run { positive: boolean; points: GoldTimelinePoint[] }
function signRuns(points: GoldTimelinePoint[]): Run[] {
  const runs: Run[] = [];
  let current: GoldTimelinePoint[] = [];
  let sign = 0;
  const close = () => { if (current.length) runs.push({ positive: sign >= 0, points: current }); };
  for (const p of points) {
    const s = p.goldDiff === 0 ? 0 : p.goldDiff > 0 ? 1 : -1;
    if (!current.length) { current = [p]; sign = s; continue; }
    if (s === 0 || sign === 0 || s === sign) { current.push(p); if (sign === 0) sign = s; }
    else {
      const prev = current[current.length - 1];
      const span = p.goldDiff - prev.goldDiff;
      const t = span === 0 ? 0 : -prev.goldDiff / span;
      const cross = { minute: prev.minute + (p.minute - prev.minute) * t, goldDiff: 0 };
      current.push(cross);
      close();
      current = [cross, p];
      sign = s;
    }
  }
  close();
  return runs;
}

export function GoldChart({ team1Color: c1, team2Color: c2, team1Name, team2Name, timeline, liveDiff = null }: { team1Color: string; team2Color: string; team1Name: string; team2Name: string; timeline: GoldTimelinePoint[]; liveDiff?: number | null }) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<GoldTimelinePoint | null>(null);

  const currentDiff = liveDiff ?? timeline[timeline.length - 1]?.goldDiff ?? 0;
  const leadLabel = currentDiff > 0 ? `${abbr(team1Name)} +${formatK(currentDiff)}` : currentDiff < 0 ? `${abbr(team2Name)} +${formatK(currentDiff)}` : "Even";
  const leadColor = currentDiff > 0 ? c1 : currentDiff < 0 ? c2 : "var(--text-secondary)";

  const { display, runs, yBound, xUpper } = useMemo(() => {
    const display = densify(timeline);
    const maxAbs = timeline.reduce((m, p) => Math.max(m, Math.abs(p.goldDiff)), 0);
    const yBound = Math.max(1000, Math.ceil((maxAbs * 1.2) / 500) * 500);
    const last = timeline[timeline.length - 1]?.minute ?? 1;
    const xUpper = Math.max(1, last + Math.max(0.6, last * 0.06));
    return { display, runs: signRuns(display), yBound, xUpper };
  }, [timeline]);

  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (m: number) => PAD.left + (m / xUpper) * iw;
  const y = (d: number) => PAD.top + ih / 2 - (d / yBound) * (ih / 2);
  const y0 = y(0);

  const poly = (pts: GoldTimelinePoint[]) => pts.map((p) => `${x(p.minute).toFixed(1)},${y(p.goldDiff).toFixed(1)}`).join(" ");
  const areaPos = display.length ? `M${x(display[0].minute).toFixed(1)},${y0.toFixed(1)} ` + display.map((p) => `L${x(p.minute).toFixed(1)},${y(Math.max(p.goldDiff, 0)).toFixed(1)}`).join(" ") + ` L${x(display[display.length - 1].minute).toFixed(1)},${y0.toFixed(1)} Z` : "";
  const areaNeg = display.length ? `M${x(display[0].minute).toFixed(1)},${y0.toFixed(1)} ` + display.map((p) => `L${x(p.minute).toFixed(1)},${y(Math.min(p.goldDiff, 0)).toFixed(1)}`).join(" ") + ` L${x(display[display.length - 1].minute).toFixed(1)},${y0.toFixed(1)} Z` : "";

  const xTicks = useMemo(() => {
    const n = 5;
    const step = xUpper / n;
    return Array.from({ length: n + 1 }, (_, i) => +(i * step).toFixed(2)).filter((m) => m <= xUpper);
  }, [xUpper]);
  const yTicks = [-yBound, -yBound / 2, 0, yBound / 2, yBound];
  const last = timeline[timeline.length - 1];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !timeline.length) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const minute = ((px - PAD.left) / iw) * xUpper;
    let best = timeline[0];
    for (const p of timeline) if (Math.abs(p.minute - minute) < Math.abs(best.minute - minute)) best = p;
    setHover(best);
  };

  return (
    <SectionBox className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="t-label-md text-muted">Gold Difference</span>
        <span className="t-label-md" style={{ color: leadColor }}>{leadLabel}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="t-label-sm truncate" style={{ color: c1 }}>▲ {team1Name}</span>
        <span className="t-label-sm truncate" style={{ color: c2 }}>{team2Name} ▼</span>
      </div>
      <div className="relative">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px] block" role="img" aria-label={`Gold difference over time, currently ${leadLabel}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <clipPath id={`${id}-clip`}><rect x={PAD.left} y={PAD.top} width={iw} height={ih} /></clipPath>
          {/* grid + axes (recessive) */}
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" strokeWidth={0.5} />
              <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={t === 0 ? "var(--text-secondary)" : "var(--text-muted)"}>{axisLabel(t)}</text>
            </g>
          ))}
          {xTicks.map((m) => (
            <g key={`x${m}`}>
              <line x1={x(m)} x2={x(m)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--border-subtle)" strokeWidth={0.5} />
              <text x={x(m)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{minuteLabel(m)}</text>
            </g>
          ))}
          <g clipPath={`url(#${id}-clip)`}>
            {areaPos ? <path d={areaPos} fill={c1} fillOpacity={0.26} /> : null}
            {areaNeg ? <path d={areaNeg} fill={c2} fillOpacity={0.26} /> : null}
            <line x1={PAD.left} x2={W - PAD.right} y1={y0} y2={y0} stroke="var(--text-secondary)" strokeOpacity={0.5} strokeWidth={1.2} />
            {runs.map((r, i) => (
              <polyline key={i} points={poly(r.points)} fill="none" stroke={r.positive ? c1 : c2} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {last ? <circle cx={x(last.minute)} cy={y(last.goldDiff)} r={3.5} fill={leadColor} stroke="var(--card)" strokeWidth={2} /> : null}
            {hover ? (
              <g>
                <line x1={x(hover.minute)} x2={x(hover.minute)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3 3" />
                <circle cx={x(hover.minute)} cy={y(hover.goldDiff)} r={4} fill={hover.goldDiff >= 0 ? c1 : c2} stroke="var(--card)" strokeWidth={2} />
              </g>
            ) : null}
          </g>
        </svg>
        {hover ? (
          <div className="absolute top-1 pointer-events-none rounded-md bg-surface border border-hairline px-2 py-1 flex flex-col" style={{ left: `clamp(0px, calc(${(x(hover.minute) / W) * 100}% + 8px), calc(100% - 120px))` }}>
            <span className="t-label-sm text-muted">{minuteLabel(hover.minute)} {hover.minute >= 1 ? `${String(Math.round((hover.minute % 1) * 60)).padStart(2, "0")}s` : ""}</span>
            <span className="t-mono-sm text-primary">{hover.goldDiff === 0 ? "Even" : `${hover.goldDiff > 0 ? abbr(team1Name) : abbr(team2Name)} +${formatK(hover.goldDiff)}`}</span>
          </div>
        ) : null}
      </div>
    </SectionBox>
  );
}
