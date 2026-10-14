// features/matches/schedule-phone.tsx — the Schedule tab exactly as the
// iPhone app lays it out (ScheduleView.swift + CalendarScheduleView.swift):
//
//   TabHeader "Schedule" [calendar · avatar]
//   segmented picker  Upcoming | Results
//   GameTabBar
//   fixtures grouped by day under sticky date headers (UpcomingMatchCard)
//
// The calendar is a pushed screen (the violet calendar glyph in the header)
// reached here at /schedule?view=calendar: month header with chevrons,
// weekday row, 7-column day grid, a hairline, then the selected day.
// Desktop keeps the merged calendar + day layout in schedule.tsx.
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CalendarMinus, ChevronLeft, ChevronRight } from "lucide-react";
import { ConnectionErrorView, ErrorView, GameTabBar, Page, SkeletonMatchCard, Spinner, TabHeader, ToolButton } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { NavBar } from "@/components/shell/NavBar";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { gameLabel, normalizeMatches, type GameId, type Match, SELECTABLE_GAMES } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { useReveal } from "@/lib/use-reveal";
import { useAppState } from "@/store/app-state";
import { dayLoadOf, useCalendarData } from "./calendar-data";
import { CompletedMatchRow, UpcomingMatchCard } from "./cards";
import { DateSectionHeader, addDays, addMonths, calendarDayTitle, cleanUpcoming, dayKey, filterByGame, gameQuery, groupByDay, isSameLocalDay, parseDayKey, parseGameParam, scheduleDayLabel, sortUpcomingAsc, startOfDay, startOfMonth } from "./shared";

/** Two-way selection in the app's own style (the sidebar / tab-bar look):
 *  the chosen option sits in violet on a soft violet cloud, the other one is
 *  muted with no background, a gap between them. */
export function CloudSegment<T extends string>({ options, value, onChange, className }: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2", className)} role="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => { if (!selected) onChange(o.value); }}
            className={clsx("px-3.5 py-[7px] rounded-lg t-label-lg leading-none whitespace-nowrap transition-colors", selected ? "text-violet bg-violet/15" : "text-muted hover:text-primary")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The picker under the Schedule header (Upcoming | Results). */
export function ScheduleSegmentPicker({ value, game }: { value: "schedule" | "results"; game: GameId }) {
  const router = useRouter();
  return (
    <div className="px-4 pt-3 pb-2">
      <CloudSegment<"schedule" | "results">
        options={[{ label: "Upcoming", value: "schedule" }, { label: "Results", value: "results" }]}
        value={value}
        onChange={(v) => router.push(v === "schedule" ? `/schedule${gameQuery(game)}` : `/results${gameQuery(game)}`)}
      />
    </div>
  );
}

/** The header's calendar door — NavigationLink(destination: CalendarScheduleView()).
 *  `from` tells the calendar which face of the Schedule tab to return to. */
export function CalendarTool({ game, from = "schedule" }: { game: GameId; from?: "schedule" | "results" }) {
  const router = useRouter();
  return (
    <ToolButton label="Calendar" onClick={() => router.push(`/schedule${gameQuery(game, { view: "calendar", from: from === "results" ? "results" : null })}`)} className="text-violet hover:text-violet">
      <CalendarDays size={16} strokeWidth={2.5} />
    </ToolButton>
  );
}

/** ScheduleView's Upcoming segment on a phone. */
export function SchedulePhone({ game, setGame }: { game: GameId; setGame: (g: GameId) => void }) {
  // Consume a game filter handed over from Home's empty state (one-shot).
  const { pendingScheduleGame, setPendingScheduleGame } = useAppState();
  useEffect(() => {
    if (pendingScheduleGame !== null) { setGame(parseGameParam(pendingScheduleGame)); setPendingScheduleGame(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const feed = useFetch<Match[]>(async (signal) => cleanUpcoming(normalizeMatches(await api.get(endpoints.upcomingMatches, { signal }))), [], { cacheKey: "schedule:upcoming" });
  const matches = useMemo(() => filterByGame(feed.data ?? [], game), [feed.data, game]);
  const days = useMemo(() => {
    const grouped = groupByDay(matches, (m) => m.scheduledAt);
    return [...grouped.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, ms]) => ({ key, day: parseDayKey(key)!, matches: ms.slice().sort(sortUpcomingAsc) }));
  }, [matches]);
  const revealed = useReveal(feed.loading, () => matches.flatMap((m) => [m.team1LogoURL, m.team2LogoURL]));

  return (
    <Page>
      <TabHeader title="Schedule" tools={<HeaderTools extra={<CalendarTool game={game} />} />} />
      <ScheduleSegmentPicker value="schedule" game={game} />
      <GameTabBar selected={game} onChange={setGame} className="pt-2 pb-1" />

      {!revealed ? (
        <div className="flex flex-col gap-3 px-4 pt-2">{[0, 1, 2, 3, 4, 5].map((i) => <SkeletonMatchCard key={i} />)}</div>
      ) : feed.error && days.length === 0 ? (
        feed.connectionProblem ? <ConnectionErrorView onRetry={feed.reload} className="min-h-[60vh]" /> : <ErrorView message={feed.error} onRetry={feed.reload} className="pt-16" />
      ) : days.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 text-center min-h-[60vh] px-10">
          <CalendarDays size={40} className="text-muted" />
          <span className="t-headline-sm text-primary">No upcoming matches</span>
          <span className="t-body-sm text-muted">Scheduled matches will appear here.</span>
        </div>
      ) : (
        <div className="flex flex-col pt-1">
          {days.map(({ key, day, matches: ms }) => (
            <section key={key}>
              <DateSectionHeader label={scheduleDayLabel(day)} />
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 py-1.5 lg:grid-cols-2 lg:gap-x-6 items-stretch">
                {ms.map((m) => <UpcomingMatchCard key={m.id} match={m} className="h-full" />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

// ── CalendarScheduleView ───────────────────────────────────────────────────
function firstWeekday(): number {
  try {
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch { /* Sunday */ }
  return 0;
}

export function CalendarPhone({ game }: { game: GameId }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const today = startOfDay(new Date());
  const selectedDay = parseDayKey(params.get("date")) ?? today;
  const selectedKey = dayKey(selectedDay);
  const selectDay = (d: Date) => {
    const next = new URLSearchParams(params.toString());
    if (isSameLocalDay(d, today)) next.delete("date"); else next.set("date", dayKey(d));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const [monthOverride, setMonthOverride] = useState<{ forKey: string; month: Date } | null>(null);
  const displayedMonth = monthOverride && monthOverride.forKey === selectedKey ? monthOverride.month : startOfMonth(selectedDay);
  const shiftMonth = (delta: number) => setMonthOverride({ forKey: selectedKey, month: addMonths(displayedMonth, delta) });
  const [dayFilter, setDayFilter] = useState<{ forKey: string; game: string | null }>({ forKey: selectedKey, game: null });
  const dayGameFilter = dayFilter.forKey === selectedKey ? dayFilter.game : null;

  const data = useCalendarData(displayedMonth);
  const scoped = useMemo(() => {
    if (game === "all") return data.byDay;
    const out = new Map<string, Match[]>();
    for (const [k, ms] of data.byDay) { const f = filterByGame(ms, game); if (f.length) out.set(k, f); }
    return out;
  }, [data.byDay, game]);

  const first = useMemo(() => firstWeekday(), []);
  const symbols = useMemo(() => {
    const base = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" }));
    return [...base.slice(first), ...base.slice(0, first)];
  }, [first]);
  const monthKey = dayKey(displayedMonth);
  const cells = useMemo(() => {
    const start = startOfMonth(parseDayKey(monthKey) ?? new Date());
    const end = addMonths(start, 1);
    const leading = (start.getDay() - first + 7) % 7;
    const out: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (let d = new Date(start); d < end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [monthKey, first]);

  const dayMatchesAll = scoped.get(selectedKey) ?? [];
  const isPast = selectedDay < today;
  // Under the calendar: Upcoming | Results for the picked day, then the three games.
  const [segment, setSegment] = useState<{ forKey: string; value: "upcoming" | "results" } | null>(null);
  const daySegment: "upcoming" | "results" = segment && segment.forKey === selectedKey ? segment.value : (isPast ? "results" : "upcoming");
  const bySegment = dayMatchesAll.filter((m) => (daySegment === "results" ? m.status === "completed" : m.status !== "completed"));
  const dayMatches = dayGameFilter ? bySegment.filter((m) => m.game === dayGameFilter) : bySegment;
  const beyondWindow = isPast && data.pastWindowStart !== null && selectedDay < data.pastWindowStart;
  const n = dayMatchesAll.length;
  const title = game === "all" ? "Calendar" : `${gameLabel(game)} · Calendar`;
  // Back returns to the face of the Schedule tab the calendar was opened from.
  const backHref = params.get("from") === "results" ? `/results${gameQuery(game)}` : `/schedule${gameQuery(game)}`;

  return (
    <Page>
      <NavBar title={title} back={backHref} />
      <div className="flex flex-col gap-5 pt-2">
        {/* Month header: name + chevrons */}
        <div className="flex items-center px-3">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className="grid place-items-center size-10 text-secondary"><ChevronLeft size={16} strokeWidth={2.5} /></button>
          <span className="flex-1 text-center t-headline-md text-primary">{displayedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className="grid place-items-center size-10 text-secondary"><ChevronRight size={16} strokeWidth={2.5} /></button>
        </div>
        <div className="grid grid-cols-7 px-3">
          {symbols.map((s, i) => <span key={i} className="text-center text-[11px] font-semibold text-muted">{s}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1.5 px-3" role="grid">
          {cells.map((day, i) => {
            if (!day) return <span key={`pad-${i}`} className="h-11" />;
            const key = dayKey(day);
            const isSelected = key === selectedKey;
            const isToday = isSameLocalDay(day, today);
            const load = dayLoadOf(scoped.get(key));
            return (
              <button key={key} type="button" role="gridcell" aria-selected={isSelected} onClick={() => { selectDay(day); setDayFilter({ forKey: key, game: null }); }} className="flex flex-col items-center gap-1 h-11">
                <span className={clsx("grid place-items-center size-8 rounded-full font-rounded text-[15px]", isSelected ? "bg-violet text-bg font-bold" : "text-primary font-medium", !isSelected && isToday && "ring-[1.2px] ring-inset ring-violet")}>{day.getDate()}</span>
                <span className={clsx("size-1 rounded-full", load === "upcoming" ? "bg-violet" : load === "completed" ? "bg-muted" : "bg-transparent")} />
              </button>
            );
          })}
        </div>

        <div className="mx-4 hairline-b" />

        {/* Selected day */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 px-4">
            <span className="t-headline-sm text-primary">{calendarDayTitle(selectedDay)}</span>
            <span className="flex-1" />
            <span className="t-label-sm text-muted">{n > 0 ? `${n} match${n === 1 ? "" : "es"}` : ""}</span>
          </div>
          <div className="px-4 py-1">
            <CloudSegment<"upcoming" | "results">
              options={[{ label: "Upcoming", value: "upcoming" }, { label: "Results", value: "results" }]}
              value={daySegment}
              onChange={(v) => setSegment({ forKey: selectedKey, value: v })}
            />
          </div>
          <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar">
            {[null, ...SELECTABLE_GAMES.map((g) => g.id)].map((g) => {
              const sel = dayGameFilter === g;
              return (
                <button key={g ?? "all"} type="button" aria-pressed={sel} onClick={() => setDayFilter({ forKey: selectedKey, game: g })} className={clsx("shrink-0 px-3.5 py-[7px] rounded-[18px] t-label-md border", sel ? "bg-violet text-bg border-transparent" : "bg-card text-secondary border-border-subtle")}>
                  {g ? gameLabel(g) : "All"}
                </button>
              );
            })}
          </div>
          {data.loading && data.byDay.size === 0 ? (
            <div className="flex justify-center py-[30px]"><Spinner /></div>
          ) : dayMatches.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-7 text-center px-6">
              <CalendarMinus size={28} className="text-muted" />
              <span className="t-body-sm text-muted">{daySegment === "results" ? "No results recorded for this day" : "No matches scheduled this day"}</span>
              {beyondWindow ? <span className="t-label-sm text-muted">Results this far back aren&apos;t in our recent window yet.</span> : null}
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-4 lg:grid-cols-2 lg:gap-x-6 items-stretch">
              {dayMatches.map((m) => (m.status === "completed" ? <CompletedMatchRow key={m.id} match={m} className="h-full" /> : <UpcomingMatchCard key={m.id} match={m} className="h-full" />))}
            </div>
          )}
          <div className="h-[30px]" />
        </div>
      </div>
    </Page>
  );
}
