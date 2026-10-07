// features/matches/calendar.tsx — the month grid from CalendarScheduleView
// (quiet grid, violet only where it informs: selection, today's ring,
// upcoming-day dots) plus a compact day strip for phones.
"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "@/lib/format";
import { type DayLoad } from "./calendar-data";
import { addDays, addMonths, dayKey, isSameLocalDay, startOfMonth } from "./shared";

/** 0 = Sunday … 6 = Saturday, from the browser locale when it says. */
function firstWeekday(): number {
  try {
    if (typeof navigator === "undefined") return 0;
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;   // Intl: 1 = Mon … 7 = Sun
  } catch { /* fall through */ }
  return 0;
}
/** Narrow weekday symbols rotated to the locale's first weekday. */
function weekdaySymbols(first: number): string[] {
  const base = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" })); // Jan 1 2023 = Sunday
  return [...base.slice(first), ...base.slice(0, first)];
}

function DayDot({ load }: { load: DayLoad }) {
  return <span className={clsx("size-1 rounded-full", load === "upcoming" ? "bg-violet" : load === "completed" ? "bg-muted" : "bg-transparent")} />;
}

function DayNumber({ day, selected, today }: { day: Date; selected: boolean; today: boolean }) {
  return (
    <span
      className={clsx(
        "grid place-items-center size-8 rounded-full font-rounded text-[15px] transition-colors",
        selected ? "bg-violet text-bg font-bold" : "text-primary font-medium",
        !selected && today && "ring-[1.2px] ring-inset ring-violet",
      )}
    >
      {day.getDate()}
    </span>
  );
}

export interface CalendarProps {
  selected: Date;
  onSelect: (day: Date) => void;
  dayLoad: (key: string) => DayLoad;
  className?: string;
}

export function MonthGrid({ month, onShiftMonth, selected, onSelect, dayLoad, className }: CalendarProps & { month: Date; onShiftMonth: (delta: number) => void }) {
  const first = useMemo(() => firstWeekday(), []);
  const symbols = useMemo(() => weekdaySymbols(first), [first]);
  const today = new Date();
  const cells = useMemo(() => {
    const start = startOfMonth(month);
    const end = addMonths(start, 1);
    const leading = (start.getDay() - first + 7) % 7;
    const out: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (let d = new Date(start); d < end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month, first]);
  const title = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className={clsx("flex flex-col gap-4", className)}>
      <div className="flex items-center">
        <button type="button" onClick={() => onShiftMonth(-1)} aria-label="Previous month" className="grid place-items-center size-10 rounded-lg text-secondary hover:text-primary hover:bg-surface/60 transition-colors"><ChevronLeft size={16} /></button>
        <span className="flex-1 text-center t-headline-md text-primary">{title}</span>
        <button type="button" onClick={() => onShiftMonth(1)} aria-label="Next month" className="grid place-items-center size-10 rounded-lg text-secondary hover:text-primary hover:bg-surface/60 transition-colors"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7">
        {symbols.map((s, i) => <span key={i} className="text-center text-[11px] font-semibold text-muted">{s}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1.5" role="grid">
        {cells.map((day, i) => {
          if (!day) return <span key={`pad-${i}`} className="h-11" />;
          const key = dayKey(day);
          const isSelected = isSameLocalDay(day, selected);
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              onClick={() => onSelect(day)}
              className="flex flex-col items-center gap-1 h-11 rounded-lg hover:bg-surface/60 transition-colors"
            >
              <DayNumber day={day} selected={isSelected} today={isSameLocalDay(day, today)} />
              <DayDot load={dayLoad(key)} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Phones: three weeks around today in one scroll strip (re-centred on the
 *  selected day when a shared ?date= lands outside that window). */
export function DayStrip({ selected, onSelect, dayLoad, className, before = 7, after = 13 }: CalendarProps & { before?: number; after?: number }) {
  const today = new Date();
  const selectedKey = dayKey(selected);
  const days = useMemo(() => {
    const now = new Date();
    const offset = Math.round((selected.getTime() - now.getTime()) / 864e5);
    const base = offset < -before || offset > after ? selected : now;
    return Array.from({ length: before + after + 1 }, (_, i) => addDays(base, i - before));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [before, after, selectedKey]);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [selectedKey]);

  return (
    <div className={clsx("flex gap-1 overflow-x-auto no-scrollbar -mx-4 px-4", className)}>
      {days.map((day) => {
        const key = dayKey(day);
        const isSelected = key === selectedKey;
        return (
          <button
            key={key}
            ref={isSelected ? selectedRef : undefined}
            type="button"
            aria-pressed={isSelected}
            aria-label={day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            onClick={() => onSelect(day)}
            className="flex flex-col items-center gap-1 w-12 shrink-0 py-1 rounded-lg hover:bg-surface/60 transition-colors"
          >
            <span className="text-[11px] font-semibold text-muted">{day.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
            <DayNumber day={day} selected={isSelected} today={isSameLocalDay(day, today)} />
            <DayDot load={dayLoad(key)} />
          </button>
        );
      })}
    </div>
  );
}
