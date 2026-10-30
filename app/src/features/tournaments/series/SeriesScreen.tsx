// SeriesScreen.tsx — one series of a tournament bracket (iOS Tournaments.swift
// series page; parity 2026-10-29 §0 + §1). Title = the round name. From the
// top: the score card, the live game's link, SERIES ODDS, GAMES (each game's
// number, score and winner with their crest; a row opens that match and Back
// returns here), UPCOMING by day as Upcoming cards, or SCHEDULE while the
// series waits on its teams. Polled 10 s while a game is live, 20 s
// otherwise, until decided. Back goes to `from` (the bracket it came from),
// else the bracket of its tournament.
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LoadFailure, Page, SkeletonBar, SkeletonLedger, SkeletonMatchCard, TeamMark } from "@/components/ui";
import { LiveMatchLink, useLiveMatchLink } from "@/components/ui/entity-header";
import { NavBar } from "@/components/shell/NavBar";
import { clsx, formatTime, isSameDay } from "@/lib/format";
import { team1Color, team2Color } from "@/lib/types";
import { teamLetters } from "@/lib/team-letters";
import { useReveal } from "@/lib/use-reveal";
import { UpcomingMatchCard, teamHref } from "@/features/matches/cards";
import { pagePathFrom } from "@/features/matches/from-match";
import { bracketHref, matchFromSeriesHref, seriesHref, tournamentsHref } from "@/features/tournaments/routes";
import { gameScoreFromSeries, seriesDecided, seriesGameMatch, useSeriesPage, type SeriesDetail, type SeriesGame, type SeriesInfo, type SeriesTeam } from "./series-data";
import { SeriesOddsCard, SeriesSectionTitle } from "./SeriesOddsCard";
import { readableSides } from "./series-logic";

const CARD = "rounded-2xl bg-card border border-border-subtle";

export function SeriesScreen({ id, from }: { id: string; from: string | null }) {
  const vm = useSeriesPage(id);
  const d = vm.detail;
  const s = d?.series ?? null;
  const fromPath = pagePathFrom(from);
  const back = fromPath ?? (s?.tournamentId ? bracketHref(s.tournamentId) : d?.tournament ? bracketHref(d.tournament.id) : tournamentsHref());
  // Every link out of this page comes back here, with this page's own `from`.
  const selfPath = seriesHref(id, fromPath);
  const title = s?.roundName ?? "Series";

  const revealed = useReveal(vm.loading, () => (s ? [s.team1?.logoURL, s.team2?.logoURL] : []));

  if (!revealed || !d || !s) {
    return (
      <Page>
        <NavBar title={vm.loading || !vm.error ? title : "Series"} back={back} centered />
        {!vm.loading && vm.error ? (
          <div className="px-4 pt-4">
            <LoadFailure error={vm.notFound ? "This series couldn't be found." : vm.error} connectionProblem={vm.connectionProblem} onRetry={vm.reload} />
          </div>
        ) : (
          <SeriesSkeleton />
        )}
      </Page>
    );
  }

  return (
    <Page>
      <NavBar title={title} back={back} centered />
      <SeriesBody detail={d} keyRow={vm.keyRow} odds={vm.odds} selfPath={selfPath} />
    </Page>
  );
}

function SeriesBody({ detail, keyRow, odds, selfPath }: { detail: SeriesDetail; keyRow: ReturnType<typeof useSeriesPage>["keyRow"]; odds: ReturnType<typeof useSeriesPage>["odds"]; selfPath: string }) {
  const s = detail.series;
  const live = s.games.find((g) => g.status === "live") ?? null;
  const played = s.games.filter((g) => g.status === "completed" || g.status === "live");
  const upcoming = s.games.filter((g) => g.status === "upcoming" && g.matchId);
  const tbd = s.games.filter((g) => g.status === "tbd" || (g.status === "upcoming" && !g.matchId));
  const linkState = useLiveMatchLink({ matchId: live?.matchId ?? null });
  const showLive = !!live?.matchId && !!linkState.matchId && (!!linkState.match || linkState.ended);

  // Series colours from the key game's row, flipped when it seats the series' team2 first.
  const keyFlipped = !!keyRow && !!s.team2 && keyRow.team1Id === s.team2.id;
  const [c1, c2] = readableSides(
    keyRow ? (keyFlipped ? team2Color(keyRow) : team1Color(keyRow)) : "var(--team1)",
    keyRow ? (keyFlipped ? team1Color(keyRow) : team2Color(keyRow)) : "var(--team2)",
  );

  const empty = played.length === 0 && upcoming.length === 0 && tbd.length === 0;
  const withOdds = !!odds && odds.available && !odds.decided;

  return (
    <div className={clsx("px-4 pt-3 grid grid-cols-[minmax(0,1fr)] gap-6", withOdds ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:grid-rows-[auto_1fr] lg:gap-x-8 lg:items-start" : "max-w-[820px] mx-auto")}>
      {/* Score card + the live game */}
      <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
        <ScoreCard series={s} live={live} selfPath={selfPath} />
        {showLive ? (
          <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
            <LiveMatchLink state={linkState} from={selfPath} />
          </div>
        ) : null}
      </div>

      {/* Series odds (the rail on desktop) */}
      {withOdds ? (
        <section className="flex flex-col gap-2 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-4">
          <SeriesSectionTitle>Series Odds</SeriesSectionTitle>
          <SeriesOddsCard series={s} odds={odds} c1={c1} c2={c2} />
        </section>
      ) : null}

      <div className="flex flex-col gap-6 lg:col-start-1 lg:row-start-2">
        {played.length ? <GamesTable detail={detail} games={played} selfPath={selfPath} /> : null}
        {upcoming.length ? <UpcomingByDay detail={detail} games={upcoming} keyRow={keyRow} selfPath={selfPath} /> : null}
        {tbd.length ? <ScheduleTable series={s} games={tbd} /> : null}
        {empty ? (
          <p className="t-body-sm text-muted text-center py-8">{!s.team1 || !s.team2 ? "Waiting on the teams." : "Not scheduled yet."}</p>
        ) : null}
      </div>
    </div>
  );
}

// ── Score card ────────────────────────────────────────────────────────────
function ScoreCard({ series: s, live, selfPath }: { series: SeriesInfo; live: SeriesGame | null; selfPath: string }) {
  const decided = seriesDecided(s);
  const played = s.team1Wins + s.team2Wins;
  const state = decided
    ? { text: "FINAL", cls: "text-muted" }
    : live
      ? { text: `LIVE · GAME ${live.number}`, cls: "text-live" }
      : played > 0
        ? { text: `GAME ${played + 1} NEXT`, cls: "text-violet" }
        : { text: `BEST OF ${s.bestOf}`, cls: "text-muted" };
  const winner = decided ? (s.winnerId ? s.winnerId : s.team1Wins > s.team2Wins ? s.team1?.id : s.team2?.id) ?? null : null;
  return (
    <div className={clsx(CARD, "flex items-start px-3 py-5")}>
      <ScoreSide team={s.team1} lost={!!winner && !!s.team1 && winner !== s.team1.id} selfPath={selfPath} />
      <div className="flex flex-col items-center gap-2 pt-[22px] shrink-0 px-1">
        <span className="font-mono text-[34px] font-bold leading-none tabular-nums text-primary whitespace-nowrap">
          {s.team1Wins}<span className="text-muted mx-2">–</span>{s.team2Wins}
        </span>
        <span className={clsx("text-[11px] font-semibold tracking-[0.16em] whitespace-nowrap", state.cls)}>{state.text}</span>
      </div>
      <ScoreSide team={s.team2} lost={!!winner && !!s.team2 && winner !== s.team2.id} selfPath={selfPath} />
    </div>
  );
}

function ScoreSide({ team, lost, selfPath }: { team: SeriesTeam | null; lost: boolean; selfPath: string }) {
  if (!team) {
    return (
      <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
        <span className="size-11 rounded-[10px] border border-dashed border-border-strong grid place-items-center text-[10px] font-semibold tracking-[0.1em] text-muted">TBD</span>
        <span className="t-body-lg text-muted">TBD</span>
      </div>
    );
  }
  const href = `${teamHref(team.id, team.name)}?from=${encodeURIComponent(selfPath)}`;
  return (
    <Link href={href} className="flex-1 min-w-0 flex flex-col items-center gap-2 rounded-xl py-1 hover:bg-surface/40 transition-colors">
      <span className={clsx("flex transition-opacity", lost && "opacity-50")}><TeamMark name={team.name} logoURL={team.logoURL} size={44} /></span>
      <span className={clsx("t-body-lg text-center line-clamp-2 px-1", lost ? "text-muted" : "text-primary")}>{team.name}</span>
      {team.seed != null ? <span className="text-[11px] font-medium tracking-[0.16em] text-muted">SEED {team.seed}</span> : null}
    </Link>
  );
}

// ── GAMES ─────────────────────────────────────────────────────────────────
function GamesTable({ detail, games, selfPath }: { detail: SeriesDetail; games: SeriesGame[]; selfPath: string }) {
  const s = detail.series;
  const league = (detail.tournament?.game ?? "") === "League";
  const winnerOf = (g: SeriesGame): SeriesTeam | null => (g.winnerId ? [s.team1, s.team2].find((t) => t?.id === g.winnerId) ?? null : null);
  return (
    <section className="flex flex-col gap-2">
      <SeriesSectionTitle>Games</SeriesSectionTitle>
      <div className="ledger ledger-stripe">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-bg/40 t-label-md text-muted">
          <span className="w-11">GAME</span>
          <span className="flex-1">{league ? "RESULT" : "MAP"}</span>
          <span className="w-16 text-right">SCORE</span>
          <span className="w-[76px]" />
        </div>
        {games.map((g) => {
          const [a, b] = gameScoreFromSeries(s, g);
          const isLive = g.status === "live";
          const w = winnerOf(g);
          const middle = league ? (isLive ? "In progress" : w ? `${w.name} won` : "—") : g.mapName ?? "—";
          const row = (
            <>
              <span className="w-11 t-mono-sm text-primary">{g.number}</span>
              <span className={clsx("flex-1 min-w-0 truncate t-body-md", league && isLive ? "text-muted" : "text-primary")}>{middle}</span>
              <span className={clsx("w-16 text-right t-mono-sm", isLive ? "text-violet" : "text-primary")}>{a ?? 0}–{b ?? 0}</span>
              <span className="w-[76px] flex items-center justify-end gap-1.5 min-w-0">
                {isLive ? (
                  <span className="text-[11px] font-semibold tracking-[0.14em] text-live">LIVE</span>
                ) : w ? (
                  <>
                    <TeamMark name={w.name} logoURL={w.logoURL} size={18} />
                    <span className="text-[11px] font-semibold tracking-[0.14em] text-secondary">{teamLetters(w.name)}</span>
                  </>
                ) : (
                  <span className="text-[11px] font-semibold tracking-[0.14em] text-muted">FINAL</span>
                )}
                {g.matchId ? <ChevronRight size={14} className="text-muted shrink-0" /> : null}
              </span>
            </>
          );
          return g.matchId ? (
            <Link key={g.number} href={matchFromSeriesHref(g.matchId, selfPath)} className="flex items-center gap-3 px-4 py-3 min-h-12 hover:bg-surface/60 transition-colors" aria-label={`Game ${g.number}${w ? `, ${w.name} won` : isLive ? ", live" : ""}`}>
              {row}
            </Link>
          ) : (
            <div key={g.number} className="flex items-center gap-3 px-4 py-3 min-h-12">{row}</div>
          );
        })}
      </div>
    </section>
  );
}

// ── UPCOMING · TODAY ──────────────────────────────────────────────────────
function dayLabel(iso: string | null): string {
  if (!iso) return "LATER";
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  if (isSameDay(d, now)) return "TODAY";
  if (isSameDay(d, tomorrow)) return "TOMORROW";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

function UpcomingByDay({ detail, games, keyRow, selfPath }: { detail: SeriesDetail; games: SeriesGame[]; keyRow: ReturnType<typeof useSeriesPage>["keyRow"]; selfPath: string }) {
  const groups: { label: string; games: SeriesGame[] }[] = [];
  for (const g of [...games].sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "") || a.number - b.number)) {
    const label = dayLabel(g.scheduledAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.games.push(g); else groups.push({ label, games: [g] });
  }
  return (
    <>
      {groups.map((grp) => (
        <section key={grp.label} className="flex flex-col gap-2">
          <SeriesSectionTitle>Upcoming · {grp.label}</SeriesSectionTitle>
          <div className="flex flex-col gap-3">
            {grp.games.map((g) => {
              const m = seriesGameMatch(detail, g, keyRow);
              return m ? <UpcomingMatchCard key={g.number} match={m} previewHref={matchFromSeriesHref(m.id, selfPath)} /> : null;
            })}
          </div>
        </section>
      ))}
    </>
  );
}

// ── SCHEDULE (waiting on the teams) ───────────────────────────────────────
function scheduleTime(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  const now = new Date();
  const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 864e5);
  const day = days === 0 ? "Today" : days > 0 && days < 7 ? d.toLocaleDateString(undefined, { weekday: "short" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${day} · ${formatTime(iso)}`;
}

function ScheduleTable({ series: s, games }: { series: SeriesInfo; games: SeriesGame[] }) {
  const known = !!s.team1 && !!s.team2;
  return (
    <section className="flex flex-col gap-2">
      <SeriesSectionTitle>Schedule</SeriesSectionTitle>
      <div className="ledger ledger-stripe">
        <div className="flex items-center gap-3 px-4 py-2.5 bg-bg/40 t-label-md text-muted">
          <span className="w-11">GAME</span>
          <span className="flex-1">TIME</span>
        </div>
        {games.map((g) => (
          <div key={g.number} className="flex items-center gap-3 px-4 py-3 min-h-12">
            <span className="w-11 t-mono-sm text-primary">{g.number}</span>
            <span className="flex-1 min-w-0 truncate t-body-md text-primary">{scheduleTime(g.scheduledAt)}</span>
            {g.ifNecessary ? <span className="text-[11px] font-semibold tracking-[0.14em] text-muted shrink-0">IF NECESSARY</span> : null}
          </div>
        ))}
      </div>
      <p className="t-label-md text-muted px-1">{known ? "Projected times." : "Projected times. Each game gets its preview once both teams are known."}</p>
    </section>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────
function SeriesSkeleton() {
  return (
    <div className="px-4 pt-3 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-x-8">
      <div className="flex flex-col gap-6">
        <div className={clsx(CARD, "flex items-center justify-around px-4 py-6")}>
          <span className="flex flex-col items-center gap-2"><SkeletonBar width={44} height={44} /><SkeletonBar width={64} /></span>
          <SkeletonBar width={80} height={30} />
          <span className="flex flex-col items-center gap-2"><SkeletonBar width={44} height={44} /><SkeletonBar width={64} /></span>
        </div>
        <SkeletonLedger rows={3} avatar={0} />
        <SkeletonMatchCard />
      </div>
      <div className="hidden lg:block"><SkeletonLedger rows={5} avatar={18} /></div>
    </div>
  );
}
