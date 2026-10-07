// features/matches/calendar-data.ts — CalendarScheduleViewModel as a hook.
// For the displayed month (plus a week each side): upcoming via the ranged
// feed (full feed as fallback) and completed via the range endpoint (a
// newest-first offset crawl as fallback). Results are merged into what we
// already hold, so other months stay populated while you page around.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, endpoints, errorMessage } from "@/lib/api";
import { normalizeMatches, matchResultTime, type Match } from "@/lib/types";
import { addDays, addMonths, dayKey, matchDayAnchor, startOfDay, startOfMonth } from "./shared";

export type DayLoad = "upcoming" | "completed" | "none";

export interface CalendarData {
  byDay: Map<string, Match[]>;
  loading: boolean;
  error: string | null;
  connectionProblem: boolean;
  /** Earliest completed match we hold — past days before this can't claim "nothing happened". */
  pastWindowStart: Date | null;
  reload: () => void;
}

const STALE_MS = 30_000;

async function fetchUpcoming(monthStart: Date, monthEnd: Date, signal: AbortSignal): Promise<Match[] | null> {
  const from = new Date(Math.max(Date.now() - 45 * 60e3, addDays(monthStart, -7).getTime()));
  const to = addDays(monthEnd, 7);
  try {
    return normalizeMatches(await api.get(endpoints.upcomingMatchesRange(from.toISOString(), to.toISOString()), { signal }));
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
  }
  try {
    return normalizeMatches(await api.get(endpoints.upcomingMatches, { signal }));
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return null;
  }
}

/** Completed matches covering the month around the anchor. Returns null when nothing could be fetched at all. */
async function fetchCompleted(monthStart: Date, monthEnd: Date, signal: AbortSignal): Promise<{ rows: Match[]; failed: unknown | null }> {
  const from = addDays(monthStart, -7);
  const to = addDays(monthEnd, 7);
  let failed: unknown | null = null;
  // First: the range endpoint.
  try {
    const ranged = normalizeMatches(await api.get(endpoints.completedMatchesRange(from.toISOString(), to.toISOString()), { signal }));
    if (ranged.length > 0) return { rows: ranged, failed: null };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    failed = e;
  }
  // Then: crawl pages newest-first until we're past the window (hard cap 600).
  const all: Match[] = [];
  let offset = 0;
  const page = 100;
  try {
    for (let i = 0; i < 6; i++) {
      const batch = normalizeMatches(await api.get(endpoints.completedMatches(null, page, offset), { signal }));
      if (batch.length === 0) break;
      all.push(...batch);
      offset += batch.length;
      const oldest = batch.map(matchResultTime).sort()[0];
      if (oldest && new Date(oldest) < from) break;
      if (batch.length < page) break;
    }
    failed = null;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    if (all.length === 0) failed = failed ?? e;
  }
  return { rows: all.filter((m) => new Date(matchResultTime(m)) >= from), failed };
}

function sortDay(matches: Match[]): Match[] {
  // Within a day: upcoming first (soonest at top), then completed most-recent-first.
  return matches.slice().sort((a, b) => {
    const aDone = a.status === "completed";
    const bDone = b.status === "completed";
    if (aDone !== bDone) return aDone ? 1 : -1;
    const ta = aDone ? matchResultTime(a) : a.scheduledAt;
    const tb = bDone ? matchResultTime(b) : b.scheduledAt;
    if (ta !== tb) return aDone ? (ta > tb ? -1 : 1) : (ta < tb ? -1 : 1);
    return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
  });
}

export function useCalendarData(monthAnchor: Date): CalendarData {
  const [byDay, setByDay] = useState<Map<string, Match[]>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [pastWindowStart, setPastWindowStart] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const lastLoaded = useRef<Map<string, number>>(new Map());
  const lastTick = useRef(0);
  const byDayRef = useRef(byDay);
  byDayRef.current = byDay;

  const monthKey = `${monthAnchor.getFullYear()}-${monthAnchor.getMonth()}`;

  useEffect(() => {
    const controller = new AbortController();
    const monthStart = startOfMonth(monthAnchor);
    const monthEnd = addMonths(monthStart, 1);
    const force = tick !== lastTick.current;   // an explicit reload skips the freshness check
    lastTick.current = tick;
    const last = lastLoaded.current.get(monthKey);
    if (!force && last && Date.now() - last < STALE_MS && byDayRef.current.size > 0) return;

    let active = true;
    if (byDayRef.current.size === 0) setLoading(true);
    setError(null);
    setConnectionProblem(false);

    (async () => {
      try {
        const [upcomingRes, completedRes] = await Promise.all([
          fetchUpcoming(monthStart, monthEnd, controller.signal),
          fetchCompleted(monthStart, monthEnd, controller.signal),
        ]);
        if (!active) return;
        const upcoming = upcomingRes ?? [];
        const completed = completedRes.rows;

        // Both feeds unreachable and nothing to show → an honest failure.
        if (upcomingRes === null && completedRes.failed && completed.length === 0) {
          if (byDayRef.current.size === 0) {
            setError(errorMessage(completedRes.failed));
            setConnectionProblem(completedRes.failed instanceof ApiError && completedRes.failed.isConnectionProblem);
          }
          setLoading(false);
          return;
        }
        // Keep-what-you-have: an empty pass must not wipe a populated calendar.
        if (upcoming.length === 0 && completed.length === 0 && byDayRef.current.size > 0) {
          setLoading(false);
          lastLoaded.current.set(monthKey, Date.now());
          return;
        }

        // DEDUPE by id — completed wins a collision.
        const seen = new Set<string>();
        const unique: Match[] = [];
        const staleCutoff = new Date(Date.now() - 45 * 60e3).toISOString();
        for (const m of [...completed, ...upcoming]) {
          if (m.status !== "completed" && m.scheduledAt < staleCutoff) continue;
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          unique.push(m);
        }

        // MERGE into what we already hold, rebuilding the touched days.
        const grouped = new Map(byDayRef.current);
        const freshDays = new Set(unique.map((m) => dayKey(matchDayAnchor(m))));
        for (const d of freshDays) grouped.set(d, []);
        for (const m of unique) grouped.get(dayKey(matchDayAnchor(m)))!.push(m);
        for (const [d, ms] of grouped) grouped.set(d, sortDay(ms));

        setByDay(grouped);
        const oldest = completed.map((m) => m.scheduledAt).sort()[0];
        setPastWindowStart(oldest ? startOfDay(new Date(oldest)) : null);
        lastLoaded.current.set(monthKey, Date.now());
        setLoading(false);
      } catch (e) {
        if (!active || (e instanceof DOMException && e.name === "AbortError")) return;
        if (byDayRef.current.size === 0) {
          setError(errorMessage(e));
          setConnectionProblem(e instanceof ApiError && e.isConnectionProblem);
        }
        setLoading(false);
      }
    })();

    return () => { active = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { byDay, loading, error, connectionProblem, pastWindowStart, reload };
}

export function dayLoadOf(matches: Match[] | undefined): DayLoad {
  if (!matches || matches.length === 0) return "none";
  return matches.some((m) => m.status !== "completed") ? "upcoming" : "completed";
}
