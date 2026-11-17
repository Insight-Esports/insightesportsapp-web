// tournaments/BracketScreen.tsx — a tournament (iOS Tournaments.swift
// BracketView + TournamentStages.swift; parity 2026-10-29 §1, 2026-11-05 §1)
// at /tournaments/[id]. The nav bar carries no title: the name is in the header.
//
//   header        game tag · name · LIVE; "8 teams · Bo3 · Bo3 · Bo5",
//                 "16 teams · Swiss · Playoffs", "32 teams · Three Swiss
//                 stages · Playoffs", "16 teams · Groups · Double
//                 elimination" (· Completed)
//   game on now   "QUARTERFINAL · GAME 2" (or "SWISS · ROUND 3 · GAME 1")
//                 over the live match link
//   stage tabs    with several stages: Swiss · Playoffs, Groups · Playoffs,
//                 Stage 1 · Stage 2 · Stage 3 · Playoffs; opens on the live
//                 stage, else the next one up, else the last
//   the stage     SwissStage, GroupStage, or the playoff tree (BracketTree)
//   champion      crest · CHAMPION · name · "Beat X 3–1 in the final" · › (→ team page)
//   TITLE ODDS    the columns the server lists (PO · QF · SF · FINAL, PO ·
//                 UQF · USF · UF · GF; a cup drops its first round) + title,
//                 hidden once completed
//   round by round  a playoff stage's series as rows (→ the series)
//
// GET /tournaments/:id/bracket, refreshed every 30 s until completed.
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, ChevronRight } from "lucide-react";
import { FilterSegment, GamePill, LiveBadge, LoadFailure, Page, SkeletonBar, TeamMark } from "@/components/ui";
import { NavBar } from "@/components/shell/NavBar";
import { useIsPhone } from "@/components/shell/use-phone";
import { useFetch, useInterval } from "@/lib/use-fetch";
import { clsx } from "@/lib/format";
import { pagePathFrom } from "@/features/matches/from-match";
import { pctText } from "./format";
import { bracketHref, tournamentsHref } from "./routes";
import { defaultStage, fetchBracket, formatLine, liveGames, roundLabel, roundPlural, roundShort, tournamentIsLive, type Bracket, type Stage, type TitleOddsRow } from "./data";
import { BracketTree } from "./BracketTree";
import { LiveGameLink, TourLabel } from "./ui";
import { SeriesRoundList } from "./stages/SeriesRoundList";
import { SwissStage } from "./stages/SwissStage";
import { GroupStage } from "./stages/GroupStage";

const teamHref = (id: string) => `/teams/${encodeURIComponent(id)}`;

export function BracketScreen({ id }: { id: string }) {
  const params = useSearchParams();
  const phone = useIsPhone();
  const feed = useFetch<Bracket>((signal) => fetchBracket(id, signal), [id], { cacheKey: `tournaments:bracket:${id}` });
  const b = feed.data;
  const completed = b?.tournament.status === "completed";
  useInterval(feed.reload, b && !completed ? 30_000 : null);
  // Back: the page that opened the bracket (the list with its filter, a team's Honors), else the list.
  const back = pagePathFrom(params.get("from")) ?? tournamentsHref();

  return (
    <Page>
      {/* The name is in the header; the bar keeps only the way back. */}
      <NavBar title="" back={back} centered />
      {!b ? (
        feed.loading ? <BracketSkeleton /> : (
          <div className="pt-10"><LoadFailure error={feed.error ?? "Content not found."} connectionProblem={feed.connectionProblem} onRetry={feed.reload} /></div>
        )
      ) : (
        <BracketBody b={b} wide={!phone} />
      )}
    </Page>
  );
}

function BracketBody({ b, wide }: { b: Bracket; wide: boolean }) {
  const t = b.tournament;
  const live = liveGames(b);
  const completed = t.status === "completed";
  const odds = !completed && b.odds && b.odds.length > 0 ? b.odds : null;
  const [stageId, setStageId] = useState<string | null>(null);
  const stage = b.stages.find((s) => s.id === stageId) ?? defaultStage(b);
  const playoffStage = !!stage && stage.kind !== "swiss" && stage.kind !== "groups";
  const from = bracketHref(t.id);
  return (
    <div className="flex flex-col gap-7 px-4 pt-5">
      {/* 1. Header */}
      <header className="flex flex-col gap-1.5 px-1">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <GamePill game={t.game} className="!text-[13px] shrink-0 -translate-y-[3px]" />
          {/* The LIVE badge flows after the name, so a long name wraps with it rather than orphaning it. */}
          <h1 className="min-w-0 text-[22px] min-[400px]:text-[24px] md:text-[26px] font-bold tracking-[-0.4px] text-primary leading-tight">
            {t.name}
            {tournamentIsLive(b) ? <LiveBadge className="!text-[14px] !font-medium tracking-normal ml-2.5 align-[3px] whitespace-nowrap" /> : null}
          </h1>
        </div>
        <span className="t-body-md text-secondary">{formatLine(b)}</span>
      </header>

      {/* 2. The game on now */}
      {live.length > 0 ? (
        <div className="flex flex-col gap-4 md:max-w-[560px]">
          {live.map(({ series, game }) => (
            <LiveGameLink key={game.matchId} matchId={game.matchId!} caption={`${roundLabel(b, series)} · Game ${game.number}`} />
          ))}
        </div>
      ) : null}

      {/* 3. The stage: tabs with several, then its view */}
      {b.stages.length > 1 && stage ? (
        <FilterSegment
          options={b.stages.map((s) => ({ label: s.name, value: s.id }))}
          value={stage.id}
          onChange={setStageId}
          className="px-1 -mb-2 overflow-x-auto no-scrollbar"
        />
      ) : null}
      {stage ? <StageView key={stage.id} b={b} stage={stage} wide={wide} from={from} /> : null}

      {/* 4. Champion */}
      {t.champion ? <ChampionCard b={b} champion={t.champion} /> : null}

      {odds || playoffStage ? (
        <div className={clsx("grid grid-cols-[minmax(0,1fr)] gap-7", odds && "lg:grid-cols-2 lg:gap-x-6 lg:items-start")}>
          {/* 5. TITLE ODDS */}
          {odds ? <TitleOdds b={b} rows={odds} /> : null}
          {/* 6. Round by round (the playoffs; a Swiss or group stage lists its own) */}
          {stage && playoffStage ? (
            <div className="flex flex-col gap-6 min-w-0">
              {stage.rounds.map((r) => (
                <SeriesRoundList
                  key={`${r.bracket ?? ""}${r.round}`}
                  title={roundPlural(r.name, r.series.length)}
                  detail={`Best of ${r.bestOf}`}
                  series={r.series}
                  currentId={b.currentSeriesId}
                  from={from}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StageView({ b, stage, wide, from }: { b: Bracket; stage: Stage; wide: boolean; from: string }) {
  switch (stage.kind) {
    case "swiss": return <SwissStage stage={stage} bracket={b} from={from} />;
    case "groups": return <GroupStage stage={stage} bracket={b} from={from} />;
    default: return <BracketTree bracket={b} stage={stage} wide={wide} />;
  }
}

// ── Champion ────────────────────────────────────────────────────────────────
/** Crest · muted CHAMPION · name · "Beat Fnatic 3–1 in the final" · chevron (→ team page). No gold, no trophy. */
function ChampionCard({ b, champion }: { b: Bracket; champion: NonNullable<Bracket["tournament"]["champion"]> }) {
  const line = finalLine(b, champion.id);
  return (
    <Link href={teamHref(champion.id)} className="pressable flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border border-border-subtle bg-card hover:bg-surface/60 transition-colors md:max-w-[560px]">
      <TeamMark name={champion.name} logoURL={champion.logoURL} size={40} />
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-muted">CHAMPION</span>
        <span className="t-headline-sm text-primary truncate">{champion.name}</span>
        {line ? <span className="t-body-sm text-secondary truncate">{line}</span> : null}
      </span>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </Link>
  );
}

/** "Beat Fnatic 3–1 in the final": the last playoff round's series the champion won (the grand final in a double elimination) — the opponent and the games. */
function finalLine(b: Bracket, championId: string): string | null {
  const last = b.rounds[b.rounds.length - 1];
  const s = last?.series.find((x) => x.winnerId === championId || x.team1?.id === championId || x.team2?.id === championId);
  if (!s || !s.team1 || !s.team2) return null;
  const champIs1 = s.team1.id === championId;
  const opponent = champIs1 ? s.team2 : s.team1;
  const [won, lost] = champIs1 ? [s.team1Wins, s.team2Wins] : [s.team2Wins, s.team1Wins];
  if (won <= lost) return null;
  return `Beat ${opponent.name} ${won}–${lost} in the final`;
}

// ── TITLE ODDS ──────────────────────────────────────────────────────────────
/** ✓ once reached, "—" at 0, "<1%" under 0.5, else whole percents. */
function OddsCell({ v, check, className }: { v: number; check: boolean; className?: string }) {
  if (check && v >= 99.95) return <span className={clsx("inline-flex justify-end", className)}><Check size={15} strokeWidth={2.75} className="text-violet" /></span>;
  if (v <= 0) return <span className={clsx("text-muted", className)}>—</span>;
  return <span className={className}>{pctText(v)}</span>;
}

/**
 * The columns: every round the server lists (by number, in order), labelled
 * by its own name ("Playoffs" → PO, "Upper Final" → UF), else the playoff
 * round's. In a cup the first round is dropped: everyone plays it.
 */
function oddsColumns(b: Bracket, rows: TitleOddsRow[]): { round: number; label: string }[] {
  const listed = new Map<number, string | null>();
  for (const row of rows) for (const x of row.rounds) if (!listed.has(x.round) || (!listed.get(x.round) && x.name)) listed.set(x.round, x.name);
  let keys = [...listed.keys()].sort((a, c) => a - c);
  if (b.stages.length === 1 && keys.length > 1) keys = keys.slice(1);
  const R = b.rounds.filter((r) => r.bracket !== "lower").length;
  return keys.map((k) => {
    const name = listed.get(k) ?? b.rounds.find((r) => r.round === k && r.bracket !== "lower")?.name ?? null;
    return { round: k, label: roundShort(name, k, R) };
  });
}

function TitleOdds({ b, rows }: { b: Bracket; rows: TitleOddsRow[] }) {
  const cols = oddsColumns(b, rows);
  // Four columns and more (PO · QF · SF · FINAL, PO · UQF · USF · UF · GF):
  // narrower on a phone, so the team keeps room for its name.
  const many = cols.length > 3;
  const w = many ? "w-[36px] md:w-[52px]" : "w-[52px]";
  const pad = many ? "px-3 md:px-4 gap-0.5 md:gap-1" : "px-4 gap-1";
  const num = many ? "text-[13px] md:text-[14px] tabular-nums" : "t-body-md tabular-nums";
  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <TourLabel>Title odds</TourLabel>
      <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden [&>*:nth-child(odd):not(:first-child)]:bg-surface/50">
        <div className={clsx("flex items-center py-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase", pad)}>
          <span className="flex-1">Team</span>
          {cols.map((c) => <span key={c.round} className={clsx(w, "shrink-0 text-right whitespace-nowrap")}>{c.label}</span>)}
          <span className={clsx(w, "shrink-0 text-right")}>Title</span>
        </div>
        {rows.map((row) => (
          <Link key={row.team.id} href={teamHref(row.team.id)} className={clsx("flex items-center py-2.5 min-h-[48px] hover:bg-surface transition-colors", pad, row.eliminated && "opacity-40")}>
            <span className={clsx("flex-1 min-w-0 flex items-center", many ? "gap-2 md:gap-2.5" : "gap-2.5")}>
              <span className="shrink-0 inline-flex"><TeamMark name={row.team.name} logoURL={row.team.logoURL} size={many ? 22 : 26} /></span>
              <span className={clsx("text-primary truncate", many ? "text-[13px] md:text-[14px]" : "t-body-md")}>{row.team.name}</span>
            </span>
            {cols.map((c) => {
              const v = row.rounds.find((x) => x.round === c.round)?.reach ?? 0;
              return <OddsCell key={c.round} v={v} check className={clsx(w, "shrink-0 text-right text-secondary", num)} />;
            })}
            <OddsCell v={row.eliminated ? 0 : row.champion} check={false} className={clsx(w, "shrink-0 text-right font-semibold text-primary", num)} />
          </Link>
        ))}
      </div>
      <p className="px-1 t-label-sm text-muted leading-relaxed">Chance to reach each round and to win the title. For entertainment purposes only. This is not financial advice.</p>
    </section>
  );
}

function BracketSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 pt-5">
      <div className="flex flex-col gap-2 px-1"><SkeletonBar width="60%" height={22} /><SkeletonBar width="40%" height={12} /></div>
      <div className="grid grid-cols-5 gap-2.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col justify-center gap-6" style={{ height: 168 }}>
            {(i === 0 || i === 4 ? [0, 1] : [0]).map((k) => <div key={k} className="h-[58px] rounded-[9px] bg-card border border-border-subtle" />)}
          </div>
        ))}
      </div>
      <SkeletonBar width="30%" height={10} />
      <div className="rounded-2xl border border-border-subtle bg-card h-[220px]" />
    </div>
  );
}
