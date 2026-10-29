// alerts/NewAlert.tsx — "New Alert": GAME chips → Player or Team → pick
// from search (All) or from who's playing right now (Live) → the composer.
// A live pick opens the composer for THIS match (matchId sent), for teams
// the same as for players (parity §11).
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, PlayCircle, Search } from "lucide-react";
import { api, endpoints, errorMessage } from "@/lib/api";
import { gameLabel, normalizePlayers, normalizeTeams, SELECTABLE_GAMES } from "@/lib/types";
import { useLiveMatches } from "@/lib/live-matches";
import { EmptyState, FilterChip, InitialAvatar, LiveBadge, SearchField, SkeletonLedger, Spinner, TeamMark } from "@/components/ui";
import { liveScoreLine } from "@/components/ui/entity-header";
import { normalizeStatRows } from "@/features/predictions/types";
import { alertComposerHref, ALERTS_BASE, type AlertTargetType } from "./entry";
import { useAlerts } from "./store";
import { AlertList, alertRowClass, AlertsFrame, AlertsOff, Chip, Segment, SectionLabel } from "./ui";

interface PickRow { id: string; name: string; imageURL: string | null; subtitle: string | null; liveLine?: string | null; matchId?: string | null }

const SEARCH_LIMIT = 25;

export function NewAlertScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const alerts = useAlerts({ autoload: false });
  const initialGame = sp.get("game");
  const game = initialGame && SELECTABLE_GAMES.some((g) => g.id === initialGame) ? initialGame : "VALORANT";
  const type: AlertTargetType = sp.get("type") === "team" ? "team" : "player";
  const live = sp.get("mode") === "live";

  const go = (next: { game?: string; type?: AlertTargetType; live?: boolean }) => {
    const u = new URLSearchParams();
    u.set("game", next.game ?? game);
    u.set("type", next.type ?? type);
    if (next.live ?? live) u.set("mode", "live");
    router.replace(`${ALERTS_BASE}/new?${u.toString()}`);
  };

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => { const id = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(id); }, [query]);

  // ── All: players (top / search) or teams (load once, filter locally) ──
  const [rows, setRows] = useState<PickRow[]>([]);
  const [teams, setTeams] = useState<PickRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (live || type !== "player") return;
    const ctrl = new AbortController();
    let on = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        const raw = debounced ? await api.get(endpoints.searchPlayers(game, debounced), { signal: ctrl.signal }) : await api.get(endpoints.topPlayers(game, null, null), { signal: ctrl.signal });
        if (!on) return;
        setRows(normalizePlayers(raw).slice(0, SEARCH_LIMIT).map((p) => ({ id: p.id, name: p.name, imageURL: p.imageURL, subtitle: [p.teamName, p.role].filter(Boolean).join(" · ") || null })));
      } catch (e) {
        if (!on || (e instanceof DOMException && e.name === "AbortError")) return;
        setRows([]); setError(`Couldn't load players. ${errorMessage(e)}`);
      } finally { if (on) setLoading(false); }
    })();
    return () => { on = false; ctrl.abort(); };
  }, [game, type, live, debounced, tick]);

  useEffect(() => {
    if (live || type !== "team") return;
    const ctrl = new AbortController();
    let on = true;
    setLoading(true); setError(null); setTeams(null);
    (async () => {
      try {
        const list = normalizeTeams(await api.get(endpoints.teams(game), { signal: ctrl.signal }));
        if (on) setTeams(list.map((t) => ({ id: t.id, name: t.name, imageURL: t.logoURL, subtitle: t.region })));
      } catch (e) {
        if (!on || (e instanceof DOMException && e.name === "AbortError")) return;
        setTeams([]); setError(`Couldn't load teams. ${errorMessage(e)}`);
      } finally { if (on) setLoading(false); }
    })();
    return () => { on = false; ctrl.abort(); };
  }, [game, type, live, tick]);

  // ── Live: the shared live list; players add their match stat rows ──
  const liveList = useLiveMatches(live);
  const liveMatches = liveList.filter((m) => m.game === game);
  const [livePlayers, setLivePlayers] = useState<PickRow[] | null>(null);
  const liveKey = liveMatches.map((m) => m.id).join(",");
  useEffect(() => {
    if (!live || type !== "player") return;
    let on = true;
    (async () => {
      const perMatch = await Promise.all(liveMatches.map(async (m) => ({ m, rows: normalizeStatRows(await api.get(endpoints.matchStats(m.id)).catch(() => [])) })));
      if (!on) return;
      const out: (PickRow & { kills: number })[] = [];
      for (const { m, rows: stats } of perMatch) {
        for (const r of stats) {
          if (!r.playerId || !r.playerName) continue;
          out.push({
            id: r.playerId, name: r.playerName, imageURL: r.imageURL, matchId: m.id, kills: r.kills ?? 0,
            liveLine: `${r.kills ?? 0} / ${r.deaths ?? 0} / ${r.assists ?? 0} KDA`,
            subtitle: [r.position ?? r.characterName, `${m.team1Name} vs ${m.team2Name}`].filter(Boolean).join(" · "),
          });
        }
      }
      setLivePlayers(out.sort((a, b) => b.kills - a.kills));
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, type, liveKey]);

  // Both sides of every live match, together, in match order.
  const liveTeams: PickRow[] = liveMatches.flatMap((m) => [
    { id: m.team1Id ?? m.team1Name, name: m.team1Name, imageURL: m.team1LogoURL, matchId: m.id, liveLine: liveScoreLine(m, m.team1Id), subtitle: `vs ${m.team2Name}` },
    { id: m.team2Id ?? m.team2Name, name: m.team2Name, imageURL: m.team2LogoURL, matchId: m.id, liveLine: liveScoreLine(m, m.team2Id), subtitle: `vs ${m.team1Name}` },
  ]);

  const shown: PickRow[] = live
    ? (type === "team" ? liveTeams : livePlayers ?? [])
    : type === "team"
      ? (teams ?? []).filter((t) => !query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 50)
      : rows;
  const busy = live ? (type === "player" && livePlayers === null && liveMatches.length > 0) : loading;

  return (
    <AlertsFrame title="New Alert" back={ALERTS_BASE}>
      {alerts.off ? <AlertsOff message={alerts.featureMessage} /> : (
        <>
          <div className="flex flex-col gap-2.5">
            <SectionLabel>GAME</SectionLabel>
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4">
              {SELECTABLE_GAMES.map((g) => <Chip key={g.id} label={g.label} selected={game === g.id} onClick={() => go({ game: g.id })} />)}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>ALERT ON</SectionLabel>
            <Segment options={[{ label: "Player", value: "player" as AlertTargetType }, { label: "Team", value: "team" as AlertTargetType }]} value={type} onChange={(t) => go({ type: t })} className="max-w-sm" />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-[22px]">
              <FilterChip label={type === "player" ? "All Players" : "All Teams"} selected={!live} onClick={() => go({ live: false })} />
              <FilterChip label="Live" selected={live} onClick={() => go({ live: true })} live />
            </div>
            <span className="t-label-sm text-muted">{gameLabel(game)} · search or pick from live</span>
            {!live ? (
              <div className="flex items-center gap-3">
                <div className="flex-1"><SearchField value={query} onChange={setQuery} placeholder={type === "player" ? "Search players" : "Search teams"} /></div>
                {busy && shown.length > 0 ? <Spinner size={16} /> : null}
              </div>
            ) : null}
          </div>

          {busy && shown.length === 0 ? (
            <SkeletonLedger rows={6} avatar={34} />
          ) : error && !live ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="t-body-md text-secondary">{error}</span>
              <button type="button" onClick={() => setTick((t) => t + 1)} className="t-label-md text-violet hover:underline">Retry</button>
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              className="!mx-0"
              icon={live ? <PlayCircle /> : <Search />}
              title={live ? `No live ${gameLabel(game)} matches right now` : `No ${type === "player" ? "players" : "teams"} found`}
              subtitle={live ? "Check back during a live match to set an alert for it" : undefined}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {live ? <SectionLabel tone="violet">IN-GAME NOW</SectionLabel> : type === "player" && !query.trim() ? <SectionLabel>POPULAR PLAYERS</SectionLabel> : null}
              <AlertList>
                {shown.map((r) => (
                  <Link key={r.id + (r.matchId ?? "")} href={alertComposerHref({ targetType: type, targetId: r.id, targetName: r.name, game, matchId: r.matchId ?? null })} className={alertRowClass + " !pr-3.5"}>
                    {type === "player" ? <InitialAvatar name={r.name} imageURL={r.imageURL} size={34} /> : <TeamMark name={r.name} logoURL={r.imageURL} size={34} />}
                    <span className="flex flex-col gap-[3px] min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="t-body-md text-primary truncate">{r.name}</span>
                        {r.matchId ? <LiveBadge className="shrink-0" /> : null}
                      </span>
                      {r.liveLine ? <span className="t-label-md text-violet">{r.liveLine}</span> : null}
                      {r.subtitle ? <span className="t-label-sm text-muted truncate">{r.subtitle}</span> : null}
                    </span>
                    <ChevronRight size={12} className="text-muted shrink-0" />
                  </Link>
                ))}
              </AlertList>
            </div>
          )}
        </>
      )}
    </AlertsFrame>
  );
}
