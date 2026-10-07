// features/matches/shared.tsx — bits the Live, Schedule and Results screens
// share: the ?game= URL filter, local-day math + the app's day labels, the
// sticky date header, and the Schedule · Results segment that makes the two
// routes feel like the one Schedule tab they are in the app.
"use client";

import { useCallback, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterSegment } from "@/components/ui";
import { clsx } from "@/lib/format";
import { GAMES, type GameId, type Match, matchResultTime } from "@/lib/types";

// ── ?game= ────────────────────────────────────────────────────────────────
export function parseGameParam(v: string | null | undefined): GameId {
  if (!v) return "all";
  const needle = v.toLowerCase();
  const found = GAMES.find((g) => g.id.toLowerCase() === needle || g.label.toLowerCase() === needle);
  return found?.id ?? "all";
}

/** Game filter mirrored into the URL so the view is shareable (replace, no scroll). */
export function useGameParam(): [GameId, (g: GameId) => void] {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const game = parseGameParam(params.get("game"));
  const setGame = useCallback((g: GameId) => {
    const next = new URLSearchParams(params.toString());
    if (g === "all") next.delete("game"); else next.set("game", g);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  return [game, setGame];
}

/** Query string that carries the game across Schedule ↔ Results ↔ Home. */
export function gameQuery(game: GameId, extra: Record<string, string | null | undefined> = {}): string {
  const p = new URLSearchParams();
  if (game !== "all") p.set("game", game);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function filterByGame<T extends { game: string }>(items: T[], game: GameId): T[] {
  return game === "all" ? items : items.filter((m) => m.game === game);
}

// ── Local-day math (Calendar.current.startOfDay & co.) ────────────────────
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
/** "YYYY-MM-DD" in local time — the ?date= format and the byDay key. */
export function dayKey(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${mm}-${dd}`;
}
export function parseDayKey(key: string | null | undefined): Date | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const LONG_DAY: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric" };
const DAY_WITH_YEAR: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/** ScheduleViewModel.dayLabel: Today · Tomorrow · "Monday, Oct 6" · "Oct 6, 2025". */
export function scheduleDayLabel(day: Date, now = new Date()): string {
  if (isSameLocalDay(day, now)) return "Today";
  if (isSameLocalDay(day, addDays(now, 1))) return "Tomorrow";
  return day.toLocaleDateString(undefined, day.getFullYear() === now.getFullYear() ? LONG_DAY : DAY_WITH_YEAR);
}
/** ResultsViewModel.dayLabel: Today · Yesterday · "Monday, Oct 6" · "Oct 6, 2025". */
export function resultsDayLabel(day: Date, now = new Date()): string {
  if (isSameLocalDay(day, now)) return "Today";
  if (isSameLocalDay(day, addDays(now, -1))) return "Yesterday";
  return day.toLocaleDateString(undefined, day.getFullYear() === now.getFullYear() ? LONG_DAY : DAY_WITH_YEAR);
}
/** CalendarScheduleView.dayTitle: Today · Tomorrow · Yesterday · "Monday, Oct 6". */
export function calendarDayTitle(day: Date, now = new Date()): string {
  if (isSameLocalDay(day, now)) return "Today";
  if (isSameLocalDay(day, addDays(now, 1))) return "Tomorrow";
  if (isSameLocalDay(day, addDays(now, -1))) return "Yesterday";
  return day.toLocaleDateString(undefined, LONG_DAY);
}

/** Results sit on the day they ENDED; fixtures on their start. */
export function matchDayAnchor(m: Match): string {
  return m.status === "completed" ? matchResultTime(m) : m.scheduledAt;
}

/** Group matches by local day key. */
export function groupByDay(matches: Match[], anchor: (m: Match) => string = matchDayAnchor): Map<string, Match[]> {
  const out = new Map<string, Match[]>();
  for (const m of matches) {
    const k = dayKey(anchor(m));
    const arr = out.get(k);
    if (arr) arr.push(m); else out.set(k, [m]);
  }
  return out;
}

/** Stable newest-first order (resultTime desc, id desc) — the Results rule. */
export function sortResultsDesc(a: Match, b: Match): number {
  const ta = matchResultTime(a); const tb = matchResultTime(b);
  if (ta !== tb) return ta > tb ? -1 : 1;
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
}
/** Soonest-first order for fixtures (scheduledAt asc, id desc tiebreak). */
export function sortUpcomingAsc(a: Match, b: Match): number {
  if (a.scheduledAt !== b.scheduledAt) return a.scheduledAt < b.scheduledAt ? -1 : 1;
  return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
}

/** Drop stale "upcoming" rows (>45 min past start) and duplicate ids. */
export function cleanUpcoming(matches: Match[], now = Date.now()): Match[] {
  const cutoff = new Date(now - 45 * 60e3).toISOString();
  const seen = new Set<string>();
  return matches.filter((m) => {
    if (m.scheduledAt <= cutoff) return false;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

// ── Chrome shared by Schedule + Results ───────────────────────────────────
/** Sticky day header (ScheduleDateHeader / DateSectionHeader). */
export function DateSectionHeader({ label, className }: { label: string; className?: string }) {
  return (
    <div className={clsx("sticky top-0 z-10 flex items-center px-5 py-2 bg-bg/[.98] backdrop-blur-sm", className)}>
      <span className="t-label-md text-secondary">{label}</span>
    </div>
  );
}

export type ScheduleSegment = "schedule" | "results";

/** The segment under the Schedule header: the app's one Schedule tab has
 *  two faces, so /schedule and /results share this control and carry the
 *  game filter across. */
export function ScheduleTabs({ value, game, className }: { value: ScheduleSegment; game: GameId; className?: string }) {
  const router = useRouter();
  const go = (v: ScheduleSegment) => {
    if (v === value) return;
    router.push(v === "schedule" ? `/schedule${gameQuery(game)}` : `/results${gameQuery(game)}`);
  };
  return (
    <div className={clsx("px-4 pt-2 pb-1", className)}>
      <FilterSegment<ScheduleSegment>
        options={[{ label: "Schedule", value: "schedule" }, { label: "Results", value: "results" }]}
        value={value}
        onChange={go}
      />
    </div>
  );
}

/** A section's cards: one column on phones, two from md when asked. */
export function CardGrid({ children, columns = 1, className }: { children: ReactNode; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <div className={clsx("grid gap-3 items-start", columns >= 2 && "md:grid-cols-2", columns === 3 && "xl:grid-cols-3", className)}>
      {children}
    </div>
  );
}
