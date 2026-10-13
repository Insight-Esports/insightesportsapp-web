// warm.ts — the web ListWarmStore (Components.swift): right after sign-in,
// fetch the first page of Players and Teams for every game and warm their
// pictures, so the first tap on those tabs renders with no network wait.
"use client";

import { api, endpoints } from "./api";
import { normalizePlayers, normalizeTeams, SELECTABLE_GAMES, type Json } from "./types";
import { prefetchImages } from "./prefetch";
import { hasPagedCache, primePagedCache } from "@/features/players/usePagedList";
import { playersCacheKey, teamsCacheKey } from "@/features/players/cache-keys";

const FIRST_PAGE = 20;
let warmed = false;

export async function warmLists(): Promise<void> {
  if (warmed) return;
  warmed = true;
  await Promise.all(SELECTABLE_GAMES.flatMap(({ id: game }) => [
    (async () => {
      const key = playersCacheKey(game, null, null, "");
      if (hasPagedCache(key)) return;
      try {
        const rows = normalizePlayers(await api.get<Json>(endpoints.topPlayers(game, null, null, null, FIRST_PAGE, 0)))
          .sort((a, b) => ((b.rating ?? -1) - (a.rating ?? -1)) || a.id.localeCompare(b.id));
        primePagedCache(key, rows);
        void prefetchImages([...rows.map((p) => p.imageURL), ...rows.map((p) => p.teamLogoURL)]);
      } catch { /* the tab fetches on its own */ }
    })(),
    (async () => {
      const key = teamsCacheKey(game, "", null);
      if (hasPagedCache(key)) return;
      try {
        const rows = normalizeTeams(await api.get<Json>(endpoints.teams(game, null, FIRST_PAGE, 0, null)));
        primePagedCache(key, rows);
        void prefetchImages(rows.map((t) => t.logoURL));
      } catch { /* the tab fetches on its own */ }
    })(),
  ]));
}
