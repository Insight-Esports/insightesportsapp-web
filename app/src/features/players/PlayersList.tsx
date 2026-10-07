// PlayersList — PlayersView.swift.
//
// Ranked list of pro players per game. Game tabs: VALORANT, CS2, League.
// Filter button opens a sheet with Role and Region filters; the search
// field filters server-side (debounced). Filters live in the URL
// (?game=&role=&region=&q=) so a filtered list is shareable.
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, UserX, X } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { normalizePlayers, SELECTABLE_GAMES, type GameId, type Player } from "@/lib/types";
import { clsx, fmt2 } from "@/lib/format";
import { EmptyState, GameTabBar, InitialAvatar, Ledger, LedgerHeader, LoadFailure, Page, SearchField, SkeletonLedger, Spinner, TabHeader, TeamMark, ToolButton } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { normalizeFilterOptions, regionsForGame, rolesForGame, type PlayerFilterOptions } from "./types";
import { usePagedList } from "./usePagedList";
import { useDebounced, useLoadMore } from "./useLoadMore";
import { useQueryParams } from "./useQueryParams";
import { PlayerFilterSheet } from "./PlayerFilterSheet";

const FIRST_PAGE = 20;
const PAGE_SIZE = 20;

function asGame(v: string | null): GameId {
  return v === "CS2" || v === "League" || v === "VALORANT" ? v : "VALORANT";
}

export function PlayersList() {
  const { params, set } = useQueryParams();
  const game = asGame(params.get("game"));
  const role = params.get("role");
  const region = params.get("region");
  const urlQuery = params.get("q") ?? "";

  // The field is local; the URL (and the fetch) follow it after 300ms.
  const [query, setQuery] = useState(urlQuery);
  const debounced = useDebounced(query, 300);
  useEffect(() => {
    if (debounced.trim() !== urlQuery) set({ q: debounced.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => { setQuery((q) => (q.trim() === urlQuery ? q : urlQuery)); }, [urlQuery]);

  const [showFilters, setShowFilters] = useState(false);
  const hasActiveFilters = !!role || !!region;

  // Filter options for the game (fallback lists if the endpoint fails).
  const [options, setOptions] = useState<PlayerFilterOptions>({ roles: rolesForGame(game), regions: regionsForGame(game) });
  useEffect(() => {
    let active = true;
    setOptions({ roles: rolesForGame(game), regions: regionsForGame(game) });
    api.get(endpoints.playerFilters(game))
      .then((raw) => { if (active) setOptions(normalizeFilterOptions(raw)); })
      .catch(() => { /* keep fallback */ });
    return () => { active = false; };
  }, [game]);

  const list = usePagedList<Player>(
    async (limit, offset, signal) => {
      const raw = await api.get(endpoints.topPlayers(game, role, region, urlQuery.trim() || null, limit, offset), { signal });
      const fetched = normalizePlayers(raw);
      // Deterministic client order regardless of server whims: rating desc,
      // id tiebreak. Rank numbers = position in THIS order.
      return offset === 0
        ? fetched.sort((a, b) => ((b.rating ?? -1) - (a.rating ?? -1)) || a.id.localeCompare(b.id))
        : fetched;
    },
    [game, role, region, urlQuery],
    { firstPage: FIRST_PAGE, pageSize: PAGE_SIZE },
  );
  const sentinel = useLoadMore(list.loadMore, list.hasLoaded && !list.reachedEnd && !list.loadingMore);

  const ratingLabel = game === "League" ? "KDA" : "Rating";

  const filterTool = (
    <ToolButton label="Filter players" onClick={() => setShowFilters(true)} className="relative">
      <SlidersHorizontal size={16} strokeWidth={2.25} />
      {hasActiveFilters ? <span className="absolute top-1 right-1 size-2 rounded-full bg-violet" /> : null}
    </ToolButton>
  );

  let content;
  if (list.loading || !list.hasLoaded) content = <SkeletonLedger rows={10} avatar={44} className="mx-4 mt-3" />;
  else if (list.error && list.items.length === 0) content = <LoadFailure error={list.error} connectionProblem={list.connectionProblem} onRetry={list.reload} />;
  else if (list.items.length === 0) content = <div className="py-16"><EmptyState icon={<UserX />} title="No players found" subtitle="Try adjusting your filters" /></div>;
  else content = (
    <div className="px-4 pt-3">
      <Ledger>
        <LedgerHeader className="hidden md:grid md:grid-cols-[44px_minmax(0,2fr)_minmax(0,1.6fr)_120px_110px_90px] md:gap-3">
          <span className="t-kicker text-center">#</span>
          <span className="t-kicker">Player</span>
          <span className="t-kicker">Team</span>
          <span className="t-kicker">Role</span>
          <span className="t-kicker">Nationality</span>
          <span className="t-kicker text-right">{ratingLabel}</span>
        </LedgerHeader>
        {list.items.map((p, i) => <PlayerRow key={p.id} player={p} rank={i + 1} ratingLabel={ratingLabel} />)}
        {list.loadingMore ? <div className="flex justify-center py-3"><Spinner size={18} /></div> : null}
      </Ledger>
      <div ref={sentinel} className="h-px" />
    </div>
  );

  return (
    <Page>
      <TabHeader title="Players" tools={<HeaderTools extra={filterTool} />} />
      <GameTabBar selected={game} onChange={(g) => set({ game: g, role: null, region: null }, { push: true })} games={SELECTABLE_GAMES} className="pt-2" />
      <div className="px-4 pt-2.5">
        <SearchField value={query} onChange={setQuery} placeholder="Search players" />
      </div>
      {hasActiveFilters ? (
        <div className="flex gap-2 px-4 pt-2.5 overflow-x-auto no-scrollbar">
          {role ? <ActiveFilterTag label={role} onRemove={() => set({ role: null })} /> : null}
          {region ? <ActiveFilterTag label={region} onRemove={() => set({ region: null })} /> : null}
        </div>
      ) : null}
      {content}
      <PlayerFilterSheet
        open={showFilters}
        onClose={() => setShowFilters(false)}
        roles={options.roles}
        regions={options.regions}
        role={role}
        region={region}
        onApply={(r, reg) => set({ role: r, region: reg })}
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

/** PlayerRow: rank · avatar · name + "team • role" · rating. Wide screens add Team / Role / Nationality columns. */
function PlayerRow({ player, rank, ratingLabel }: { player: Player; rank: number; ratingLabel: string }) {
  const ratingValue = player.rating == null ? "N/A" : fmt2(player.rating);
  const team = player.teamName;
  return (
    <Link
      href={`/players/${encodeURIComponent(player.id)}`}
      className={clsx(
        "ledger-row hover:bg-surface/60 transition-colors",
        "md:grid md:grid-cols-[44px_minmax(0,2fr)_minmax(0,1.6fr)_120px_110px_90px] md:gap-3",
      )}
    >
      <span className="t-mono-md text-muted min-w-[30px] text-center shrink-0">#{rank}</span>
      <span className="flex items-center gap-3 min-w-0 flex-1">
        <InitialAvatar name={player.name} imageURL={player.imageURL} size={44} />
        <span className="flex flex-col gap-1 min-w-0">
          <span className="t-headline-sm text-primary truncate">{player.name}</span>
          <span className="flex items-center gap-1.5 md:hidden min-w-0">
            {team ? <TeamMark name={team} logoURL={player.teamLogoURL} color="var(--team1)" size={20} /> : null}
            <span className="t-body-sm text-muted truncate">{team ?? "Free Agent"} • {player.role ?? "Unknown"}</span>
          </span>
          {player.realName ? <span className="hidden md:block t-label-sm text-muted truncate">{player.realName}</span> : null}
        </span>
      </span>
      <span className="hidden md:flex items-center gap-2 min-w-0">
        {team ? <TeamMark name={team} logoURL={player.teamLogoURL} color="var(--team1)" size={24} /> : null}
        <span className="t-body-sm text-secondary truncate">{team ?? "Free Agent"}</span>
      </span>
      <span className="hidden md:block t-body-sm text-secondary truncate">{player.role ?? "Unknown"}</span>
      <span className="hidden md:block t-body-sm text-muted truncate">{player.nationality ?? "—"}</span>
      <span className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="t-label-sm text-muted md:hidden">{ratingLabel}</span>
        <span className="t-mono-md text-violet">{ratingValue}</span>
      </span>
    </Link>
  );
}
