// features/matches/schedule.tsx — ScheduleView + CalendarScheduleView as one
// screen at /schedule?game=&date=. The calendar (month grid on desktop, day
// strip on phones, month grid on demand) picks a day; that day's fixtures
// and results sit beside it. Consumes Home's pendingScheduleGame handoff.
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, CalendarMinus } from "lucide-react";
import { EmptyState, FilterSegment, GameTabBar, LoadFailure, Page, SkeletonMatchCard, TabHeader, ToolButton } from "@/components/ui";
import { HeaderTools } from "@/components/shell/AppShell";
import { clsx } from "@/lib/format";
import { gameLabel, type Match } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { dayLoadOf, useCalendarData } from "./calendar-data";
import { DayStrip, MonthGrid } from "./calendar";
import { CompletedMatchRow, UpcomingMatchCard } from "./cards";
import { CardGrid, ScheduleTabs, calendarDayTitle, dayKey, filterByGame, isSameLocalDay, parseDayKey, parseGameParam, startOfDay, startOfMonth, useGameParam } from "./shared";

export function ScheduleScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { pendingScheduleGame, setPendingScheduleGame } = useAppState();
  const [game, setGame] = useGameParam();

  // Consume a game filter handed over from Home's empty state (one-shot).
  useEffect(() => {
    if (pendingScheduleGame !== null) {
      setGame(parseGameParam(pendingScheduleGame));
      setPendingScheduleGame(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = startOfDay(new Date());
  const selectedDay = parseDayKey(params.get("date")) ?? today;
  const selectedKey = dayKey(selectedDay);
  const selectDay = (d: Date) => {
    const next = new URLSearchParams(params.toString());
    const k = dayKey(d);
    if (isSameLocalDay(d, today)) next.delete("date"); else next.set("date", k);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // The month on display follows the selected day (URL) unless the user
  // pages the grid; paging never moves the selection.
  const [monthOverride, setMonthOverride] = useState<{ forKey: string; month: Date } | null>(null);
  const displayedMonth = monthOverride && monthOverride.forKey === selectedKey ? monthOverride.month : startOfMonth(selectedDay);
  const shiftMonth = (delta: number) => setMonthOverride({ forKey: selectedKey, month: new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + delta, 1) });

  const [showMonthOnPhone, setShowMonthOnPhone] = useState(false);
  // Per-day game filter — nil = all games that day; resets when the day changes.
  const [dayFilter, setDayFilter] = useState<{ forKey: string; game: string | null }>({ forKey: selectedKey, game: null });
  const dayGameFilter = dayFilter.forKey === selectedKey ? dayFilter.game : null;
  const setDayGameFilter = (g: string | null) => setDayFilter({ forKey: selectedKey, game: g });

  const data = useCalendarData(displayedMonth);

  // Scope the calendar to the tab's game (client-side, like the app's CalendarScope).
  const scoped = useMemo(() => {
    if (game === "all") return data.byDay;
    const out = new Map<string, Match[]>();
    for (const [k, ms] of data.byDay) {
      const f = filterByGame(ms, game);
      if (f.length) out.set(k, f);
    }
    return out;
  }, [data.byDay, game]);
  const dayLoad = (key: string) => dayLoadOf(scoped.get(key));

  const dayMatchesAll: Match[] = scoped.get(selectedKey) ?? [];
  // Distinct games present on the day, stable order.
  const dayGames: string[] = [];
  for (const m of dayMatchesAll) if (!dayGames.includes(m.game)) dayGames.push(m.game);
  const dayMatches = dayGameFilter ? dayMatchesAll.filter((m) => m.game === dayGameFilter) : dayMatchesAll;
  const isPast = selectedDay < today;
  const n = dayMatchesAll.length;
  const dayCount = n > 0 ? `${n} match${n === 1 ? "" : "es"}` : "";
  const beyondWindow = isPast && data.pastWindowStart !== null && selectedDay < data.pastWindowStart;

  const calendarProps = { selected: selectedDay, onSelect: selectDay, dayLoad };
  const showSkeleton = data.loading && data.byDay.size === 0;

  return (
    <Page>
      <TabHeader
        title="Schedule"
        tools={
          <HeaderTools
            extra={
              <ToolButton label={showMonthOnPhone ? "Hide month" : "Show month"} onClick={() => setShowMonthOnPhone((v) => !v)} className={clsx("lg:hidden", showMonthOnPhone && "text-violet")}>
                <CalendarDays size={18} />
              </ToolButton>
            }
          />
        }
      />
      <ScheduleTabs value="schedule" game={game} />
      <GameTabBar selected={game} onChange={setGame} className="pt-2 pb-1" />

      <div className="grid gap-5 px-4 pt-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-6 items-start">
        {/* ── Calendar ── */}
        <div className="min-w-0 lg:sticky lg:top-4">
          <div className={clsx("hidden lg:block lg:rounded-xl lg:border lg:border-hairline lg:bg-card lg:p-3")}>
            <MonthGrid month={displayedMonth} onShiftMonth={shiftMonth} {...calendarProps} />
          </div>
          <div className="lg:hidden">
            {showMonthOnPhone ? (
              <MonthGrid month={displayedMonth} onShiftMonth={shiftMonth} {...calendarProps} />
            ) : (
              <DayStrip {...calendarProps} />
            )}
          </div>
        </div>

        {/* ── Selected day ── */}
        <section className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="t-headline-sm text-primary">{calendarDayTitle(selectedDay)}</h2>
            <span className="flex-1" />
            <span className="t-label-sm text-muted">{dayCount}</span>
          </div>

          {/* Game chips only when the day actually MIXES games. */}
          {dayGames.length > 1 ? (
            <FilterSegment<string>
              options={[{ label: "All", value: "" }, ...dayGames.map((g) => ({ label: gameLabel(g), value: g }))]}
              value={dayGameFilter ?? ""}
              onChange={(v) => setDayGameFilter(v || null)}
              gap="gap-5"
            />
          ) : null}

          {showSkeleton ? (
            <CardGrid columns={2}>{[0, 1, 2].map((i) => <SkeletonMatchCard key={i} />)}</CardGrid>
          ) : data.error && data.byDay.size === 0 ? (
            <LoadFailure error={data.error} connectionProblem={data.connectionProblem} onRetry={data.reload} />
          ) : dayMatches.length === 0 ? (
            <EmptyState
              icon={<CalendarMinus />}
              title={isPast ? "No results recorded for this day" : "No matches scheduled this day"}
              subtitle={beyondWindow ? "Results this far back aren't in our recent window yet." : undefined}
              className="!mx-0"
            />
          ) : (
            <CardGrid columns={2}>
              {dayMatches.map((m) => (m.status === "completed" ? <CompletedMatchRow key={m.id} match={m} /> : <UpcomingMatchCard key={m.id} match={m} />))}
            </CardGrid>
          )}
        </section>
      </div>
    </Page>
  );
}
