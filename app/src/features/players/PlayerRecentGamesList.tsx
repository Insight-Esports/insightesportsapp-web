// PlayerRecentGamesList — RecentGamesList.swift (player half).
//
// The player's own line per match from GET /players/:id/matches: opponent,
// map/side, K/D/A, ACS · RTG · KDA. Keyset-paged: `before` = the oldest
// loaded row's completed_at, `before_id` = its match_id. 10 rows first;
// more as the last row scrolls into view. Rows with a match id open the
// match.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { clsx, fmt1, fmt2, formatDate } from "@/lib/format";
import { EmptyState, Img, SectionHeader, SkeletonLedger, Spinner } from "@/components/ui";
import { normalizePlayerGameRows, rowKDA, rowWhen, type PlayerGameRow } from "./types";
import { useLoadMore } from "./useLoadMore";
import { StripedTable } from "./StatTable";

const PAGE_SIZE = 10;

export function usePlayerGames(playerId: string) {
  const [rows, setRows] = useState<PlayerGameRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setRows([]);
    setReachedEnd(false);
    inFlight.current = true;
    api.get(endpoints.playerMatches(playerId, PAGE_SIZE))
      .then((raw) => {
        if (!active) return;
        const page = normalizePlayerGameRows(raw).sort((a, b) => rowWhen(b).localeCompare(rowWhen(a)));
        setRows(page);
        setReachedEnd(page.length < PAGE_SIZE);
      })
      .catch(() => { if (active) { setRows([]); setReachedEnd(true); } })
      .finally(() => { if (active) { setLoaded(true); inFlight.current = false; } });
    return () => { active = false; };
  }, [playerId]);

  const loadMore = useCallback(() => {
    if (!loaded || reachedEnd || inFlight.current) return;
    const oldest = rows[rows.length - 1];
    if (!oldest?.matchId) return;
    inFlight.current = true;
    setLoadingMore(true);
    api.get(endpoints.playerMatchesBefore(playerId, PAGE_SIZE, rowWhen(oldest), oldest.matchId))
      .then((raw) => {
        const page = normalizePlayerGameRows(raw);
        setRows((prev) => {
          const known = new Set(prev.map((r) => r.id));
          return prev.concat(page.filter((r) => !known.has(r.id)));
        });
        setReachedEnd(page.length < PAGE_SIZE);
      })
      .catch(() => setReachedEnd(true))
      .finally(() => { inFlight.current = false; setLoadingMore(false); });
  }, [loaded, reachedEnd, rows, playerId]);

  return { rows, loaded, loadingMore, reachedEnd, loadMore };
}

export function PlayerRecentGamesList({ playerId, game, onRows }: { playerId: string; game: string; onRows?: (rows: PlayerGameRow[]) => void }) {
  const pager = usePlayerGames(playerId);
  const sentinel = useLoadMore(pager.loadMore, pager.loaded && !pager.reachedEnd && !pager.loadingMore);
  const onRowsRef = useRef(onRows);
  onRowsRef.current = onRows;
  useEffect(() => { if (pager.loaded) onRowsRef.current?.(pager.rows); }, [pager.loaded, pager.rows]);

  const statLabel = game === "League" ? "KDA" : game === "CS2" ? "RTG" : "ACS";

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Recent Games" />
      {!pager.loaded ? (
        <SkeletonLedger rows={6} avatar={20} className="mx-4" />
      ) : pager.rows.length === 0 ? (
        <EmptyState icon={<History />} title="No recent games" subtitle="Match history will appear here" />
      ) : (
        <div className="px-4">
          <StripedTable
            header={
              <>
                <span className="w-12 shrink-0">Date</span>
                <span className="flex-1 pl-2">Opponent</span>
                <span className="w-[50px] shrink-0">{game === "League" ? "Side" : "Map"}</span>
                <span className="w-[65px] shrink-0 text-center">K/D/A</span>
                <span className="w-[45px] shrink-0 text-right">{statLabel}</span>
              </>
            }
          >
            {pager.rows.map((row) => <RecentMatchRow key={row.id} row={row} game={game} />)}
            {pager.loadingMore ? (
              <div className="flex items-center justify-center gap-2 py-3"><Spinner size={14} /><span className="t-label-sm text-muted">Loading…</span></div>
            ) : null}
          </StripedTable>
          <div ref={sentinel} className="h-px" />
        </div>
      )}
    </section>
  );
}

function mainStat(row: PlayerGameRow, game: string): string {
  switch (game) {
    case "League": return fmt1(rowKDA(row));
    case "CS2": return row.rating != null ? fmt2(row.rating) : "—";
    default: return row.acs != null ? String(Math.round(row.acs)) : "—";
  }
}

function RecentMatchRow({ row, game }: { row: PlayerGameRow; game: string }) {
  const isLeague = game === "League";
  const inner = (
    <>
      <span className="w-12 shrink-0 t-label-sm text-muted">{formatDate(rowWhen(row))}</span>
      <span className="flex-1 min-w-0 flex items-center gap-1.5 pl-2">
        {row.opponentLogoURL ? <Img src={row.opponentLogoURL} alt="" fallback={null} className="size-5 rounded" /> : null}
        <span className="t-body-sm text-primary truncate">{row.opponentName ?? "—"}</span>
      </span>
      <span className={clsx("w-[50px] shrink-0 t-label-sm truncate", isLeague ? (row.side === "Red" ? "text-error" : "text-team1") : "text-muted")}>
        {isLeague ? (row.side ?? "Blue") : (row.mapName ?? "—")}
      </span>
      <span className="w-[65px] shrink-0 text-center t-mono-sm text-primary">{row.kills}/{row.deaths}/{row.assists}</span>
      <span className="w-[45px] shrink-0 text-right t-mono-sm text-violet">{mainStat(row, game)}</span>
    </>
  );
  const cls = "flex items-center gap-1 px-3 py-2.5";
  if (row.matchId) {
    return <Link href={`/match/${encodeURIComponent(row.matchId)}`} className={clsx(cls, "hover:bg-surface/70 transition-colors")}>{inner}</Link>;
  }
  return <div className={cls}>{inner}</div>;
}
