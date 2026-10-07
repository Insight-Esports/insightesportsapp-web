// features/matches/results.tsx — ResultsView.swift at /results?game=&team=.
// Completed matches newest first, grouped by the day they ENDED, paged with
// a keyset cursor (before + before_id from the oldest row we hold) so the
// list stays stable while new results land above us.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { History } from "lucide-react";
import { EmptyState, GameTabBar, LoadFailure, Page, SkeletonMatchCard, Spinner, TabHeader } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { ApiError, api, endpoints, errorMessage } from "@/lib/api";
import { matchResultTime, normalizeMatches, type Match } from "@/lib/types";
import { CompletedMatchRow } from "./cards";
import { CardGrid, DateSectionHeader, ScheduleTabs, gameQuery, groupByDay, parseDayKey, resultsDayLabel, sortResultsDesc, useGameParam } from "./shared";

const PAGE_SIZE = 20;
const STALE_MS = 30_000;

export function ResultsScreen() {
  const params = useSearchParams();
  const [game, setGame] = useGameParam();
  const team = params.get("team");
  const gameArg = game === "all" ? null : game;

  const [results, setResults] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetching = useRef(false);
  const lastLoadedAt = useRef(0);
  const resultsRef = useRef(results);
  resultsRef.current = results;

  // First page (and every game/team change) — the skeleton state.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    setConnectionProblem(false);
    setReachedEnd(false);
    setMoreError(null);
    setResults([]);
    fetching.current = true;
    api.get(endpoints.completedMatches(gameArg, PAGE_SIZE, 0, team), { signal: controller.signal })
      .then((raw) => {
        if (!active) return;
        const page = normalizeMatches(raw);
        setResults(page);
        setReachedEnd(page.length < PAGE_SIZE);
        lastLoadedAt.current = Date.now();
        setLoading(false);
      })
      .catch((e) => {
        if (!active || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(errorMessage(e));
        setConnectionProblem(e instanceof ApiError && e.isConnectionProblem);
        setLoading(false);
      })
      .finally(() => { fetching.current = false; });
    return () => { active = false; controller.abort(); };
  }, [gameArg, team, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // Keyset cursor from the OLDEST row we hold; one fetch at a time, deduped by id.
  const loadMore = useCallback(async () => {
    const current = resultsRef.current;
    if (fetching.current || current.length === 0) return;
    fetching.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const oldest = current.reduce((a, b) => (matchResultTime(b) < matchResultTime(a) ? b : a));
      const page = normalizeMatches(await api.get(endpoints.completedMatchesBefore(gameArg, PAGE_SIZE, matchResultTime(oldest), oldest.id, team)));
      if (page.length < PAGE_SIZE) setReachedEnd(true);
      setResults((prev) => {
        const existing = new Set(prev.map((m) => m.id));
        return [...prev, ...page.filter((m) => !existing.has(m.id))];
      });
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      fetching.current = false;
      setLoadingMore(false);
    }
  }, [gameArg, team]);

  // Freshness pass on return visits: swap in the first page quietly when the top changed.
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadedAt.current < STALE_MS || resultsRef.current.length === 0) return;
      try {
        const fresh = normalizeMatches(await api.get(endpoints.completedMatches(gameArg, PAGE_SIZE, 0, team)));
        if (fresh.length === 0) return;
        if (fresh[0].id !== resultsRef.current[0]?.id) { setResults(fresh); setReachedEnd(fresh.length < PAGE_SIZE); }
        lastLoadedAt.current = Date.now();
      } catch { /* keep what we have */ }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [gameArg, team]);

  // Auto-load when the sentinel scrolls into view (the app's bottom-row onAppear).
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || reachedEnd || loading) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void loadMore(); }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [reachedEnd, loading, loadMore, results.length]);

  const days = useMemo(() => {
    const grouped = groupByDay(results, matchResultTime);
    return [...grouped.entries()]
      .sort(([a], [b]) => (a > b ? -1 : a < b ? 1 : 0))
      .map(([key, ms]) => ({ key, day: parseDayKey(key)!, matches: ms.slice().sort(sortResultsDesc) }));
  }, [results]);

  return (
    <Page>
      <TabHeader title="Schedule" tools={<HeaderTools />} />
      <ScheduleTabs value="results" game={game} />
      <GameTabBar selected={game} onChange={setGame} className="pt-2 pb-1" />

      {team ? (
        <div className="flex items-center gap-2 px-4 pt-3 t-label-sm text-muted">
          <span>Showing one team&apos;s results</span>
          <span className="flex-1" />
          <Link href={`/results${gameQuery(game)}`} className="text-violet hover:text-violet-light">Show all</Link>
        </div>
      ) : null}

      <div className="pt-3">
        {loading ? (
          <div className="px-4"><CardGrid columns={3}>{[0, 1, 2, 3, 4].map((i) => <SkeletonMatchCard key={i} />)}</CardGrid></div>
        ) : error ? (
          <LoadFailure error={error} connectionProblem={connectionProblem} onRetry={reload} />
        ) : days.length === 0 ? (
          <EmptyState
            icon={<History />}
            title="No results yet"
            subtitle="Completed matches will show up here once games have been played."
            className="mt-6"
          />
        ) : (
          <div className="flex flex-col">
            {days.map(({ key, day, matches }) => (
              <section key={key} className="flex flex-col">
                <DateSectionHeader label={resultsDayLabel(day)} />
                <div className="px-4 pt-1 pb-3">
                  <CardGrid columns={3}>
                    {matches.map((m) => <CompletedMatchRow key={m.id} match={m} />)}
                  </CardGrid>
                </div>
              </section>
            ))}

            {!reachedEnd ? (
              <div ref={sentinel} className="flex flex-col items-center gap-2 py-4">
                {loadingMore ? (
                  <Spinner />
                ) : moreError ? (
                  <>
                    <span className="t-body-sm text-muted">{moreError}</span>
                    <button type="button" onClick={() => void loadMore()} className="btn-ghost !py-2">Try Again</button>
                  </>
                ) : (
                  <button type="button" onClick={() => void loadMore()} className="btn-ghost !py-2">Load more</button>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Page>
  );
}
