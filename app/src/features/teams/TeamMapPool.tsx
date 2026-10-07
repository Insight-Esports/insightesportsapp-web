// TeamMapPool — Mappoolsection.swift as used by the team page.
//
// The FREE map-pool block. VALORANT / CS2: the team's most-played maps with
// record and win rate. League: blue vs red side records instead ("Side
// Record"). Data: GET /teams/:id/map-pool (the free route), with the premium
// team overview's mapBreakdown/sideBreakdown as the fallback. Renders
// nothing at all when there are no rows. Palette: primary numbers, muted
// labels, a violet fill bar for win rate — the bar length IS the judgment.
"use client";

import { api, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { int, str, type Json } from "@/lib/types";
import { SectionHeader } from "@/components/ui";
import { normalizeMapPool, type MapPoolEntry } from "./types";

function overviewEntries(overview: Json, isLeague: boolean): MapPoolEntry[] {
  if (isLeague && overview?.sideBreakdown) return normalizeMapPool({ sides: overview.sideBreakdown }, true);
  const maps: Json[] = Array.isArray(overview?.mapBreakdown) ? overview.mapBreakdown : [];
  return normalizeMapPool({
    maps: maps.map((m) => ({ map: str(m?.mapName) ?? str(m?.map), games: int(m?.gamesPlayed ?? m?.games), wins: int(m?.wins), losses: int(m?.losses) })),
  }, false);
}

export function useTeamMapPool(teamId: string, game: string) {
  const isLeague = game === "League";
  return useFetch<MapPoolEntry[]>(async (signal) => {
    if (!teamId) return [];
    // First: the free route.
    try {
      const built = normalizeMapPool(await api.get(endpoints.teamMapPool(teamId, game), { signal }), isLeague);
      if (built.length) return built;
    } catch { /* fall through */ }
    // Then: the team overview's map/side breakdown (premium; tolerate 403).
    try {
      return overviewEntries(await api.get(endpoints.teamOverview(teamId, game), { signal }), isLeague);
    } catch { return []; }
  }, [teamId, game]);
}

export function TeamMapPool({ teamId, game, title = "Map Pool", maxRows = 5 }: { teamId: string; game: string; teamName?: string; title?: string; maxRows?: number }) {
  const { data } = useTeamMapPool(teamId, game);
  const entries = (data ?? []).slice(0, maxRows);
  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHeader title={game === "League" ? "Side Record" : title} />
      <div className="mx-4 rounded-xl border border-border-subtle bg-card overflow-hidden">
        {entries.map((e) => (
          <div key={e.id} className="flex flex-col gap-1.5 px-3.5 py-2.5 [&+&]:border-t [&+&]:border-border-subtle">
            <div className="flex items-center gap-2.5">
              <span className="flex-1 t-body-sm text-primary truncate">{e.name}</span>
              <span className="t-mono-sm text-muted">{e.wins}–{e.losses}</span>
              <span className="w-10 text-right t-mono-sm text-primary">{Math.round(e.winRate * 100)}%</span>
            </div>
            <div className="h-1 rounded-full bg-surface overflow-hidden">
              <div className="h-full rounded-full bg-violet" style={{ width: `${Math.max(0, Math.min(100, e.winRate * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
