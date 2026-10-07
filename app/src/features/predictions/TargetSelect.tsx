// predictions/TargetSelect.tsx — PredictionTargetSelectView (flow step 2):
// search & select the player or team for the chosen game.
//
// Player picker has two modes (All / Live). ALL: empty query → /players/top,
// typed query → /players/search (debounced). LIVE: only players currently in
// a live match for this game, composed from /matches/live + /matches/:id/stats.
// Teams load once via /teams and filter locally. directBreakdown skips the
// options step and opens the breakdown straight away.
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, PlayCircle, Search } from "lucide-react";
import { api, endpoints, errorMessage } from "@/lib/api";
import { clsx } from "@/lib/format";
import { gameLabel, normalizeMatches, normalizePlayers, normalizeTeams } from "@/lib/types";
import { EmptyState, FilterChip, InitialAvatar, Ledger, LedgerRow, LiveBadge, SearchField, SkeletonLedger, Spinner, TeamMark } from "@/components/ui";
import { PredictScreen } from "./PredictScreen";
import { flowHref, qs, readGame, readTargetType, PREDICT_BASE, type FlowTarget } from "./flow";
import { normalizeStatRows, type PredictionTargetItem } from "./types";

const TEAM_MAX_VISIBLE = 50;
const PLAYER_SEARCH_LIMIT = 25; // must match the backend LIMIT

export function TargetSelectScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const game = readGame(sp);
  const targetType = readTargetType(sp);
  const directBreakdown = sp.get("breakdown") === "1";
  const isLiveMode = targetType === "player" && sp.get("mode") === "live";

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<PredictionTargetItem[]>([]);
  const [allTeams, setAllTeams] = useState<PredictionTargetItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const setLiveMode = (live: boolean) => {
    if (live === isLiveMode) return;
    router.replace(`${PREDICT_BASE}${qs({ game, type: targetType, breakdown: directBreakdown, mode: live ? "live" : null })}`);
  };

  // ── Players (ALL) ──
  useEffect(() => {
    if (targetType !== "player" || isLiveMode) return;
    const ctrl = new AbortController();
    let active = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        const raw = debounced
          ? await api.get(endpoints.searchPlayers(game, debounced), { signal: ctrl.signal })
          : await api.get(endpoints.topPlayers(game, null, null), { signal: ctrl.signal });
        const players = normalizePlayers(raw);
        const shown = players.slice(0, PLAYER_SEARCH_LIMIT);
        if (!active) return;
        setResults(shown.map((p) => ({ id: p.id, name: p.name, subtitle: [p.teamName, p.role].filter(Boolean).join(" · ") || null, imageURL: p.imageURL })));
        setTruncated(!!debounced && players.length >= PLAYER_SEARCH_LIMIT);
      } catch (e) {
        if (!active || (e instanceof DOMException && e.name === "AbortError")) return;
        setResults([]);
        setError(`Couldn't load players. ${errorMessage(e)}`);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; ctrl.abort(); };
  }, [game, targetType, isLiveMode, debounced, tick]);

  // ── Players (LIVE): /matches/live → /matches/:id/stats, sorted by kills ──
  useEffect(() => {
    if (targetType !== "player" || !isLiveMode) return;
    const ctrl = new AbortController();
    let active = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        const matches = normalizeMatches(await api.get(endpoints.liveMatches, { signal: ctrl.signal })).filter((m) => m.game === game);
        if (matches.length === 0) { if (active) { setResults([]); setTruncated(false); } return; }
        const perMatch = await Promise.all(matches.map(async (m) => {
          const rows = normalizeStatRows(await api.get(endpoints.matchStats(m.id), { signal: ctrl.signal }).catch(() => []));
          return { m, rows };
        }));
        const live: PredictionTargetItem[] = [];
        for (const { m, rows } of perMatch) {
          const matchup = `${m.team1Name} vs ${m.team2Name}`;
          for (const r of rows) {
            if (!r.playerId || !r.playerName) continue;
            const kills = r.kills ?? 0, deaths = r.deaths ?? 0, assists = r.assists ?? 0;
            const role = r.position ?? r.characterName;
            live.push({
              id: r.playerId, name: r.playerName,
              subtitle: [role, matchup].filter((s): s is string => !!s && s.length > 0).join(" · "),
              isLive: true, liveInfo: `${kills} / ${deaths} / ${assists} KDA`, liveKills: kills, matchId: m.id, imageURL: r.imageURL,
            });
          }
        }
        if (!active) return;
        setResults(live.sort((a, b) => (b.liveKills ?? 0) - (a.liveKills ?? 0)));
        setTruncated(false);
      } catch (e) {
        if (!active || (e instanceof DOMException && e.name === "AbortError")) return;
        setResults([]);
        setError(`Couldn't load live players. ${errorMessage(e)}`);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; ctrl.abort(); };
  }, [game, targetType, isLiveMode, tick]);

  // ── Teams: load once, filter locally ──
  useEffect(() => {
    if (targetType !== "team") return;
    const ctrl = new AbortController();
    let active = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        const teams = normalizeTeams(await api.get(endpoints.teams(game), { signal: ctrl.signal }));
        if (!active) return;
        setAllTeams(teams.map((t) => ({ id: t.id, name: t.name, subtitle: t.region || null, imageURL: t.logoURL })));
      } catch (e) {
        if (!active || (e instanceof DOMException && e.name === "AbortError")) return;
        setAllTeams([]);
        setError(`Couldn't load teams. ${errorMessage(e)}`);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; ctrl.abort(); };
  }, [game, targetType, tick]);

  const teamResults = useMemo(() => {
    if (targetType !== "team" || !allTeams) return null;
    const term = query.trim().toLowerCase();
    const matches = term ? allTeams.filter((t) => t.name.toLowerCase().includes(term)) : allTeams;
    return { items: matches.slice(0, TEAM_MAX_VISIBLE), truncated: matches.length > TEAM_MAX_VISIBLE };
  }, [targetType, allTeams, query]);

  const items = targetType === "team" ? teamResults?.items ?? [] : results;
  const isTruncated = targetType === "team" ? !!teamResults?.truncated : truncated;
  const reload = () => setTick((t) => t + 1);

  const hrefFor = (item: PredictionTargetItem) => {
    const t: FlowTarget = { game, targetType, targetId: item.id, targetName: item.name, isLive: !!item.isLive, matchId: item.matchId ?? null };
    if (directBreakdown) return item.isLive && targetType === "player" ? flowHref.live(t) : flowHref.breakdown(t);
    return flowHref.options(t);
  };

  return (
    <PredictScreen title="Select" back="/premium">
      <div className="flex flex-col gap-5 pt-1">
        <div className="flex flex-col gap-1.5 px-4">
          <h1 className="t-headline-md text-primary">{targetType === "player" ? "Pick a player" : "Pick a team"}</h1>
          <span className="t-body-sm text-muted">{gameLabel(game)} · {targetType === "player" ? "search or pick from live" : "search by name"}</span>
        </div>

        {targetType === "player" ? (
          <div className="flex items-end gap-[22px] px-4">
            <FilterChip label="All Players" selected={!isLiveMode} onClick={() => setLiveMode(false)} />
            <FilterChip label="Live" selected={isLiveMode} onClick={() => setLiveMode(true)} live />
          </div>
        ) : null}

        {!isLiveMode ? (
          <div className="px-4 flex items-center gap-3">
            <div className="flex-1"><SearchField value={query} onChange={setQuery} placeholder={targetType === "player" ? "Search players" : "Search teams"} /></div>
            {loading && items.length > 0 ? <Spinner size={16} /> : null}
          </div>
        ) : null}

        <div className="px-4 flex flex-col gap-2.5">
          {loading && items.length === 0 ? (
            <SkeletonLedger rows={8} avatar={34} />
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-8 px-6 text-center">
              <span className="t-body-md text-secondary">{error}</span>
              <button type="button" onClick={reload} className="t-label-md text-violet hover:underline">Retry</button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={isLiveMode ? <PlayCircle /> : <Search />}
              title={isLiveMode ? `No live ${gameLabel(game)} matches right now` : `No ${targetType === "player" ? "players" : "teams"} found`}
              subtitle={isLiveMode ? "Check back during a live match to predict in real time" : undefined}
              className="mx-0"
            />
          ) : (
            <>
              {isLiveMode ? (
                <span className="t-label-sm text-violet px-1">IN-GAME NOW</span>
              ) : targetType === "player" && query.trim() === "" ? (
                <span className="t-label-sm text-muted px-1">POPULAR PLAYERS</span>
              ) : null}
              <Ledger>
                {items.map((item) => (
                  <LedgerRow key={item.id + (item.matchId ?? "")} href={hrefFor(item)}>
                    <TargetRow item={item} targetType={targetType} />
                  </LedgerRow>
                ))}
              </Ledger>
              {isTruncated ? <span className="t-label-sm text-muted text-center">Showing the first {items.length} — keep typing to narrow down.</span> : null}
            </>
          )}
        </div>
      </div>
    </PredictScreen>
  );
}

function TargetRow({ item, targetType }: { item: PredictionTargetItem; targetType: "player" | "team" }) {
  return (
    <>
      {targetType === "player" ? <InitialAvatar name={item.name} imageURL={item.imageURL} size={34} /> : <TeamMark name={item.name} logoURL={item.imageURL} size={34} />}
      <span className="flex flex-col gap-[3px] min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="t-body-md text-primary">{item.name}</span>
          {item.isLive ? <LiveBadge /> : null}
        </span>
        {item.liveInfo ? <span className="t-label-md text-violet">{item.liveInfo}</span> : null}
        {item.subtitle ? <span className={clsx("t-label-sm text-muted truncate")}>{item.subtitle}</span> : null}
      </span>
      <span className="flex-1" />
      <ChevronRight size={12} className="text-muted shrink-0" />
    </>
  );
}

/** Link helper for other agents: open the predictor on a player / team. */
export function predictHrefFor(game: string, targetType: "player" | "team", id: string, name: string): string {
  return flowHref.options({ game, targetType, targetId: id, targetName: name, isLive: false, matchId: null });
}
