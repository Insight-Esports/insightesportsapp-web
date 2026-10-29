// archive/data.ts — the archive's three reads as hooks:
//   useArchiveMatches   GET /archive/matches, keyset paged with `cursor` (never
//                       offset), newest first
//   useArchiveYears     GET /archive/years
//   useArchiveCalendar  GET /archive/calendar
// Each one honours the paywall the backend can switch on (ARCHIVE_FREE_DAYS):
// a 403 PREMIUM_REQUIRED {free_days} falls back to the last N days with
// `freeDays` set (the screen shows the note), or `locked` when none of the
// request falls inside that window.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, endpoints, errorMessage, type ArchiveQuery } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { useAppState } from "@/store/app-state";
import { featureState } from "@/features/matches/live/feature-status";
import { narrowToWindow, normalizeArchiveDays, normalizeArchivePage, normalizeArchiveYears, premiumGateOf, utcDayKey, type ArchiveDay, type ArchiveFilters, type ArchiveMatch, type ArchiveYear } from "./types";

/** The `match_archive` switch: entry points hide and screens say so when it's off. */
export function useArchiveSwitch(): { off: boolean; message: string } {
  const { status } = useAppState();
  const s = featureState(status, "match_archive");
  return { off: s.off, message: s.message ?? "The match archive is temporarily unavailable." };
}

const toQuery = (f: ArchiveFilters): ArchiveQuery => ({ game: f.game, team: f.team, player: f.player, date: f.date, from: f.from, to: f.to });

interface ListState {
  rows: ArchiveMatch[];
  nextCursor: string | null;
  loaded: boolean;
  error: string | null;
  connectionProblem: boolean;
  /** The free window the list fell back to (403 PREMIUM_REQUIRED). */
  freeDays: number | null;
  /** Nothing of this request is inside the free window. */
  locked: boolean;
}
const EMPTY: ListState = { rows: [], nextCursor: null, loaded: false, error: null, connectionProblem: false, freeDays: null, locked: false };

export function useArchiveMatches(filters: ArchiveFilters | null, pageSize = 30) {
  const key = filters ? JSON.stringify(filters) : null;
  const [state, setState] = useState<ListState>(EMPTY);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const effective = useRef<ArchiveQuery | null>(null);
  const fetching = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!key) return;
    const f = JSON.parse(key) as ArchiveFilters;
    const controller = new AbortController();
    const signal = controller.signal;
    let active = true;
    setState(EMPTY);
    setMoreError(null);
    effective.current = null;
    fetching.current = true;
    (async () => {
      let query: ArchiveQuery = { ...toQuery(f), limit: pageSize };
      let freeDays: number | null = null;
      try {
        let raw: unknown;
        try {
          raw = await api.get(endpoints.archiveMatches(query), { signal });
        } catch (e) {
          const gate = premiumGateOf(e);
          if (!gate) throw e;
          const narrowed = gate.days ? narrowToWindow(f, gate.days) : null;
          if (!narrowed) {
            if (active) setState({ ...EMPTY, loaded: true, locked: true, freeDays: gate.days });
            return;
          }
          freeDays = gate.days;
          query = { ...toQuery(narrowed), limit: pageSize };
          raw = await api.get(endpoints.archiveMatches(query), { signal });
        }
        if (!active) return;
        const page = normalizeArchivePage(raw);
        effective.current = query;
        setState({ ...EMPTY, rows: page.matches, nextCursor: page.nextCursor, loaded: true, freeDays });
      } catch (e) {
        if (!active || (e instanceof DOMException && e.name === "AbortError")) return;
        // A second paywall answer (clock skew at the window's edge) shows the wall.
        const gate = premiumGateOf(e);
        if (gate) { setState({ ...EMPTY, loaded: true, locked: true, freeDays: gate.days }); return; }
        setState({ ...EMPTY, loaded: true, error: errorMessage(e), connectionProblem: e instanceof ApiError && e.isConnectionProblem });
      } finally {
        if (active) fetching.current = false;
      }
    })();
    return () => { active = false; controller.abort(); fetching.current = false; };
  }, [key, pageSize, tick]);

  const loadMore = useCallback(async () => {
    const cur = stateRef.current;
    const query = effective.current;
    if (fetching.current || !cur.nextCursor || !query) return;
    fetching.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = normalizeArchivePage(await api.get(endpoints.archiveMatches({ ...query, cursor: cur.nextCursor })));
      if (effective.current !== query) return;   // the filters moved on
      setState((prev) => {
        const known = new Set(prev.rows.map((m) => m.id));
        return { ...prev, rows: prev.rows.concat(page.matches.filter((m) => !known.has(m.id))), nextCursor: page.nextCursor };
      });
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      fetching.current = false;
      setLoadingMore(false);
    }
  }, []);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reachedEnd: state.loaded && !state.nextCursor, loadingMore, moreError, loadMore, reload };
}

export function useArchiveYears(f: { game?: string | null; team?: string | null; player?: string | null }, enabled = true) {
  return useFetch<ArchiveYear[]>(
    async (signal) => normalizeArchiveYears(await api.get(endpoints.archiveYears({ game: f.game, team: f.team, player: f.player }), { signal })),
    [f.game, f.team, f.player],
    { enabled, cacheKey: `archive:years:${f.game ?? ""}:${f.team ?? ""}:${f.player ?? ""}` },
  );
}

export interface CalendarData { days: ArchiveDay[]; freeDays: number | null; locked: boolean }

/** A year's day counts. Behind the paywall, the free window's matches are
 *  counted by day instead (the calendar itself answers 403 for older years). */
export function useArchiveCalendar(year: number, game: string | null, enabled = true) {
  return useFetch<CalendarData>(
    async (signal) => {
      try {
        return { days: normalizeArchiveDays(await api.get(endpoints.archiveCalendar(year, { game }), { signal })), freeDays: null, locked: false };
      } catch (e) {
        const gate = premiumGateOf(e);
        if (!gate) throw e;
        const narrowed = gate.days ? narrowToWindow({ game, from: `${year}-01-01`, to: `${year}-12-31` }, gate.days) : null;
        if (!narrowed) return { days: [], freeDays: gate.days, locked: true };
        const counts = new Map<string, number>();
        let cursor: string | null = null;
        for (let i = 0; i < 20; i++) {
          const page = normalizeArchivePage(await api.get(endpoints.archiveMatches({ ...toQuery(narrowed), limit: 100, cursor }), { signal }));
          for (const m of page.matches) { const k = utcDayKey(m.playedAt); counts.set(k, (counts.get(k) ?? 0) + 1); }
          cursor = page.nextCursor;
          if (!cursor) break;
        }
        const days = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, matches]) => ({ date, matches }));
        return { days, freeDays: gate.days, locked: false };
      }
    },
    [year, game],
    { enabled, cacheKey: `archive:calendar:${year}:${game ?? ""}` },
  );
}
