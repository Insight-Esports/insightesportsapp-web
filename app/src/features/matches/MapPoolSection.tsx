// MapPoolSection.tsx — Mappoolsection.swift. The FREE map-pool block,
// shared by the team page and the match preview. VALORANT / CS2: the
// team's most-played maps with record and win rate. League: blue vs red
// side records instead.
//
// Data: GET /teams/:id/map-pool first (the free route); the team
// overview's mapBreakdown/sideBreakdown as the fallback.
//
// Palette: primary numbers, muted labels, a violet fill bar for win rate.
"use client";

import { SectionHeader, SkeletonLedger } from "@/components/ui";
import { api, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { int, str, type Json } from "@/lib/types";
import { clsx } from "@/lib/format";

export interface MapPoolEntry {
  id: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number; // 0-1
}

function entry(id: string, name: string, games: number, wins: number, losses: number | null): MapPoolEntry {
  const l = losses ?? games - wins;
  return { id, name, games, wins, losses: l, winRate: games > 0 ? wins / games : 0 };
}

function sideEntries(sides: Json): MapPoolEntry[] {
  const out: MapPoolEntry[] = [];
  const b = sides?.blue, r = sides?.red;
  const bg = int(b?.games), rg = int(r?.games);
  if (b && bg !== null && bg > 0) out.push(entry("blue", "Blue side", bg, int(b.wins) ?? 0, int(b.losses)));
  if (r && rg !== null && rg > 0) out.push(entry("red", "Red side", rg, int(r.wins) ?? 0, int(r.losses)));
  return out;
}

function mapEntries(maps: Json): MapPoolEntry[] {
  if (!Array.isArray(maps)) return [];
  return maps
    .map((m: Json): MapPoolEntry | null => {
      const name = str(m?.map) ?? str(m?.mapName) ?? str(m?.map_name);
      const g = int(m?.games) ?? int(m?.gamesPlayed) ?? int(m?.games_played);
      if (!name || g === null || g <= 0) return null;
      return entry(name, name, g, int(m?.wins) ?? 0, int(m?.losses));
    })
    .filter((e: MapPoolEntry | null): e is MapPoolEntry => !!e)
    .sort((a: MapPoolEntry, b: MapPoolEntry) => (a.games !== b.games ? b.games - a.games : b.winRate - a.winRate));
}

async function loadMapPool(teamId: string, game: string, signal: AbortSignal): Promise<MapPoolEntry[]> {
  const isLeague = game === "League";
  try {
    const pool = await api.get<Json>(endpoints.teamMapPool(teamId, game), { signal });
    const built = isLeague && pool?.sides ? sideEntries(pool.sides) : mapEntries(pool?.maps);
    if (built.length) return built;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
  }
  try {
    const overview = await api.get<Json>(endpoints.teamOverview(teamId, game), { signal });
    if (isLeague && overview?.sideBreakdown) return sideEntries(overview.sideBreakdown);
    return mapEntries(overview?.mapBreakdown);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return [];
  }
}

export function MapPoolSection({ teamId, game, teamName, title, maxRows = 5, className }: { teamId: string; game: string; teamName?: string; title?: string; maxRows?: number; className?: string }) {
  const isLeague = game === "League";
  const { data, loading } = useFetch((signal) => loadMapPool(teamId, game, signal), [teamId, game], { enabled: !!teamId });
  const entries = (data ?? []).slice(0, maxRows);
  const heading = isLeague ? "Side Record" : title ?? (teamName ? `${teamName} · Map Pool` : "Map Pool");

  if (loading) {
    return (
      <div className={clsx("flex flex-col gap-2.5", className)}>
        <SectionHeader title={heading} />
        <div className="px-4"><SkeletonLedger rows={isLeague ? 2 : 3} avatar={0} /></div>
      </div>
    );
  }
  if (!entries.length) return null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className={clsx("flex flex-col gap-2.5", className)}>
      <SectionHeader title={heading} />
      <div className="mx-4 ledger">
        {entries.map((e, i) => (
          <div key={e.id} className={clsx("flex flex-col gap-1.5 px-3.5 py-2.5", i > 0 && "border-t border-border-subtle")}>
            <div className="flex items-center gap-2">
              <span className="t-body-sm text-primary">{e.name}</span>
              <span className="flex-1" />
              <span className="t-mono-sm text-muted">{e.wins}–{e.losses}</span>
              <span className="t-mono-sm text-primary w-10 text-right">{pct(e.winRate)}</span>
            </div>
            <div className="h-1 rounded-full bg-surface overflow-hidden" role="meter" aria-valuenow={Math.round(e.winRate * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${e.name} win rate`}>
              <span className="block h-full rounded-full bg-violet" style={{ width: `${e.winRate * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
