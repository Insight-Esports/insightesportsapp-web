// SeriesOddsCard.tsx — SERIES ODDS (GET /tournaments/series/:id/odds,
// parity 2026-10-29 §1): who takes the series, how it ends, the next game
// with its series effects, and the games that may not happen. Also exports
// the "81%  TO WIN THE SERIES  19%" line the match preview reuses.
"use client";

import type { ReactNode } from "react";
import { TeamMark } from "@/components/ui";
import { pctText } from "@/features/tournaments/format";
import type { SeriesInfo, SeriesOdds } from "./series-data";
import { adjustmentsSentence } from "./series-logic";

/** Muted caps section title above a card ("SERIES ODDS", "GAMES"). */
export function SeriesSectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-[13px] font-medium tracking-[0.04em] uppercase text-secondary px-1 ${className ?? ""}`}>{children}</h2>;
}

const Rule = () => <div className="h-px bg-border-subtle" />;
const CAPS = "text-[11px] font-semibold tracking-[0.14em] uppercase text-muted";

/** "81%  LABEL  19%" over one flush 6px bar in the two colours. */
export function SeriesWinLine({ label, left, right, c1, c2 }: { label: ReactNode; left: number | null; right: number | null; c1: string; c2: string }) {
  const l = Math.max(0, left ?? 0);
  const r = Math.max(0, right ?? 0);
  const share = l + r > 0 ? (l / (l + r)) * 100 : 50;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-medium tabular-nums w-12" style={{ color: c1 }}>{pctText(left)}</span>
        <span className={`flex-1 text-center truncate ${CAPS}`}>{label}</span>
        <span className="text-[15px] font-medium tabular-nums w-12 text-right" style={{ color: c2 }}>{pctText(right)}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden" role="meter" aria-valuenow={Math.round(share)} aria-valuemin={0} aria-valuemax={100}>
        <span className="h-full transition-[width] duration-700 ease-in-out" style={{ width: `${share}%`, background: c1 }} />
        <span className="h-full flex-1" style={{ background: c2 }} />
      </div>
    </div>
  );
}

/**
 * The card. Sides are the series' team1 / team2; `c1` / `c2` their colours
 * (from the key game's row, already flipped to the series' sides). Hidden
 * when the odds aren't available or the series is decided.
 */
export function SeriesOddsCard({ series, odds, c1, c2 }: { series: SeriesInfo; odds: SeriesOdds | null; c1: string; c2: string }) {
  if (!odds || !odds.available || odds.decided || !series.team1 || !series.team2) return null;
  const t1 = series.team1, t2 = series.team2;
  const maxScore = Math.max(0, ...odds.scores.map((s) => s.probability));
  const next = odds.nextGame;
  const adjust = next ? adjustmentsSentence(next.adjustments, t1.name, t2.name) : null;
  // Games that may not happen: upcoming / tbd, played < 99.5.
  const maybe = odds.games.filter((g) => (g.status === "upcoming" || g.status === "tbd") && g.played != null && g.played < 99.5);

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-2xl bg-card border border-border-subtle px-4 py-4 flex flex-col gap-4">
        <SeriesWinLine label="TO WIN THE SERIES" left={odds.team1Series} right={odds.team2Series} c1={c1} c2={c2} />

        {odds.scores.length ? (
          <>
            <Rule />
            <div className="flex flex-col gap-2.5">
              <span className={CAPS}>HOW IT ENDS</span>
              {odds.scores.map((s) => {
                const w = s.winner === "team1" ? t1 : t2;
                const color = s.winner === "team1" ? c1 : c2;
                const width = maxScore > 0 ? (s.probability / maxScore) * 100 : 0;
                return (
                  <div key={`${s.winner}-${s.score}`} className="flex items-center gap-2.5 min-w-0">
                    <TeamMark name={w.name} logoURL={w.logoURL} size={18} />
                    <span className="t-body-md text-primary truncate min-w-0">{w.name}</span>
                    <span className="flex-1" />
                    <span className="w-[34px] shrink-0 text-right t-mono-sm text-secondary">{s.score}</span>
                    <span className="w-[72px] shrink-0 h-1.5 rounded-full bg-surface overflow-hidden">
                      <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${width}%`, background: color, opacity: 0.85 }} />
                    </span>
                    <span className="w-[42px] shrink-0 text-right t-mono-sm text-primary">{pctText(s.probability)}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        {next && next.team1 != null && next.team2 != null ? (
          <>
            <Rule />
            <div className="flex flex-col gap-2">
              <SeriesWinLine label={next.live ? `GAME ${next.number} · LIVE` : `GAME ${next.number}`} left={next.team1} right={next.team2} c1={c1} c2={c2} />
              {adjust ? <span className="t-body-sm text-secondary">{adjust}</span> : null}
            </div>
          </>
        ) : null}

        {maybe.map((g) => (
          <div key={g.number} className="contents">
            <Rule />
            <div className="flex items-center gap-2 min-w-0">
              <span className={`truncate ${CAPS}`}>GAME {g.number} · IF NECESSARY</span>
              <span className="flex-1" />
              <span className="t-body-sm text-secondary shrink-0">{pctText(g.played)} to be played</span>
            </div>
          </div>
        ))}
      </div>
      {odds.disclaimer ? <p className="t-label-md text-muted px-1">{odds.disclaimer}</p> : null}
    </div>
  );
}
