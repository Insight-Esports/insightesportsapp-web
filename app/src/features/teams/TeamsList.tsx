// TeamsList — TeamsView.swift.
//
// Ranked list of pro teams per game. Game tabs: VALORANT, CS2, League.
// Filter sheet: Tier (server-side), Region and Sort (client-side over the
// loaded pages). Filters live in the URL (?game=&tier=&region=&sort=&q=).
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, Users, X } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { normalizeTeams, SELECTABLE_GAMES, teamRecord, type GameId, type Team } from "@/lib/types";
import { clsx, fmt2 } from "@/lib/format";
import { EmptyState, GameTabBar, Ledger, LedgerHeader, LoadFailure, Page, SearchField, SkeletonLedger, Spinner, TabHeader, TeamMark, TierBadge, ToolButton } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { usePagedList } from "@/features/players/usePagedList";
import { useDebounced, useLoadMore } from "@/features/players/useLoadMore";
import { useQueryParams } from "@/features/players/useQueryParams";
import { TEAM_SORT_OPTIONS, type TeamSortOption } from "./types";
import { TeamFilterSheet } from "./TeamFilterSheet";

const FIRST_PAGE = 20;
const PAGE_SIZE = 20;

function asGame(v: string | null): GameId {
  return v === "CS2" || v === "League" || v === "VALORANT" ? v : "VALORANT";
}
function asSort(v: string | null): TeamSortOption {
  return TEAM_SORT_OPTIONS.includes(v as TeamSortOption) ? (v as TeamSortOption) : "Ranking";
}
function rankingSourceNote(game: GameId): string {
  switch (game) {
    case "CS2": return "CS2 rankings follow Valve's official regional standings.";
    case "VALORANT": return "VALORANT rankings are Insight's composite of VLR.gg regional ratings.";
    case "League": return "League rankings are Insight's composite of major-league standings.";
    default: return "Rankings: Valve standings (CS2) · Insight composites (VALORANT, League).";
  }
}

export function TeamsList() {
  const { params, set } = useQueryParams();
  const game = asGame(params.get("game"));
  const tierRaw = params.get("tier");
  const tier = tierRaw && /^[123]$/.test(tierRaw) ? Number(tierRaw) : null;
  const region = params.get("region");
  const sort = asSort(params.get("sort"));
  const urlQuery = params.get("q") ?? "";

  const [query, setQuery] = useState(urlQuery);
  const debounced = useDebounced(query, 300);
  useEffect(() => {
    if (debounced.trim() !== urlQuery) set({ q: debounced.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => { setQuery((q) => (q.trim() === urlQuery ? q : urlQuery)); }, [urlQuery]);

  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilters = tier != null || !!region || sort !== "Ranking";

  const list = usePagedList<Team>(
    async (limit, offset, signal) => normalizeTeams(await api.get(endpoints.teams(game, urlQuery.trim() || null, limit, offset, tier), { signal })),
    [game, urlQuery, tier],
    { firstPage: FIRST_PAGE, pageSize: PAGE_SIZE },
  );
  const sentinel = useLoadMore(list.loadMore, list.hasLoaded && !list.reachedEnd && !list.loadingMore);

  // Region + sort apply client-side to the loaded pages (unchanged behavior).
  const teams = useMemo(() => {
    let filtered = region ? list.items.filter((t) => t.region === region) : list.items.slice();
    switch (sort) {
      case "Ranking":
        // Stored rank ascending for RANKED teams; unranked (nil/0) sink
        // below all ranked teams, ordered by rating. Deterministic id tiebreak.
        filtered = filtered.sort((a, b) => {
          const ra = (a.ranking ?? 0) > 0 ? (a.ranking as number) : Number.MAX_SAFE_INTEGER;
          const rb = (b.ranking ?? 0) > 0 ? (b.ranking as number) : Number.MAX_SAFE_INTEGER;
          if (ra !== rb) return ra - rb;
          if (ra === Number.MAX_SAFE_INTEGER && (a.rating ?? 0) !== (b.rating ?? 0)) return (b.rating ?? 0) - (a.rating ?? 0);
          return a.id.localeCompare(b.id);
        });
        break;
      case "Win Rate": filtered = filtered.sort((a, b) => b.winRate - a.winRate); break;
      case "Alphabetical": filtered = filtered.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return filtered;
  }, [list.items, region, sort]);

  const filterTool = (
    <ToolButton label="Filter teams" onClick={() => setShowFilters(true)} className="relative">
      <SlidersHorizontal size={16} strokeWidth={2.25} />
      {hasActiveFilters ? <span className="absolute top-1 right-1 size-2 rounded-full bg-violet" /> : null}
    </ToolButton>
  );

  let content;
  if (list.loading || !list.hasLoaded) content = <SkeletonLedger rows={10} avatar={44} className="mx-4 mt-3" />;
  else if (list.error && list.items.length === 0) content = <LoadFailure error={list.error} connectionProblem={list.connectionProblem} onRetry={list.reload} />;
  else if (teams.length === 0) content = <div className="py-16"><EmptyState icon={<Users />} title="No teams found" subtitle="Try adjusting your filters" /></div>;
  else content = (
    <div className="px-4 pt-3">
      <Ledger>
        <LedgerHeader className="hidden md:grid md:grid-cols-[44px_minmax(0,2fr)_120px_90px_110px_90px] md:gap-3">
          <span className="t-kicker text-center">#</span>
          <span className="t-kicker">Team</span>
          <span className="t-kicker">Region</span>
          <span className="t-kicker">Tier</span>
          <span className="t-kicker text-right">Record</span>
          <span className="t-kicker text-right">Rating</span>
        </LedgerHeader>
        {teams.map((t) => <TeamRow key={t.id} team={t} rank={(t.ranking ?? 0) > 0 ? t.ranking : null} />)}
        {list.loadingMore ? <div className="flex justify-center py-3"><Spinner size={18} /></div> : null}
      </Ledger>
      {/* Ranking source footnote — rows stay a plain "#N"; this tells you which number it is. */}
      <p className="t-label-sm text-muted text-center px-6 pt-2.5">{rankingSourceNote(game)}</p>
      <div ref={sentinel} className="h-px" />
    </div>
  );

  return (
    <Page>
      <TabHeader title="Teams" tools={<HeaderTools extra={filterTool} />} />
      <GameTabBar selected={game} onChange={(g) => set({ game: g, tier: null, region: null, sort: null }, { push: true })} games={SELECTABLE_GAMES} className="pt-2" />
      <div className="px-4 pt-2.5">
        <SearchField value={query} onChange={setQuery} placeholder="Search teams" />
      </div>
      {hasActiveFilters ? (
        <div className="flex gap-2 px-4 pt-2.5 overflow-x-auto no-scrollbar">
          {tier != null ? <ActiveFilterTag label={`Tier ${tier}`} onRemove={() => set({ tier: null })} /> : null}
          {region ? <ActiveFilterTag label={region} onRemove={() => set({ region: null })} /> : null}
          {sort !== "Ranking" ? <ActiveFilterTag label={sort} onRemove={() => set({ sort: null })} /> : null}
        </div>
      ) : null}
      {content}
      <TeamFilterSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        game={game}
        tier={tier}
        region={region}
        sort={sort}
        onApply={(t, r, s) => set({ tier: t == null ? null : String(t), region: r, sort: s === "Ranking" ? null : s })}
      />
    </Page>
  );
}

function ActiveFilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-md bg-violet text-white t-label-md shrink-0">
      {label}
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className="text-white/80 hover:text-white"><X size={11} strokeWidth={3} /></button>
    </span>
  );
}

/** TeamRow: rank · logo · name + tier/region · rating (or win rate + record). */
function TeamRow({ team, rank }: { team: Team; rank: number | null }) {
  const pct = `${Math.round(team.winRate * 100)}%`;
  const winColor = team.winRate >= 0.6 ? "text-success" : team.winRate >= 0.5 ? "text-primary" : "text-error";
  return (
    <Link
      href={`/teams/${encodeURIComponent(team.id)}`}
      className={clsx("ledger-row hover:bg-surface/60 transition-colors", "md:grid md:grid-cols-[44px_minmax(0,2fr)_120px_90px_110px_90px] md:gap-3")}
    >
      <span className="t-mono-md text-muted min-w-[30px] text-center shrink-0">{rank != null ? `#${rank}` : "—"}</span>
      <span className="flex items-center gap-3 min-w-0 flex-1">
        <TeamMark name={team.abbreviation} logoURL={team.logoURL} color="var(--surface)" size={44} />
        <span className="flex flex-col gap-1 min-w-0">
          <span className="t-headline-sm text-primary truncate">{team.name}</span>
          <span className="flex items-center gap-1.5 md:hidden">
            {team.tier === 1 ? <TierBadge tier={1} /> : null}
            {team.region ? <span className="t-label-sm text-muted">{team.region}</span> : null}
          </span>
        </span>
      </span>
      <span className="hidden md:block t-body-sm text-secondary truncate">{team.region ?? "—"}</span>
      <span className="hidden md:block">{team.tier === 1 ? <TierBadge tier={1} /> : <span className="t-label-sm text-muted">Tier {team.tier}</span>}</span>
      <span className="hidden md:flex flex-col items-end">
        <span className="t-mono-sm text-primary">{teamRecord(team)}</span>
        <span className={clsx("t-label-sm", team.rating != null ? "text-muted" : winColor)}>{pct}</span>
      </span>
      <span className="flex flex-col items-end gap-0.5 shrink-0">
        {team.rating != null ? (
          <>
            <span className="t-label-sm text-muted md:hidden">Rating</span>
            <span className="t-mono-md text-violet">{fmt2(team.rating)}</span>
            <span className="t-label-sm text-muted md:hidden">{teamRecord(team)} • {pct}</span>
          </>
        ) : (
          <>
            <span className={clsx("t-mono-md", winColor)}>{pct}</span>
            <span className="t-label-sm text-muted md:hidden">{teamRecord(team)}</span>
          </>
        )}
      </span>
    </Link>
  );
}
