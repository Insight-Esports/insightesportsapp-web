// tournaments/TournamentsScreen.tsx — the Schedule tab's Tournaments face
// (iOS Tournaments.swift + ScheduleView.swift) at /tournaments?game=.
//
//   TabHeader "Schedule" [calendar · avatar]
//   Upcoming · Tournaments · Results
//   GameTabBar (All · VALORANT · CS2 · LoL)
//   ON NOW          the active tournament per game (or the last one while
//                   the break runs), then each game on now: a caption over
//                   the live match link
//   PAST EDITIONS   completed editions, newest first within a game
//
// Per game: GET /tournaments/sim/current?game= + GET /tournaments/completed
// ?game=&sim=true. Quietly refreshed every 30 s while anything is live.
"use client";

import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { GamePill, GameTabBar, LiveBadge, LoadFailure, Page, SkeletonBar, TabHeader, TeamMark } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { useFetch, useInterval } from "@/lib/use-fetch";
import { clsx } from "@/lib/format";
import { gameLabel, type GameId } from "@/lib/types";
import { useGameParam } from "@/features/matches/shared";
import { CalendarTool, ScheduleSegmentPicker } from "@/features/matches/schedule-phone";
import { bracketHref, tournamentsHref } from "./routes";
import { fetchCompleted, fetchCurrent, findSeries, liveGames, roundPlural, seriesIsLive, type Bracket, type TournamentRow } from "./data";
import { LiveGameLink, TourLabel } from "./ui";

const GAME_ORDER = ["VALORANT", "CS2", "League"] as const;

interface GameTournaments { game: string; current: Bracket | null; past: TournamentRow[] }

async function loadGames(games: readonly string[], signal: AbortSignal): Promise<GameTournaments[]> {
  const settled = await Promise.allSettled(games.map(async (game) => {
    const [current, past] = await Promise.all([fetchCurrent(game, signal), fetchCompleted(game, signal).catch(() => [] as TournamentRow[])]);
    return { game, current, past };
  }));
  const ok = settled.filter((s): s is PromiseFulfilledResult<GameTournaments> => s.status === "fulfilled").map((s) => s.value);
  // Only fail the screen when every game failed (one game down still shows the rest).
  if (ok.length === 0 && settled.length > 0) throw (settled[0] as PromiseRejectedResult).reason;
  return ok;
}

export function TournamentsScreen() {
  const [game, setGame] = useGameParam();
  const games = game === "all" ? GAME_ORDER : ([game] as const);
  const feed = useFetch<GameTournaments[]>((signal) => loadGames(games, signal), [game], { cacheKey: `tournaments:list:${game}` });
  const data = feed.data ?? [];

  // ON NOW in game order; the past editions newest first within a game,
  // leaving out the one ON NOW already shows (the break).
  const onNow = GAME_ORDER.map((g) => data.find((d) => d.game === g)?.current ?? null).filter((b): b is Bracket => !!b);
  const shown = new Set(onNow.map((b) => b.tournament.id));
  const past = GAME_ORDER.flatMap((g) => {
    const rows = (data.find((d) => d.game === g)?.past ?? []).filter((t) => !shown.has(t.id));
    return rows.slice().sort((a, b) => (b.edition ?? 0) - (a.edition ?? 0) || ((b.endDate ?? b.startDate ?? "") > (a.endDate ?? a.startDate ?? "") ? 1 : -1));
  });
  const live = onNow.flatMap((b) => liveGames(b).map((x) => ({ ...x, tournament: b.tournament })));
  const anyLive = onNow.some((b) => b.tournament.status === "live");
  // The bracket's Back returns here with the same game filter.
  const listPath = tournamentsHref(game);
  useInterval(feed.reload, anyLive ? 30_000 : null);

  return (
    <Page>
      <TabHeader title="Schedule" tools={<HeaderTools extra={<CalendarTool game={game} from="tournaments" />} />} />
      <ScheduleSegmentPicker value="tournaments" game={game} />
      <GameTabBar selected={game} onChange={setGame} className="pt-2 pb-1" />

      <div className="px-4 pt-4">
        {feed.loading && !feed.data ? (
          <ListSkeleton />
        ) : feed.error && !feed.data ? (
          <LoadFailure error={feed.error} connectionProblem={feed.connectionProblem} onRetry={feed.reload} />
        ) : onNow.length === 0 && past.length === 0 ? (
          <EmptyTournaments game={game} />
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-2 lg:gap-x-6 items-start">
            {onNow.length > 0 ? (
              <section className="flex flex-col gap-2.5 min-w-0">
                <TourLabel>On now</TourLabel>
                <TournamentCard>
                  {onNow.map((b) => <CurrentRow key={b.tournament.id} bracket={b} from={listPath} />)}
                </TournamentCard>
                {live.map(({ series, game: g, tournament }) => (
                  <LiveGameLink
                    key={g.matchId}
                    className="pt-3"
                    matchId={g.matchId!}
                    caption={`${gameLabel(tournament.game)} · ${series.roundName} · Game ${g.number}`}
                  />
                ))}
              </section>
            ) : null}
            {past.length > 0 ? (
              <section className="flex flex-col gap-2.5 min-w-0">
                <TourLabel>Past editions</TourLabel>
                <TournamentCard>
                  {past.map((t) => <PastRow key={t.id} row={t} from={listPath} />)}
                </TournamentCard>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </Page>
  );
}

function TournamentCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden [&>*+*]:border-t [&>*+*]:border-border-subtle">{children}</div>;
}

/** The line under an ON NOW row: "Quarterfinals · Bo3 live", "Semifinals next", "Champion: Spirit". */
function currentLine(b: Bracket): { text: string; gold?: boolean } | null {
  const t = b.tournament;
  if (t.status === "completed") {
    if (t.champion) return { text: `Champion: ${t.champion.name}`, gold: true };
    return t.endDate ? { text: endDate(t.endDate) } : null;
  }
  const s = findSeries(b, b.currentSeriesId);
  if (!s) return null;
  return seriesIsLive(s) ? { text: `${roundPlural(s.roundName)} · Bo${s.bestOf} live` } : { text: `${roundPlural(s.roundName)} next` };
}

function endDate(isoTime: string): string {
  return new Date(isoTime).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function RowShell({ href, lead, name, live, line, gold }: { href: string; lead: React.ReactNode; name: string; live: boolean; line: string | null; gold?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 min-h-[68px] hover:bg-surface/50 transition-colors">
      <span className="w-10 shrink-0 grid place-items-center">{lead}</span>
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-[16px] font-medium leading-tight text-primary truncate">{name}</span>
          {live ? <LiveBadge className="shrink-0" /> : null}
        </span>
        {line ? <span className={clsx("t-body-sm truncate", gold ? "text-gold" : "text-secondary")}>{line}</span> : null}
      </span>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </Link>
  );
}

/** The bracket, with Back to the list as it was. */
const bracketFrom = (id: string, from: string) => `${bracketHref(id)}?from=${encodeURIComponent(from)}`;

function CurrentRow({ bracket: b, from }: { bracket: Bracket; from: string }) {
  const t = b.tournament;
  const line = currentLine(b);
  const lead = t.champion ? <TeamMark name={t.champion.name} logoURL={t.champion.logoURL} size={32} /> : <GamePill game={t.game} className="!text-[12px]" />;
  return <RowShell href={bracketFrom(t.id, from)} lead={lead} name={t.name} live={t.status === "live"} line={line?.text ?? null} gold={line?.gold} />;
}

function PastRow({ row, from }: { row: TournamentRow; from: string }) {
  const when = row.endDate ?? row.startDate;
  return <RowShell href={bracketFrom(row.id, from)} lead={<GamePill game={row.game} className="!text-[12px]" />} name={row.name} live={false} line={when ? endDate(when) : null} />;
}

function EmptyTournaments({ game }: { game: GameId }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center min-h-[50vh] px-10">
      <Trophy size={40} className="text-muted" />
      <span className="t-body-md text-secondary max-w-xs">
        {game === "all" ? "The first tournament hasn't been seeded yet." : `No ${gameLabel(game)} tournaments yet.`}
      </span>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-7 lg:grid-cols-2 lg:gap-x-6 items-start">
      {[3, 2].map((n, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <SkeletonBar width={84} height={10} className="ml-1" />
          <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden [&>*+*]:border-t [&>*+*]:border-border-subtle">
            {Array.from({ length: n }, (_, k) => (
              <div key={k} className="flex items-center gap-3 px-4 py-3.5 min-h-[68px]">
                <SkeletonBar width={30} height={12} />
                <div className="flex flex-col gap-2 flex-1"><SkeletonBar width="55%" height={13} /><SkeletonBar width="35%" height={10} /></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
