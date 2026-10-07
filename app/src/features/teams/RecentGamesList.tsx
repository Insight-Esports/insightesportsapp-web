// RecentGamesList — RecentGamesList.swift (team half).
//
// GET /matches/completed?team=<id>&limit=10 → match rows read from the
// team's side (opponent, our score first, W / L). Keyset-paged: `before` =
// the oldest loaded row's completed_at, `before_id` = its id. The rows are
// handed back through `onRows` so the page derives its record and streak
// from exactly the games it lists.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { clsx, formatDate } from "@/lib/format";
import { matchResultTime, normalizeMatches, type Match } from "@/lib/types";
import { EmptyState, SectionHeader, SkeletonLedger, Spinner, TeamMark } from "@/components/ui";
import { StripedTable } from "@/features/players/StatTable";
import { useLoadMore } from "@/features/players/useLoadMore";

const PAGE_SIZE = 10;

/** Whose side a row is read from: by id when the row carries team ids, by name otherwise. */
export interface RecentGamesPerspective { teamId: string | null; teamName: string | null }
export function isTeam1(p: RecentGamesPerspective, m: Match): boolean | null {
  if (p.teamId && m.team1Id === p.teamId) return true;
  if (p.teamId && m.team2Id === p.teamId) return false;
  if (p.teamName && m.team1Name === p.teamName) return true;
  if (p.teamName && m.team2Name === p.teamName) return false;
  return null;
}

export function useTeamRecentGames(teamId: string, game: string | null) {
  const [rows, setRows] = useState<Match[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setLoaded(false); setRows([]); setReachedEnd(false);
    inFlight.current = true;
    api.get(endpoints.completedMatches(game, PAGE_SIZE, 0, teamId))
      .then((raw) => {
        if (!active) return;
        const page = normalizeMatches(raw).sort((a, b) => matchResultTime(b).localeCompare(matchResultTime(a)));
        setRows(page);
        setReachedEnd(page.length < PAGE_SIZE);
      })
      .catch(() => { if (active) { setRows([]); setReachedEnd(true); } })
      .finally(() => { if (active) { setLoaded(true); inFlight.current = false; } });
    return () => { active = false; };
  }, [teamId, game]);

  const loadMore = useCallback(() => {
    if (!loaded || reachedEnd || inFlight.current) return;
    const oldest = rows[rows.length - 1];
    if (!oldest) return;
    inFlight.current = true;
    setLoadingMore(true);
    api.get(endpoints.completedMatchesBefore(game, PAGE_SIZE, matchResultTime(oldest), oldest.id, teamId))
      .then((raw) => {
        const page = normalizeMatches(raw);
        setRows((prev) => { const known = new Set(prev.map((r) => r.id)); return prev.concat(page.filter((r) => !known.has(r.id))); });
        setReachedEnd(page.length < PAGE_SIZE);
      })
      .catch(() => setReachedEnd(true))
      .finally(() => { inFlight.current = false; setLoadingMore(false); });
  }, [loaded, reachedEnd, rows, teamId, game]);

  return { rows, loaded, loadingMore, reachedEnd, loadMore };
}

export function TeamRecentGamesList({ teamId, game, perspective, title = "Recent Games", onRows }: { teamId: string; game: string | null; perspective: RecentGamesPerspective; title?: string; onRows?: (rows: Match[]) => void }) {
  const pager = useTeamRecentGames(teamId, game);
  const sentinel = useLoadMore(pager.loadMore, pager.loaded && !pager.reachedEnd && !pager.loadingMore);
  const onRowsRef = useRef(onRows);
  onRowsRef.current = onRows;
  useEffect(() => { if (pager.loaded) onRowsRef.current?.(pager.rows); }, [pager.loaded, pager.rows]);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title={title} />
      {!pager.loaded ? (
        <SkeletonLedger rows={6} avatar={20} className="mx-4" />
      ) : pager.rows.length === 0 ? (
        <EmptyState icon={<History />} title="No recent games" subtitle="Results will appear here" />
      ) : (
        <div className="px-4">
          <StripedTable
            header={
              <>
                <span className="w-[52px] shrink-0">Date</span>
                <span className="flex-1">Opponent</span>
                <span className="w-[52px] shrink-0 text-center">Score</span>
                <span className="w-[34px] shrink-0 text-right">W/L</span>
              </>
            }
          >
            {pager.rows.map((m) => <RecentGameRow key={m.id} match={m} perspective={perspective} />)}
            {pager.loadingMore ? <div className="flex items-center justify-center gap-2 py-3"><Spinner size={14} /><span className="t-label-sm text-muted">Loading…</span></div> : null}
          </StripedTable>
          <div ref={sentinel} className="h-px" />
        </div>
      )}
    </section>
  );
}

function RecentGameRow({ match: m, perspective }: { match: Match; perspective: RecentGamesPerspective }) {
  const side = isTeam1(perspective, m);
  const opponent = side === true ? m.team2Name : side === false ? m.team1Name : `${m.team1Name} vs ${m.team2Name}`;
  const opponentLogo = side === true ? m.team2LogoURL : side === false ? m.team1LogoURL : null;
  const ours = side === false ? m.team2Score : m.team1Score;
  const theirs = side === false ? m.team1Score : m.team2Score;
  return (
    <Link href={`/match/${encodeURIComponent(m.id)}`} className="flex items-center gap-1 px-3 py-2.5 hover:bg-surface/70 transition-colors">
      <span className="w-[52px] shrink-0 t-label-sm text-muted">{formatDate(matchResultTime(m))}</span>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        {side !== null ? <TeamMark name={opponent} logoURL={opponentLogo} size={20} /> : null}
        <span className="t-body-sm text-primary truncate">{opponent}</span>
      </span>
      <span className="w-[52px] shrink-0 text-center t-mono-sm text-primary">{ours}–{theirs}</span>
      <span className={clsx("w-[34px] shrink-0 text-right t-label-md", side === null ? "text-muted" : ours > theirs ? "text-success" : "text-error")}>
        {side === null ? "—" : ours > theirs ? "W" : "L"}
      </span>
    </Link>
  );
}
