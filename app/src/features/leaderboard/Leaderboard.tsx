// Leaderboard — LeaderboardView.swift. Monthly / All Time windows over the
// points ledger, the monthly prize banner with its reset countdown, the
// top-3 podium, a striped ledger with rank · movement · player · points,
// and a pinned "your rank" bar when you're outside the visible board.
// Every row taps through to that user's profile.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Minus, Triangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, endpoints } from "@/lib/api";
import { bool, int, str, type Json } from "@/lib/types";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { CrownBadge, EmptyState, FilterSegment, InitialAvatar, LoadFailure, Page, SkeletonBar, Spinner } from "@/components/ui";

export interface LeaderboardEntry {
  id: string;
  rank: number;
  username: string;
  avatarURL: string | null;
  points: number;
  /** rank change since last snapshot (+up, -down, 0 none/new) */
  movement: number;
  isCurrentUser: boolean;
  isPremium: boolean;
}

type Period = "monthly" | "alltime";
const PERIODS: { label: string; value: Period }[] = [{ label: "Monthly", value: "monthly" }, { label: "All Time", value: "alltime" }];
const PAGE = 100;

function monthFraming() {
  const now = new Date();
  const monthLabel = now.toLocaleDateString(undefined, { month: "long" });
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(lastDay - now.getDate(), 0);
  return { monthLabel, resetLabel: daysLeft <= 1 ? "Resets tomorrow" : `Resets in ${daysLeft} days` };
}

export function Leaderboard() {
  const router = useRouter();
  const { user, status } = useAppState();
  const [period, setPeriod] = useState<Period>("monthly");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRow, setMyRow] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [tick, setTick] = useState(0);
  const myId = user?.id ?? "";

  const feature = status?.features?.leaderboard;
  const featureOff = typeof feature === "boolean" ? !feature : typeof feature === "string" ? feature === "off" : feature?.mode === "off";
  const featureMessage = typeof feature === "object" && feature ? feature.message : undefined;

  const toEntries = (raw: Json, offset: number): LeaderboardEntry[] => {
    const rows: Json[] = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
    return rows.map((row, idx) => ({
      id: str(row.user_id) ?? str(row.id) ?? `row-${offset + idx}`,
      // Positional rank: ties would all get server rank 1 — read 1,2,3…
      rank: offset + idx + 1,
      username: str(row.username) ?? "user",
      avatarURL: str(row.avatar_url),
      points: int(row.points) ?? 0,
      movement: int(row.movement) ?? 0,
      isCurrentUser: !!myId && str(row.user_id) === myId,
      isPremium: bool(row.is_premium),
    }));
  };

  // Switching periods clears the board IMMEDIATELY; a stale response for a
  // previous period never lands on the new tab.
  useEffect(() => {
    let active = true;
    setEntries([]); setMyRow(null); setLoading(true); setError(null);
    (async () => {
      try {
        const raw = await api.get<Json>(endpoints.leaderboardPeriod(period, PAGE, 0));
        if (!active) return;
        const list = toEntries(raw, 0);
        setEntries(list);
        setCanLoadMore(list.length >= PAGE);
        if (myId && !list.some((e) => e.isCurrentUser)) {
          try {
            const me = await api.get<Json>(endpoints.leaderboardMe(period));
            if (!active) return;
            setMyRow({ id: myId, rank: int(me?.rank) ?? 0, username: user?.username ?? "You", avatarURL: user?.avatarURL ?? null, points: int(me?.points) ?? 0, movement: 0, isCurrentUser: true, isPremium: !!user?.isPremium });
          } catch { setMyRow(null); }
        }
      } catch (e) {
        if (!active) return;
        setEntries([]);
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setConnectionProblem(!!(e as { isConnectionProblem?: boolean })?.isConnectionProblem);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, myId, tick]);

  async function loadMore() {
    if (!canLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const raw = await api.get<Json>(endpoints.leaderboardPeriod(period, PAGE, entries.length));
      const more = toEntries(raw, entries.length);
      setCanLoadMore(more.length >= PAGE);
      setEntries((prev) => [...prev, ...more.filter((m) => !prev.some((p) => p.id === m.id))]);
    } catch { /* keep what we have */ } finally { setLoadingMore(false); }
  }

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const framing = useMemo(() => monthFraming(), []);
  const pointsToNext = (e: LeaderboardEntry): number | null => {
    if (e.rank <= 1) return null;
    const above = entries.find((x) => x.rank === e.rank - 1);
    return above ? Math.max(above.points - e.points + 1, 0) : null;
  };
  const me = entries.find((e) => e.isCurrentUser) ?? null;

  return (
    <Page>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 hairline-b">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="grid place-items-center size-8 -ml-2 text-secondary hover:text-primary md:hidden"><ChevronLeft size={20} /></button>
        <span className="t-headline-sm text-primary flex-1">Leaderboard</span>
      </div>

      <div className="px-4 pt-3 max-w-3xl flex flex-col gap-3">
        <FilterSegment options={PERIODS} value={period} onChange={setPeriod} />

        {period !== "alltime" ? (
          <div className="flex flex-col gap-0.5 p-3.5 rounded-xl bg-card border border-border-subtle">
            <span className="t-label-lg text-primary">{framing.monthLabel} Prizes</span>
            <span className="t-label-sm text-muted">Top 3 win a reward · {framing.resetLabel}</span>
          </div>
        ) : null}

        {featureOff ? (
          <EmptyState className="!mx-0 mt-6" title="Temporarily unavailable" subtitle={featureMessage ?? "This feature is temporarily unavailable."} actionTitle="Try again" onAction={() => setTick((t) => t + 1)} />
        ) : loading ? (
          <LeaderboardSkeleton />
        ) : error ? (
          <LoadFailure error={error} connectionProblem={connectionProblem} onRetry={() => setTick((t) => t + 1)} />
        ) : entries.length === 0 ? (
          <EmptyState className="!mx-0 mt-10" title="No rankings yet" subtitle="Make predictions and vote in polls to earn points and climb the leaderboard." />
        ) : (
          <>
            <Podium entries={podium} />
            {rest.length > 0 ? (
              <div className="ledger">
                <div className="flex items-center gap-1 px-3 py-1.5 bg-surface/40 hairline-b t-label-sm text-muted">
                  <span className="w-7 text-center">#</span>
                  <span className="w-5" />
                  <span className="flex-1">PLAYER</span>
                  <span className="w-16 text-center">PTS</span>
                </div>
                {rest.map((e, i) => <Row key={e.id} entry={e} pointsToNext={pointsToNext(e)} isEven={i % 2 === 0} />)}
                {canLoadMore ? (
                  <button type="button" onClick={() => void loadMore()} className="w-full py-3 t-label-sm text-muted hover:text-primary hairline-t">{loadingMore ? <Spinner size={14} className="inline-block" /> : "Load more"}</button>
                ) : null}
              </div>
            ) : null}
            <div className="h-24" />
          </>
        )}
      </div>

      {myRow && !me ? (
        <div className="fixed bottom-[calc(var(--tabbar-h)+12px)] md:bottom-5 inset-x-4 md:left-[calc(var(--sidebar-w)+16px)] md:right-auto md:w-[min(720px,calc(100vw-var(--sidebar-w)-32px))] z-20">
          <YourRankBar entry={myRow} />
        </div>
      ) : null}
    </Page>
  );
}

function Movement({ movement }: { movement: number }) {
  if (movement > 0) return <span className="flex items-center gap-px text-success text-[9px] font-bold w-6"><Triangle size={7} className="fill-success" />{movement}</span>;
  if (movement < 0) return <span className="flex items-center gap-px text-error text-[9px] font-bold w-6"><Triangle size={7} className="fill-error rotate-180" />{Math.abs(movement)}</span>;
  return <span className="w-6 text-muted/60"><Minus size={9} /></span>;
}

function Row({ entry, pointsToNext, isEven }: { entry: LeaderboardEntry; pointsToNext: number | null; isEven: boolean }) {
  const inPrizeZone = entry.rank <= 3;
  return (
    <Link href={entry.isCurrentUser ? "/profile" : `/profile/${encodeURIComponent(entry.id)}`} className={clsx("relative flex items-center gap-1 px-3 py-[9px] hover:bg-surface/70 transition-colors", isEven ? "bg-card" : "bg-surface/50")}>
      {entry.isCurrentUser ? <span className="absolute left-0 inset-y-0 w-[3px] bg-violet" /> : null}
      <span className={clsx("w-7 text-center t-mono-sm", inPrizeZone ? "text-gold" : "text-muted")}>{entry.rank}</span>
      <span className="w-5"><Movement movement={entry.movement} /></span>
      <span className="flex items-center gap-2 flex-1 min-w-0">
        <InitialAvatar name={entry.username} imageURL={entry.avatarURL} size={28} />
        <span className="flex flex-col min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className={clsx("t-body-sm truncate", entry.isCurrentUser ? "text-violet" : "text-primary")}>{entry.username}</span>
            {entry.isPremium ? <CrownBadge /> : null}
            {entry.isCurrentUser ? <span className="text-[9px] font-bold text-violet px-1.5 py-0.5 rounded-full bg-surface border border-border-subtle">YOU</span> : null}
          </span>
          {entry.isCurrentUser && pointsToNext ? <span className="t-label-sm text-muted">{pointsToNext} pts to #{entry.rank - 1}</span> : null}
        </span>
      </span>
      <span className="w-16 text-center t-mono-sm text-primary">{entry.points}</span>
    </Link>
  );
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const col = (e: LeaderboardEntry, height: number, place: number) => {
    const accent = place === 1 ? "var(--gold)" : place === 2 ? "var(--text-secondary)" : "rgb(184 122 77)";
    return (
      <Link key={e.id} href={e.isCurrentUser ? "/profile" : `/profile/${encodeURIComponent(e.id)}`} className="flex flex-col items-center gap-1.5 flex-1 min-w-0 hover:opacity-90">
        <span className="rounded-full" style={{ boxShadow: `0 0 0 2px ${accent}` }}><InitialAvatar name={e.username} imageURL={e.avatarURL} size={place === 1 ? 60 : 50} /></span>
        <span className="flex items-center gap-1 max-w-full"><span className="t-label-md text-primary truncate">{e.username}</span>{e.isPremium ? <CrownBadge /> : null}</span>
        <span className="t-mono-sm text-primary">{e.points}</span>
        <span className="relative w-full rounded-lg bg-surface border border-border-subtle grid place-items-center" style={{ height }}>
          <span className="absolute top-1.5 inset-x-2.5 h-[3px] rounded-sm" style={{ background: accent }} />
          <span className="font-rounded text-[22px] font-black" style={{ color: accent }}>{place}</span>
        </span>
      </Link>
    );
  };
  return (
    <div className="flex items-end gap-2.5 pt-3 pb-2">
      {entries.length > 1 ? col(entries[1], 92, 2) : null}
      {entries.length > 0 ? col(entries[0], 116, 1) : null}
      {entries.length > 2 ? col(entries[2], 76, 3) : null}
    </div>
  );
}

function YourRankBar({ entry }: { entry: LeaderboardEntry }) {
  return (
    <Link href="/profile" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-violet/35 shadow-lg hover:brightness-110">
      <span className="t-mono-md text-violet min-w-10">#{entry.rank}</span>
      <InitialAvatar name={entry.username} imageURL={entry.avatarURL} size={36} />
      <span className="flex flex-col flex-1"><span className="t-body-md text-primary">You</span></span>
      <span className="t-mono-md text-primary">{entry.points} pts</span>
    </Link>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <SkeletonBar width={28} height={14} />
          <span className="size-11 rounded-full bg-surface shrink-0" />
          <SkeletonBar width={120} height={12} />
          <span className="flex-1" />
          <SkeletonBar width={50} height={12} />
        </div>
      ))}
    </div>
  );
}
