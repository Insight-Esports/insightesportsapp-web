// features/matches/home.tsx — HomeView.swift: the Live tab.
// Game tabs (with live dots from the UNFILTERED live feed) → Live Now →
// Upcoming. A 20s silent auto-refresh keeps live matches appearing and
// disappearing on their own; explicit loads show skeletons, silent ones
// never touch what's on screen.
"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Trophy } from "lucide-react";
import { ConnectionErrorView, EmptyState, GameTabBar, LoadFailure, Page, SectionHeader, SkeletonMatchCard, TabHeader } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { api, endpoints } from "@/lib/api";
import { useFetch, useInterval } from "@/lib/use-fetch";
import { normalizeMatches, type Match } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { LiveMatchCard, UpcomingMatchCard } from "./cards";
import { CardGrid, filterByGame, gameQuery, sortUpcomingAsc, useGameParam } from "./shared";

const AUTO_REFRESH_MS = 20_000;

export function HomeScreen() {
  const router = useRouter();
  const { setPendingScheduleGame } = useAppState();
  const [game, setGame] = useGameParam();

  // Both feeds are fetched unfiltered (the app filters client-side too) so
  // the live dots on the tab bar always reflect every game.
  const live = useFetch<Match[]>(async (signal) => normalizeMatches(await api.get(endpoints.liveMatches, { signal })), []);
  const upcoming = useFetch<Match[]>(async (signal) => normalizeMatches(await api.get(endpoints.upcomingMatches, { signal })), []);

  // Silent refresh: keep whatever's on screen on a transient failure.
  const { setData: setLive } = live;
  const { setData: setUpcoming } = upcoming;
  const refreshing = useRef(false);
  const silentRefresh = useCallback(async (both: boolean) => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const tasks: Promise<void>[] = [
        api.get(endpoints.liveMatches).then((raw) => setLive(normalizeMatches(raw))).catch(() => {}),
      ];
      if (both) tasks.push(api.get(endpoints.upcomingMatches).then((raw) => setUpcoming(normalizeMatches(raw))).catch(() => {}));
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
  const liveMatches = filterByGame(liveAll, game);
  const upcomingMatches = filterByGame(upcoming.data ?? [], game).slice().sort(sortUpcomingAsc);

  const reload = () => { live.reload(); upcoming.reload(); };
  const viewSchedule = () => {
    // Carry the game filter across: "no live CS2" → Schedule opens already on CS2.
    setPendingScheduleGame(game === "all" ? null : game);
    router.push(`/schedule${gameQuery(game)}`);
  };

  const connectionFailed = !live.loading && live.connectionProblem && liveAll.length === 0 && (upcoming.data?.length ?? 0) === 0;

  return (
    <Page>
      <TabHeader title="Insight" tools={<HeaderTools />} />
      <div className="flex flex-col gap-5 pt-2">
        <GameTabBar selected={game} onChange={setGame} liveGames={liveGames} />

        {connectionFailed ? (
          <ConnectionErrorView onRetry={reload} className="min-h-[420px]" />
        ) : (
          <div className="grid gap-6 px-4 lg:grid-cols-2 lg:gap-6 items-start">
            {/* ── Live Now ── */}
            <section className="flex flex-col gap-3 min-w-0">
              <SectionHeader title="Live Now" className="!px-0" />
              {live.loading ? (
                <CardGrid>{[0, 1].map((i) => <SkeletonMatchCard key={i} />)}</CardGrid>
              ) : live.error ? (
                <LoadFailure error={live.error} connectionProblem={live.connectionProblem} onRetry={live.reload} />
              ) : liveMatches.length === 0 ? (
                <EmptyState
                  icon={<Trophy />}
                  title="No live matches right now"
                  subtitle="Check back soon or view the schedule"
                  actionTitle="View Schedule"
                  onAction={viewSchedule}
                  className="!mx-0"
                />
              ) : (
                <CardGrid>
                  {liveMatches.map((m) => <LiveMatchCard key={m.id} match={m} />)}
                </CardGrid>
              )}
            </section>

            {/* ── Upcoming ── */}
            <section className="flex flex-col gap-3 min-w-0">
              <SectionHeader title="Upcoming" className="!px-0" />
              {upcoming.loading ? (
                <CardGrid>{[0, 1, 2].map((i) => <SkeletonMatchCard key={i} />)}</CardGrid>
              ) : upcoming.error ? (
                <LoadFailure error={upcoming.error} connectionProblem={upcoming.connectionProblem} onRetry={upcoming.reload} />
              ) : upcomingMatches.length === 0 ? (
                <EmptyState
                  icon={<Calendar />}
                  title="No upcoming matches"
                  subtitle="Check back later for scheduled matches"
                  actionTitle="View Schedule"
                  onAction={viewSchedule}
                  className="!mx-0"
                />
              ) : (
                <CardGrid>
                  {upcomingMatches.map((m) => <UpcomingMatchCard key={m.id} match={m} />)}
                </CardGrid>
              )}
            </section>
          </div>
        )}
      </div>
    </Page>
  );
}
