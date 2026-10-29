// ArchiveYear — Archive.swift's year page at /archive/[year]?game=: the year
// as a month-by-month calendar. Days with matches are links to the day page
// and show their count. Same grid grammar as the Schedule calendar
// (narrow weekday row, 7 columns, rounded day numbers), keyed on UTC days
// the way the backend files matches.
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { EmptyState, GameTabBar, LoadFailure, Page, SkeletonBar } from "@/components/ui";
import { NavBar } from "@/components/shell/NavBar";
import { clsx } from "@/lib/format";
import { gameLabel } from "@/lib/types";
import { useGameParam } from "@/features/matches/shared";
import { useArchiveCalendar, useArchiveSwitch } from "./data";
import { ArchiveGlyph, ArchiveOff, PremiumWall, PremiumWindowNote, archiveDayHref, archiveHomeHref } from "./shared";
import { formatUtc, freeWindowStart, utcDayKey } from "./types";

/** 0 = Sunday … 6 = Saturday, from the browser locale when it says (as the Schedule calendar). */
function firstWeekday(): number {
  try {
    if (typeof navigator === "undefined") return 0;
    const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info?.firstDay) return info.firstDay % 7;
  } catch { /* Sunday */ }
  return 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function ArchiveYear({ year }: { year: number }) {
  const [game, setGame] = useGameParam();
  const gameArg = game === "all" ? null : game;
  const archive = useArchiveSwitch();
  const valid = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const cal = useArchiveCalendar(year, gameArg, valid && !archive.off);
  const counts = useMemo(() => new Map((cal.data?.days ?? []).map((d) => [d.date, d.matches])), [cal.data]);
  const total = useMemo(() => (cal.data?.days ?? []).reduce((s, d) => s + d.matches, 0), [cal.data]);

  // Every month of a past year; this year up to the current month. Behind the
  // paywall, only the months the free window reaches.
  const now = new Date();
  const lastMonth = year === now.getUTCFullYear() ? now.getUTCMonth() : year > now.getUTCFullYear() ? -1 : 11;
  const windowStart = cal.data?.freeDays ? freeWindowStart(cal.data.freeDays, now.getTime()) : null;
  const firstMonth = windowStart && Number(windowStart.slice(0, 4)) === year ? Number(windowStart.slice(5, 7)) - 1 : 0;
  const months = Array.from({ length: Math.max(0, lastMonth - firstMonth + 1) }, (_, i) => firstMonth + i);
  const first = useMemo(() => firstWeekday(), []);
  const symbols = useMemo(() => {
    const base = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" }));
    return [...base.slice(first), ...base.slice(0, first)];
  }, [first]);
  const todayKey = utcDayKey(now);
  const title = game === "all" ? String(year) : `${gameLabel(game)} · ${year}`;

  let content;
  if (archive.off) content = <ArchiveOff message={archive.message} />;
  else if (!valid) content = <EmptyState icon={<ArchiveGlyph />} title="Content not found." />;
  else if (cal.loading && !cal.data) content = <MonthsSkeleton />;
  else if (cal.error && !cal.data) content = <LoadFailure error={cal.error} connectionProblem={cal.connectionProblem} onRetry={cal.reload} />;
  else if (cal.data?.locked) content = <PremiumWall />;
  else if (total === 0) content = (
    <>
      {cal.data?.freeDays ? <PremiumWindowNote days={cal.data.freeDays} className="mb-4" /> : null}
      <EmptyState icon={<ArchiveGlyph />} title={`No matches in ${year}`} subtitle="Try another year or game." />
    </>
  );
  else content = (
    <>
      {cal.data?.freeDays ? <PremiumWindowNote days={cal.data.freeDays} className="mb-5" /> : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 px-4 md:grid-cols-2 xl:grid-cols-3">
        {months.map((month) => {
          const monthKey = `${year}-${pad(month + 1)}`;
          const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
          const leading = (new Date(Date.UTC(year, month, 1)).getUTCDay() - first + 7) % 7;
          let monthTotal = 0;
          for (let d = 1; d <= days; d++) monthTotal += counts.get(`${monthKey}-${pad(d)}`) ?? 0;
          return (
            <section key={monthKey} className="flex flex-col gap-2.5 min-w-0" aria-label={formatUtc(`${monthKey}-01T00:00:00Z`, { month: "long", year: "numeric" })}>
              <div className="flex items-baseline px-1">
                <span className="t-headline-sm text-primary">{formatUtc(`${monthKey}-01T00:00:00Z`, { month: "long" })}</span>
                <span className="flex-1" />
                <span className="t-label-sm text-muted">{monthTotal > 0 ? `${monthTotal.toLocaleString()} ${monthTotal === 1 ? "match" : "matches"}` : ""}</span>
              </div>
              <div className="grid grid-cols-7">
                {symbols.map((s, i) => <span key={i} className="text-center text-[11px] font-semibold text-muted">{s}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-1" role="grid">
                {Array.from({ length: leading }, (_, i) => <span key={`pad-${i}`} className="h-12" />)}
                {Array.from({ length: days }, (_, i) => {
                  const key = `${monthKey}-${pad(i + 1)}`;
                  const n = counts.get(key) ?? 0;
                  const isToday = key === todayKey;
                  if (n === 0) {
                    return (
                      <span key={key} role="gridcell" className="flex flex-col items-center gap-0.5 h-12">
                        <span className={clsx("grid place-items-center size-8 rounded-full font-rounded text-[15px] font-medium text-muted/45", isToday && "ring-[1.2px] ring-inset ring-violet")}>{i + 1}</span>
                      </span>
                    );
                  }
                  return (
                    <Link
                      key={key}
                      href={archiveDayHref(key, game)}
                      role="gridcell"
                      aria-label={`${formatUtc(`${key}T00:00:00Z`, { weekday: "long", month: "long", day: "numeric" })}, ${n} ${n === 1 ? "match" : "matches"}`}
                      className="group flex flex-col items-center gap-0.5 h-12 rounded-lg hover:bg-surface/60 transition-colors"
                    >
                      <span className={clsx("grid place-items-center size-8 rounded-full font-rounded text-[15px] font-semibold text-primary group-hover:bg-violet/15 transition-colors", isToday && "ring-[1.2px] ring-inset ring-violet")}>{i + 1}</span>
                      <span className="text-[10px] leading-none font-semibold text-violet tabular-nums">{n}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );

  return (
    <Page>
      <NavBar title={title} back={archiveHomeHref(game)} />
      <GameTabBar selected={game} onChange={setGame} className="pt-3 pb-1" />
      <div className="flex items-center px-4 pt-3 pb-4 t-label-md text-muted min-h-[20px]">
        {cal.data && !cal.data.locked && total > 0 ? `${total.toLocaleString()} ${total === 1 ? "match" : "matches"}${cal.data.freeDays ? "" : ` in ${year}`}` : null}
      </div>
      {content}
    </Page>
  );
}

function MonthsSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-7 px-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((m) => (
        <div key={m} className={clsx("flex flex-col gap-3", m > 1 && "max-md:hidden", m > 3 && "max-xl:hidden")}>
          <SkeletonBar width={90} height={14} />
          <div className="grid grid-cols-7 gap-y-3 justify-items-center">
            {Array.from({ length: 35 }, (_, i) => <span key={i} className="size-7 rounded-full bg-surface" />)}
          </div>
        </div>
      ))}
    </div>
  );
}
