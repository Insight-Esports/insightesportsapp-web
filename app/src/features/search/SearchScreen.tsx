// SearchScreen — SearchView.swift.
//
// Unified search across players, teams, users and tournaments. Live-filters
// as the user types (debounced), with game tabs (All / VALORANT / CS2 /
// League) that scope results. With an empty field it is a browse surface:
// recent searches plus the selected game's popular players and teams.
// The query and game live in the URL (?q=&game=).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleHelp, Clock, Search, X } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { GAMES, gameLabel, normalizePlayers, normalizeTeams, type GameId, type Player, type Team } from "@/lib/types";
import { clsx } from "@/lib/format";
import { AssetIcon, GamePill, GameTabBar, InitialAvatar, Page, SearchField, SkeletonBar, TabHeaderTitle, TeamMark } from "@/components/ui";
import { FollowButton } from "@/features/follow/FollowButton";
import { useDebounced } from "@/features/players/useLoadMore";
import { useQueryParams } from "@/features/players/useQueryParams";
import { EMPTY_RESULTS, normalizeSearchResults, resultsEmpty, tournamentGame, type SearchResults, type SearchUser } from "./types";

const RECENTS_KEY = "insight.recentSearches";
const MAX_RECENTS = 8;

function asGame(v: string | null): GameId {
  return v === "CS2" || v === "League" || v === "VALORANT" ? v : "all";
}

// Session cache so reopening search is instant instead of refetching the six browse requests.
let cachedBrowse: { teams: Team[]; players: Player[] } | null = null;
function interleave<T>(groups: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < max; i++) for (const g of groups) if (i < g.length) out.push(g[i]);
  return out;
}
async function loadBrowse(): Promise<{ teams: Team[]; players: Player[] }> {
  if (cachedBrowse) return cachedBrowse;
  const games = ["VALORANT", "CS2", "League"];
  const teamGroups = await Promise.all(games.map((g) => api.get(endpoints.popularTeams(g, 20)).then(normalizeTeams).catch(() => [] as Team[])));
  // Real popularity (follower-count ordering) when /players/popular serves it; rating-ordered top list until.
  const playerGroups = await Promise.all(games.map(async (g) => {
    const popular = await api.get(endpoints.popularPlayers(g)).then(normalizePlayers).catch(() => [] as Player[]);
    if (popular.length) return popular;
    return api.get(endpoints.topPlayers(g, null, null)).then(normalizePlayers).catch(() => [] as Player[]);
  }));
  cachedBrowse = { teams: interleave(teamGroups), players: interleave(playerGroups.map((g) => g.slice(0, 10))) };
  return cachedBrowse;
}

function readRecents(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
function writeRecents(v: string[]) {
  try { if (v.length) localStorage.setItem(RECENTS_KEY, JSON.stringify(v)); else localStorage.removeItem(RECENTS_KEY); } catch { /* ignore */ }
}

export function SearchScreen() {
  const { params, set } = useQueryParams();
  const game = asGame(params.get("game"));
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const debounced = useDebounced(query, 250);
  useEffect(() => {
    if (debounced.trim() !== urlQuery) set({ q: debounced.trim() || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => { setQuery((q) => (q.trim() === urlQuery ? q : urlQuery)); }, [urlQuery]);

  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [browse, setBrowse] = useState<{ teams: Team[]; players: Player[] } | null>(cachedBrowse);
  const requestId = useRef(0);

  useEffect(() => { setRecents(readRecents()); }, []);
  useEffect(() => { let active = true; loadBrowse().then((b) => { if (active) setBrowse(b); }); return () => { active = false; }; }, []);

  // Combined server search; the game filter narrows the response client-side too.
  useEffect(() => {
    const term = urlQuery.trim();
    const id = ++requestId.current;
    if (!term) { setResults(EMPTY_RESULTS); setSearching(false); return; }
    setSearching(true);
    api.get(endpoints.search(term, game === "all" ? null : game))
      .then((raw) => { if (id === requestId.current) setResults(normalizeSearchResults(raw)); })
      .catch(() => { if (id === requestId.current) setResults(EMPTY_RESULTS); })
      .finally(() => { if (id === requestId.current) setSearching(false); });
  }, [urlQuery, game]);

  const recordSearch = useCallback(() => {
    const trimmed = urlQuery.trim();
    if (!trimmed) return;
    setRecents((prev) => {
      const next = [trimmed, ...prev.filter((p) => p.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENTS);
      writeRecents(next);
      return next;
    });
  }, [urlQuery]);
  const removeRecent = (term: string) => setRecents((prev) => { const next = prev.filter((t) => t !== term); writeRecents(next); return next; });
  const clearRecents = () => { setRecents([]); writeRecents([]); };

  const filtered: SearchResults = game === "all" ? results : {
    players: results.players.filter((p) => p.game === game),
    teams: results.teams.filter((t) => t.game === game),
    tournaments: results.tournaments.filter((t) => tournamentGame(t) === game),
    users: results.users,   // users have no game — they pass through every filter
  };
  const browsePlayers = (game === "all" ? browse?.players ?? [] : (browse?.players ?? []).filter((p) => p.game === game)).slice(0, 8);
  const browseTeams = (game === "all" ? browse?.teams ?? [] : (browse?.teams ?? []).filter((t) => t.game === game)).slice(0, 6);
  const label = gameLabel(game);

  let body;
  if (!urlQuery.trim()) {
    body = (
      <div className="md:grid md:grid-cols-2 md:gap-x-6">
        {recents.length > 0 ? (
          <div className="md:col-span-2">
            <div className="flex items-center justify-between px-5 pt-2 pb-1">
              <span className="t-label-sm text-muted uppercase">Recent</span>
              <button type="button" onClick={clearRecents} className="t-label-sm text-violet">Clear</button>
            </div>
            {recents.map((term) => (
              <div key={term} className="flex items-center gap-3 px-4 py-1.5">
                <button type="button" onClick={() => { setQuery(term); set({ q: term }); }} className="flex items-center gap-3 flex-1 min-w-0 text-left hover:text-primary">
                  <Clock size={14} className="text-muted w-6 shrink-0" />
                  <span className="t-body-md text-primary truncate">{term}</span>
                </button>
                <button type="button" aria-label={`Remove ${term}`} onClick={() => removeRecent(term)} className="grid place-items-center size-8 text-muted hover:text-primary"><X size={12} strokeWidth={2.5} /></button>
              </div>
            ))}
          </div>
        ) : null}
        {browse === null ? (
          <div className="md:col-span-2"><LoadingRows /></div>
        ) : (
          <>
            {browsePlayers.length > 0 ? (
              <div>
                <SearchSectionHeader title={game === "all" ? "Popular Players" : `Popular ${label} Players`} />
                {browsePlayers.map((p) => <PlayerSearchRow key={p.id} player={p} />)}
              </div>
            ) : null}
            {browseTeams.length > 0 ? (
              <div>
                <SearchSectionHeader title={game === "all" ? "Popular Teams" : `Popular ${label} Teams`} />
                {browseTeams.map((t) => <TeamSearchRow key={t.id} team={t} />)}
              </div>
            ) : null}
            {recents.length === 0 && browseTeams.length === 0 ? (
              <div className="md:col-span-2 flex flex-col items-center gap-3 pt-20 text-center">
                <Search size={40} className="text-muted" />
                <span className="t-headline-sm text-primary">Search Insight</span>
                <span className="t-body-sm text-muted">Find players, teams, and tournaments.</span>
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  } else if (searching && resultsEmpty(filtered)) {
    body = <LoadingRows />;
  } else if (resultsEmpty(filtered)) {
    body = (
      <div className="flex flex-col items-center gap-3 pt-20 px-10 text-center">
        <CircleHelp size={40} className="text-muted" />
        <span className="t-headline-sm text-primary">No results for &ldquo;{urlQuery}&rdquo;</span>
        <span className="t-body-sm text-muted">{game === "all" ? "Try a different name or spelling." : "Try a different name, or switch the game filter to All."}</span>
      </div>
    );
  } else {
    body = (
      <div className="md:grid md:grid-cols-2 md:gap-x-6">
        {filtered.players.length > 0 ? (
          <div>
            <SearchSectionHeader title="Players" />
            {filtered.players.map((p) => <PlayerSearchRow key={p.id} player={p} onNavigate={recordSearch} />)}
          </div>
        ) : null}
        {filtered.teams.length > 0 ? (
          <div>
            <SearchSectionHeader title="Teams" />
            {filtered.teams.map((t) => <TeamSearchRow key={t.id} team={t} onNavigate={recordSearch} />)}
          </div>
        ) : null}
        {filtered.users.length > 0 ? (
          <div>
            <SearchSectionHeader title="Users" />
            {filtered.users.map((u) => <UserSearchRow key={u.id} user={u} />)}
          </div>
        ) : null}
        {filtered.tournaments.length > 0 ? (
          <div>
            <SearchSectionHeader title="Tournaments" />
            {filtered.tournaments.map((t) => <TournamentSearchRow key={t} name={t} onNavigate={recordSearch} />)}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Page>
      <div className="flex items-center px-4 pt-1.5 pb-2"><TabHeaderTitle text="Search" /></div>
      <div className="px-4 pb-2">
        <SearchField value={query} onChange={setQuery} placeholder="Search players and teams" autoFocus />
      </div>
      <GameTabBar selected={game} onChange={(g) => set({ game: g === "all" ? null : g })} games={GAMES} className="pb-2" />
      <div className="pt-1">{body}</div>
    </Page>
  );
}

function LoadingRows() {
  return (
    <div className="flex flex-col pt-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5"><span className="size-10 rounded-full bg-surface" /><SkeletonBar width={140} height={12} /></div>
      ))}
    </div>
  );
}

function SearchSectionHeader({ title }: { title: string }) {
  return <div className="px-5 pt-3.5 pb-1 t-label-sm text-muted uppercase">{title}</div>;
}

const rowCls = "flex items-center gap-3 px-4 py-2.5 hover:bg-card transition-colors";

function PlayerSearchRow({ player, onNavigate }: { player: Player; onNavigate?: () => void }) {
  return (
    <Link href={`/players/${encodeURIComponent(player.id)}`} onClick={onNavigate} className={rowCls}>
      <InitialAvatar name={player.name} imageURL={player.imageURL} size={40} />
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="t-body-md text-primary truncate">{player.name}</span>
        <span className="t-label-sm text-muted truncate">{[player.teamName, player.role].filter(Boolean).join(" • ")}</span>
      </span>
      <GamePill game={player.game} />
    </Link>
  );
}

function TeamSearchRow({ team, onNavigate }: { team: Team; onNavigate?: () => void }) {
  return (
    <Link href={`/teams/${encodeURIComponent(team.id)}`} onClick={onNavigate} className={rowCls}>
      <TeamMark name={team.name} logoURL={team.logoURL} size={40} />
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="t-body-md text-primary truncate">{team.name}</span>
        {team.region ? <span className="t-label-sm text-muted">{team.region}</span> : null}
      </span>
      <GamePill game={team.game} />
    </Link>
  );
}

function UserSearchRow({ user }: { user: SearchUser }) {
  return (
    <Link href={`/profile/${encodeURIComponent(user.id)}`} className={clsx(rowCls, "py-2")}>
      <InitialAvatar name={user.username} imageURL={user.avatarURL} size={36} />
      <span className="t-body-md text-primary truncate flex-1">{user.username}</span>
      <FollowButton targetType="user" targetId={user.id} compact stopPropagation />
    </Link>
  );
}

function TournamentSearchRow({ name, onNavigate }: { name: string; onNavigate?: () => void }) {
  return (
    <Link href={`/results?tournament=${encodeURIComponent(name)}`} onClick={onNavigate} className={rowCls}>
      <span className="grid place-items-center size-10 rounded-full bg-gold/15 shrink-0"><AssetIcon name="tournament" height={18} /></span>
      <span className="t-body-md text-primary truncate flex-1">{name}</span>
      <ChevronRight size={12} className="text-muted" />
    </Link>
  );
}
