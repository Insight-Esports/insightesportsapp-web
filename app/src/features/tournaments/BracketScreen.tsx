// tournaments/BracketScreen.tsx — a tournament's bracket (iOS
// Tournaments.swift, parity 2026-10-29 §1) at /tournaments/[id].
//
//   header        game tag · name · LIVE; "8 teams · Bo3 · Bo3 · Bo5" (· Completed)
//   game on now   "QUARTERFINAL · GAME 2" over the live match link
//   the tree      BracketTree (two halves meeting at the final)
//   champion      crest · CHAMPION · name · trophy (→ team page)
//   TITLE ODDS    reach per round after the first + title (hidden once completed)
//   round by round  each round's series as rows (→ the series)
//
// GET /tournaments/:id/bracket, refreshed every 30 s until completed.
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, ChevronRight, Trophy } from "lucide-react";
import { GamePill, LiveBadge, LoadFailure, Page, SkeletonBar, TeamMark } from "@/components/ui";
import { NavBar } from "@/components/shell/NavBar";
import { useIsPhone } from "@/components/shell/use-phone";
import { useFetch, useInterval } from "@/lib/use-fetch";
import { clsx } from "@/lib/format";
import { pagePathFrom } from "@/features/matches/from-match";
import { pctText } from "./format";
import { bracketHref, seriesHref, tournamentsHref } from "./routes";
import { fetchBracket, formatLine, liveGames, nextStartOf, roundPlural, roundShort, seriesDecided, seriesIsLive, startLabel, type Bracket, type BracketSeries, type BracketTeam, type TitleOddsRow } from "./data";
import { BracketTree } from "./BracketTree";
import { LiveGameLink, TbdCrest, TourLabel } from "./ui";

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
      <NavBar title={b?.tournament.name ?? ""} back={back} centered />
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
  return (
    <div className="flex flex-col gap-7 px-4 pt-5">
      {/* 1. Header */}
      <header className="flex flex-col gap-1.5 px-1">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <GamePill game={t.game} className="!text-[13px] shrink-0 -translate-y-[3px]" />
          {/* The LIVE badge flows after the name, so a long name wraps with it rather than orphaning it. */}
          <h1 className="min-w-0 text-[22px] min-[400px]:text-[24px] md:text-[26px] font-bold tracking-[-0.4px] text-primary leading-tight">
            {t.name}
            {t.status === "live" ? <LiveBadge className="!text-[14px] !font-medium tracking-normal ml-2.5 align-[3px] whitespace-nowrap" /> : null}
          </h1>
        </div>
        <span className="t-body-md text-secondary">{formatLine(b)}</span>
      </header>

      {/* 2. The game on now */}
      {live.length > 0 ? (
        <div className="flex flex-col gap-4 md:max-w-[560px]">
          {live.map(({ series, game }) => (
            <LiveGameLink key={game.matchId} matchId={game.matchId!} caption={`${series.roundName} · Game ${game.number}`} />
          ))}
        </div>
      ) : null}

      {/* 3. The tree */}
      <BracketTree bracket={b} wide={wide} />

      {/* 4. Champion */}
      {t.champion ? (
        <Link href={teamHref(t.champion.id)} className="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl border border-gold/60 bg-card hover:bg-surface/60 transition-colors md:max-w-[560px]">
          <TeamMark name={t.champion.name} logoURL={t.champion.logoURL} size={40} />
          <span className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-[11px] font-bold tracking-[0.14em] text-gold">CHAMPION</span>
            <span className="t-headline-sm text-primary truncate">{t.champion.name}</span>
          </span>
          <Trophy size={22} className="text-gold shrink-0" />
        </Link>
      ) : null}

      <div className={clsx("grid grid-cols-[minmax(0,1fr)] gap-7", odds && "lg:grid-cols-2 lg:gap-x-6 lg:items-start")}>
        {/* 5. TITLE ODDS */}
        {odds ? <TitleOdds b={b} rows={odds} /> : null}
        {/* 6. Round by round */}
        <div className="flex flex-col gap-6 min-w-0">
          {b.rounds.map((r) => (
            <section key={r.round} className="flex flex-col gap-2.5">
              <TourLabel trailing={`Best of ${r.bestOf}`}>{roundPlural(r.name)}</TourLabel>
              <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden [&>*+*]:border-t [&>*+*]:border-border-subtle">
                {r.series.map((s) => <RoundRow key={s.id} s={s} current={s.id === b.currentSeriesId} from={bracketHref(t.id)} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── TITLE ODDS ──────────────────────────────────────────────────────────────
/** ✓ once reached, "—" at 0, "<1%" under 0.5, else whole percents. */
function OddsCell({ v, check, className }: { v: number; check: boolean; className?: string }) {
  if (check && v >= 99.95) return <span className={clsx("inline-flex justify-end", className)}><Check size={15} strokeWidth={2.75} className="text-violet" /></span>;
  if (v <= 0) return <span className={clsx("text-muted", className)}>—</span>;
  return <span className={className}>{pctText(v)}</span>;
}

function TitleOdds({ b, rows }: { b: Bracket; rows: TitleOddsRow[] }) {
  const R = b.rounds.length;
  const later = b.rounds.filter((r) => r.round > 1);
  return (
    <section className="flex flex-col gap-2.5 min-w-0">
      <TourLabel>Title odds</TourLabel>
      <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden [&>*:nth-child(odd):not(:first-child)]:bg-surface/50">
        <div className="flex items-center gap-1 px-4 py-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          <span className="flex-1">Team</span>
          {later.map((r) => <span key={r.round} className="w-[52px] text-right">{roundShort(r.name, r.round, R)}</span>)}
          <span className="w-[52px] text-right">Title</span>
        </div>
        {rows.map((row) => (
          <Link key={row.team.id} href={teamHref(row.team.id)} className={clsx("flex items-center gap-1 px-4 py-2.5 min-h-[48px] hover:bg-surface transition-colors", row.eliminated && "opacity-40")}>
            <span className="flex-1 min-w-0 flex items-center gap-2.5">
              <TeamMark name={row.team.name} logoURL={row.team.logoURL} size={26} />
              <span className="t-body-md text-primary truncate">{row.team.name}</span>
            </span>
            {later.map((r) => {
              const v = row.rounds.find((x) => x.round === r.round)?.reach ?? 0;
              return <OddsCell key={r.round} v={v} check className="w-[52px] text-right t-body-md tabular-nums text-secondary" />;
            })}
            <OddsCell v={row.eliminated ? 0 : row.champion} check={false} className="w-[52px] text-right t-body-md tabular-nums font-semibold text-primary" />
          </Link>
        ))}
      </div>
      <p className="px-1 t-label-sm text-muted leading-relaxed">Chance to reach each round and to win the title. For entertainment purposes only. This is not financial advice.</p>
    </section>
  );
}

// ── Round by round ──────────────────────────────────────────────────────────
function RoundRow({ s, current, from }: { s: BracketSeries; current: boolean; from: string }) {
  const live = seriesIsLive(s);
  const decided = seriesDecided(s);
  const state = live
    ? <span className="text-[11px] font-bold tracking-[0.1em] text-live">LIVE</span>
    : decided ? <span className="text-[11px] font-semibold tracking-[0.1em] text-muted">FINAL</span>
    : current ? <span className="text-[11px] font-bold tracking-[0.1em] text-violet">NEXT</span>
    : <span className="t-label-md text-secondary tabular-nums">{startLabel(nextStartOf(s)) ?? ""}</span>;
  return (
    <Link href={seriesHref(s.id, from)} className="relative flex items-center gap-3 pl-4 pr-3.5 py-2.5 hover:bg-surface/50 transition-colors">
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
