// Leaderboard — LeaderboardView.swift. Monthly / All Time windows over the
// points ledger, the monthly prize banner with its reset countdown (UTC:
// the boards are calendar periods resetting on the 1st 00:00 UTC), the
// top-3 podium with gold / silver / bronze rank rings, a striped ledger with
// rank · movement (from previous_rank) · player · points and "N pts to #k"
// on every row, and a pinned "your rank" bar when you're outside the
// visible board. Names wear Premium flair (still in rows, moving on the
// podium) and the ORACLE word. Every row taps through to that profile.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Minus, Triangle } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { bool, int, normalizePremiumStyle, normalizeTitle, str, type Json, type PremiumStylePiece } from "@/lib/types";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { EmptyState, FilterSegment, LoadFailure, Page, Spinner } from "@/components/ui";
import { FlairAvatar, FlairName, METALS, setPodiumFromRows } from "@/components/ui/premium-flair";
import { SkeletonLeaderboard } from "@/components/ui/skeletons";
import { NavBar } from "@/components/shell/NavBar";
import { useReveal } from "@/lib/use-reveal";

export interface LeaderboardEntry {
  id: string;
  rank: number;
  username: string;
  avatarURL: string | null;
  points: number;
  /** rank change since yesterday's snapshot (+up, -down, 0 none/new) */
  movement: number;
  isCurrentUser: boolean;
  isPremium: boolean;
  premiumStyle: PremiumStylePiece[] | null;
  /** 'oracle' on the live monthly #1 */
  title?: string | null;
}

type Period = "monthly" | "alltime";
const PERIODS: { label: string; value: Period }[] = [{ label: "Monthly", value: "monthly" }, { label: "All Time", value: "alltime" }];
const PAGE = 100;

/** Month name + reset countdown, in UTC (the board resets on the 1st at
 *  00:00 UTC — local time was wrong from ~5pm PT on the last day). */
export function monthFraming(now: Date = new Date()) {
  const monthLabel = now.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" });
  const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const hours = (reset - now.getTime()) / 36e5;
  const resetLabel =
    hours >= 48 ? `Resets in ${Math.floor(hours / 24)} days`
    : hours >= 24 ? "Resets tomorrow"
    : hours >= 1 ? `Resets in ${Math.floor(hours)}h`
    : "Resets within the hour";
  return { monthLabel, resetLabel };
}

/** "1 pt" · "N pts" */
export function ptsLabel(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? "pt" : "pts"}`;
}

export function Leaderboard() {
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
    return rows.map((row, idx) => {
      // Positional rank: ties would all get server rank 1 — read 1,2,3…
      const rank = offset + idx + 1;
      // Movement compares like with like: the snapshot's RANK() against
      // today's server RANK() (positional would invent moves among ties).
      const previous = int(row.previous_rank);
      const serverRank = int(row.rank) ?? rank;
      return {
        id: str(row.user_id) ?? str(row.id) ?? `row-${offset + idx}`,
        rank,
        username: str(row.username) ?? "user",
        avatarURL: str(row.avatar_url),
        points: int(row.points) ?? 0,
        movement: previous !== null && previous > 0 ? previous - serverRank : int(row.movement) ?? 0,
        isCurrentUser: !!myId && str(row.user_id) === myId,
        isPremium: bool(row.is_premium),
        premiumStyle: normalizePremiumStyle(row.premium_style),
        title: normalizeTitle(row.title),
      };
    });
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
        // Every monthly load refreshes who wears gold / silver / bronze.
        if (period === "monthly") setPodiumFromRows(raw);
        const list = toEntries(raw, 0);
        setEntries(list);
        setCanLoadMore(list.length >= PAGE);
        if (myId && !list.some((e) => e.isCurrentUser)) {
          try {
            const me = await api.get<Json>(endpoints.leaderboardMe(period));
            if (!active) return;
            setMyRow({ id: myId, rank: int(me?.rank) ?? 0, username: user?.username ?? "You", avatarURL: user?.avatarURL ?? null, points: int(me?.points) ?? 0, movement: 0, isCurrentUser: true, isPremium: !!user?.isPremium, premiumStyle: user?.premiumStyle ?? null, title: user?.title });
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

  // LeaderboardView: the board (and your own row) land, the first page's
  // avatars warm, then podium + rows appear together. Period switches clear
  // the board and start again.
  const revealed = useReveal(loading, () => [...entries.map((e) => e.avatarURL), myRow?.avatarURL]);

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  // The countdown re-reads the clock every minute.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const framing = useMemo(() => monthFraming(new Date(now)), [now]);
  const pointsToNext = (e: LeaderboardEntry): number | null => {
    if (e.rank <= 1) return null;
    const above = entries.find((x) => x.rank === e.rank - 1);
    return above ? Math.max(above.points - e.points + 1, 0) : null;
  };
  const me = entries.find((e) => e.isCurrentUser) ?? null;

  return (
    <Page>
      <NavBar title="Leaderboard" />

      <div className="px-4 pt-3 max-w-3xl w-full mx-auto flex flex-col gap-3">
        <FilterSegment options={PERIODS} value={period} onChange={setPeriod} />

        {period !== "alltime" ? (
          <div className="flex flex-col gap-0.5 p-3.5 rounded-xl bg-card border border-border-subtle">
            <span className="t-label-lg text-primary">{framing.monthLabel} Prizes</span>
            <span className="t-label-sm text-muted">Top 3 win a reward · {framing.resetLabel}</span>
          </div>
        ) : null}

        {featureOff ? (
          <EmptyState className="!mx-0 mt-6" title="Temporarily unavailable" subtitle={featureMessage ?? "This feature is temporarily unavailable."} actionTitle="Try again" onAction={() => setTick((t) => t + 1)} />
        ) : !revealed ? (
          <SkeletonLeaderboard />
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

      {revealed && myRow && !me ? (
        <div className="fixed bottom-[calc(var(--tabbar-h)+12px)] md:bottom-5 inset-x-4 md:left-1/2 md:-translate-x-1/2 md:right-auto md:w-[min(720px,calc(100vw-32px))] z-20">
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
        {/* Rows are a list: the flair holds still. */}
        <FlairAvatar user={entry} size={28} />
        <span className="flex flex-col min-w-0">
          <span className="flex items-center gap-1.5 min-w-0">
            <FlairName user={entry} className="t-body-sm" nameClassName="text-primary" />
            {entry.isCurrentUser ? <span className="shrink-0 text-[9px] font-bold text-violet px-1.5 py-0.5 rounded-full bg-surface border border-border-subtle">YOU</span> : null}
          </span>
          {pointsToNext ? <span className="t-label-sm text-muted">{ptsLabel(pointsToNext)} to #{entry.rank - 1}</span> : null}
        </span>
      </span>
      <span className="w-16 text-center t-mono-sm text-primary">{entry.points}</span>
    </Link>
  );
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const col = (e: LeaderboardEntry, height: number, place: 1 | 2 | 3) => {
    const accent = place === 1 ? "var(--gold)" : place === 2 ? "var(--text-secondary)" : "rgb(184 122 77)";
    return (
      <Link key={e.id} href={e.isCurrentUser ? "/profile" : `/profile/${encodeURIComponent(e.id)}`} className="flex flex-col items-center gap-1.5 flex-1 min-w-0 hover:opacity-90">
        {/* Rank, not Premium: a moving gold / silver / bronze ring whatever
            the plan (it replaces a member's violet ring; their shine and
            diamond still show on the name). */}
        <FlairAvatar user={e} size={place === 1 ? 60 : 50} metal={METALS[place - 1]} pad />
        <FlairName user={e} moving className="t-label-md" nameClassName="text-primary" />
        <span className="t-mono-sm text-primary">{e.points}</span>
        {/* The prize badge sits on the plinth in place of the digit (48 on
            #1, 40 on #2/#3). Karlo's trophy / crown art isn't on the web
            yet, so the digit stands in. */}
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
      <FlairAvatar user={entry} size={36} />
      <span className="flex flex-col flex-1 min-w-0"><FlairName user={entry} label="You" className="t-body-md" nameClassName="text-primary" /></span>
      <span className="t-mono-md text-primary">{ptsLabel(entry.points)}</span>
    </Link>
  );
}
