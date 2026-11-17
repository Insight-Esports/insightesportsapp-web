// features/matches/home.tsx — HomeView.swift: the Live tab.
// Game tabs (with live dots from the UNFILTERED live feed) → Live Now
// (tournament / series matches first) → Upcoming. A 20s silent auto-refresh keeps live matches appearing and
// disappearing on their own; explicit loads show skeletons, silent ones
// never touch what's on screen.
//
// Nov 12 §7: a load that fails keeps the rows already here. Both feeds are
// held unfiltered and shown through the game filter, so a game switch only
// ever shows that game's rows; the error view shows only when the selected
// game has nothing to show.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Trophy } from "lucide-react";
import { ConnectionErrorView, EmptyState, GameTabBar, LoadFailure, Page, SectionHeader, SkeletonMatchCard, TabHeader } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { api, endpoints } from "@/lib/api";
import { useFetch, useInterval } from "@/lib/use-fetch";
import { useReveal } from "@/lib/use-reveal";
import { normalizeMatches, type Match } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { LiveMatchCard, UpcomingMatchCard } from "./cards";
import { filterByGame, gameQuery, sortUpcomingAsc, useGameParam } from "./shared";

const AUTO_REFRESH_MS = 20_000;

/** A live match that belongs to a real tournament or series (not blank / "Unknown"). */
function inTournament(m: Match): boolean {
  if (m.series) return true;
  const name = (m.tournamentName ?? "").trim().toLowerCase();
  return name !== "" && name !== "unknown" && name !== "unknown tournament" && name !== "null";
}
/** Live Now: tournament / series matches first; everything else keeps its order after them. */
function tournamentFirst(list: Match[]): Match[] {
  return [...list.filter(inTournament), ...list.filter((m) => !inTournament(m))];
}

export function HomeScreen() {
  const router = useRouter();
  const { setPendingScheduleGame } = useAppState();
  const [game, setGame] = useGameParam();

  // Both feeds are fetched unfiltered (the app filters client-side too) so
  // the live dots on the tab bar always reflect every game.
  const live = useFetch<Match[]>(async (signal) => normalizeMatches(await api.get(endpoints.liveMatches, { signal })), [], { cacheKey: "home:live" });
  const upcoming = useFetch<Match[]>(async (signal) => normalizeMatches(await api.get(endpoints.upcomingMatches, { signal })), [], { cacheKey: "home:upcoming" });

  // Silent refresh: keep whatever's on screen on a transient failure. One that
  // succeeds after a failed load clears that load's error (the list is fresh,
  // even if empty) until the next explicit load.
  const { setData: setLive } = live;
  const { setData: setUpcoming } = upcoming;
  const [recovered, setRecovered] = useState({ live: false, upcoming: false });
  const refreshing = useRef(false);
  const silentRefresh = useCallback(async (both: boolean) => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const tasks: Promise<void>[] = [
        api.get(endpoints.liveMatches).then((raw) => { setLive(normalizeMatches(raw)); setRecovered((r) => (r.live ? r : { ...r, live: true })); }).catch(() => {}),
      ];
      if (both) tasks.push(api.get(endpoints.upcomingMatches).then((raw) => { setUpcoming(normalizeMatches(raw)); setRecovered((r) => (r.upcoming ? r : { ...r, upcoming: true })); }).catch(() => {}));
      await Promise.all(tasks);
    } finally {
      refreshing.current = false;
    }
  }, [setLive, setUpcoming]);

  useInterval(() => { void silentRefresh(false); }, AUTO_REFRESH_MS);
  // Foreground return → refresh live + upcoming.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") void silentRefresh(true); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [silentRefresh]);

  const liveAll = live.data ?? [];
  const liveGames = new Set(liveAll.map((m) => m.game));
  const liveMatches = tournamentFirst(filterByGame(liveAll, game));
  const upcomingMatches = filterByGame(upcoming.data ?? [], game).slice().sort(sortUpcomingAsc);

  // HomeView keeps both sections on skeletons until `hasLoaded` — the whole
  // first screen appears at once, after the first page of crests is warm.
  const revealed = useReveal(live.loading || upcoming.loading, () =>
    [...liveAll, ...(upcoming.data ?? [])].flatMap((m) => [m.team1LogoURL, m.team2LogoURL]));
  const showSkeleton = !revealed;

  const reloadLive = () => { setRecovered((r) => ({ ...r, live: false })); live.reload(); };
  const reloadUpcoming = () => { setRecovered((r) => ({ ...r, upcoming: false })); upcoming.reload(); };
  const reload = () => { reloadLive(); reloadUpcoming(); };
  const liveError = recovered.live ? null : live.error;
  const upcomingError = recovered.upcoming ? null : upcoming.error;
  const viewSchedule = () => {
    // Carry the game filter across: "no live CS2" → Schedule opens already on CS2.
    setPendingScheduleGame(game === "all" ? null : game);
    router.push(`/schedule${gameQuery(game)}`);
  };

  // HomeView: the connection screen only when the selected game has nothing to show in either list.
  const connectionFailed = !live.loading && !!liveError && live.connectionProblem && liveMatches.length === 0 && upcomingMatches.length === 0;

  return (
    <Page>
      <TabHeader title="Live" brand tools={<HeaderTools home />} />
      <div className="flex flex-col gap-5 pt-2">
        <GameTabBar selected={game} onChange={setGame} liveGames={liveGames} />

        {connectionFailed ? (
          <ConnectionErrorView onRetry={reload} className="min-h-[420px]" />
        ) : (
          // One left-dominant flow: live cards fill rows left → right (5 live
          // = 3 left, 2 right), the Upcoming header sits under the last live
          // row, and upcoming cards continue the same way. Rows stretch so
          // every card in a row is the same height.
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 lg:grid-cols-2 lg:gap-x-6 items-stretch">
            {/* ── Live Now ── */}
            <SectionHeader title="Live Now" className="!px-0 lg:col-span-2 mb-1" />
            {showSkeleton ? (
              [0, 1].map((i) => <SkeletonMatchCard key={`ls${i}`} />)
            ) : liveMatches.length > 0 ? (
              liveMatches.map((m) => <LiveMatchCard key={m.id} match={m} className="h-full" />)
            ) : liveError ? (
              <div className="lg:col-span-2"><LoadFailure error={liveError} connectionProblem={live.connectionProblem} onRetry={reloadLive} /></div>
            ) : (
              <div className="lg:col-span-2">
                <EmptyState
                  icon={<Trophy />}
                  title="No live matches right now"
                  subtitle="Check back soon or view the schedule"
                  actionTitle="View Schedule"
                  onAction={viewSchedule}
                  className="!mx-0"
                />
              </div>
            )}

            {/* ── Upcoming ── */}
            <SectionHeader title="Upcoming" className="!px-0 lg:col-span-2 mt-3 mb-1" />
            {showSkeleton ? (
              [0, 1, 2].map((i) => <SkeletonMatchCard key={`us${i}`} />)
            ) : upcomingMatches.length > 0 ? (
              upcomingMatches.map((m) => <UpcomingMatchCard key={m.id} match={m} className="h-full" />)
            ) : upcomingError ? (
              <div className="lg:col-span-2"><LoadFailure error={upcomingError} connectionProblem={upcoming.connectionProblem} onRetry={reloadUpcoming} /></div>
            ) : (
              <div className="lg:col-span-2">
                <EmptyState
                  icon={<Calendar />}
                  title="No upcoming matches"
                  subtitle="Check back later for scheduled matches"
                  actionTitle="View Schedule"
                  onAction={viewSchedule}
                  className="!mx-0"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Page>
  );
}
