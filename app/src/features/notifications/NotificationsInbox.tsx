// NotificationsInbox — NotificationsView.swift. The persisted feed behind the
// bell: day chapters (TODAY / YESTERDAY / THIS WEEK / EARLIER), a timeline
// rail with a filled violet node for unread, one glyph per type. Opening the
// inbox clears the badge (read-all); tapping a row marks it read and deep
// links to the match / profile / player / leaderboard / weekly report.
// Reading marks, never removes — the inbox is your history.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, BarChart3, Clock, ClockAlert, Radio, Trophy, CalendarClock, Newspaper, TrendingUp, Gift, UserPlus, Star, Flag, Zap, Bell, BellOff } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { type Json } from "@/lib/types";
import { clsx, timeAgo } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { AssetIcon, EmptyState, LoadFailure, Page, SkeletonBar } from "@/components/ui";
import { normalizeNotifications, type NotificationItem, type NotificationTint } from "./types";

const PAGE_SIZE = 40;

/** Where a tapped notification leads (NotificationsView.destination). */
export function notificationHref(item: NotificationItem): string | null {
  const id = item.payloadId ? encodeURIComponent(item.payloadId) : null;
  switch (item.type.id) {
    case "weekly_report": return "/weekly-report";
    case "leaderboard_rank":
    case "leaderboard_reset": return "/leaderboard";
    case "followed_result":
    case "final_score":
    case "followed_player_highlight": return id ? `/match/${id}` : null;
    case "new_follower": return id ? `/profile/${id}` : null;
    default: break;
  }
  switch (item.refType) {
    case "conversation": return "/messages";
    case "match": return id ? `/match/${id}` : null;
    case "user": return id ? `/profile/${id}` : null;
    case "player": return id ? `/players/${id}` : null;
    case "team": return id ? `/teams/${id}` : null;
    case "article": return "/news";
    default: return null;
  }
}

export function NotificationsInbox() {
  const { refreshUnread } = useAppState();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await api.get<Json>(endpoints.notifications(PAGE_SIZE, 0));
      const rows = Array.isArray(raw) ? raw : raw?.notifications ?? raw?.data ?? [];
      setCanLoadMore(Array.isArray(rows) && rows.length >= PAGE_SIZE);
      setItems(normalizeNotifications(raw));
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setConnectionProblem(!!(e as { isConnectionProblem?: boolean })?.isConnectionProblem);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
      // Seen on open: the badge clears while the rows stay.
      try { await api.post(endpoints.notificationsReadAll, {}); } catch { /* ignore */ }
      await refreshUnread();
    })();
  }, [load, refreshUnread]);

  async function loadMore() {
    if (!canLoadMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const raw = await api.get<Json>(endpoints.notifications(PAGE_SIZE, items.length));
      const rows = Array.isArray(raw) ? raw : raw?.notifications ?? raw?.data ?? [];
      setCanLoadMore(Array.isArray(rows) && rows.length >= PAGE_SIZE);
      const older = normalizeNotifications(raw);
      setItems((prev) => { const known = new Set(prev.map((i) => i.id)); return [...prev, ...older.filter((o) => !known.has(o.id))]; });
    } catch { /* keep what we have */ } finally { setLoadingMore(false); }
  }

  function markRead(item: NotificationItem) {
    if (item.isRead) return;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)));
    void (async () => {
      try { await api.post(endpoints.notificationsRead, { ids: [item.id] }); } catch { /* ignore */ }
      await refreshUnread();
    })();
  }
  function markAllRead() {
    setItems((prev) => prev.map((i) => ({ ...i, isRead: true })));
    void (async () => {
      try { await api.post(endpoints.notificationsReadAll, {}); } catch { /* ignore */ }
      await refreshUnread();
    })();
  }

  const hasUnread = items.some((i) => !i.isRead);
  const groups = useMemo(() => groupByDay(items), [items]);

  return (
    <Page>
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 hairline-b">
        <span className="t-headline-sm text-primary flex-1">Notifications</span>
        {hasUnread ? <button type="button" onClick={markAllRead} className="t-label-md text-violet hover:underline">Mark all read</button> : null}
      </div>

      {loading && items.length === 0 ? (
        <div className="px-4 pt-3 max-w-2xl">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <span className="size-10 rounded-full bg-surface shrink-0" />
              <span className="flex flex-col gap-1.5 flex-1"><SkeletonBar width={180} height={12} /><SkeletonBar width={120} height={10} /></span>
            </div>
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <div className="pt-6"><LoadFailure error={error} connectionProblem={connectionProblem} onRetry={() => void load()} /></div>
      ) : items.length === 0 ? (
        <div className="pt-16">
          <EmptyState icon={<BellOff />} title="No notifications yet" subtitle="We'll let you know about your predictions, followed teams, and leaderboard rank." />
        </div>
      ) : (
        <div className="px-4 pt-1 max-w-2xl">
          {groups.map((g) => (
            <div key={g.label}>
              <span className="block t-kicker pt-[18px] pb-1.5">{g.label}</span>
              {g.items.map((item, i) => (
                <NotificationRow key={item.id} item={item} isLastInGroup={i === g.items.length - 1} onOpen={() => markRead(item)} />
              ))}
            </div>
          ))}
          {canLoadMore ? (
            <button type="button" onClick={() => void loadMore()} className="w-full py-3.5 t-label-sm text-muted hover:text-primary">{loadingMore ? "Loading…" : "Load older"}</button>
          ) : null}
        </div>
      )}
    </Page>
  );
}

function groupByDay(items: NotificationItem[]) {
  const now = new Date();
  const today: NotificationItem[] = [], yesterday: NotificationItem[] = [], week: NotificationItem[] = [], earlier: NotificationItem[] = [];
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  const weekAgo = now.getTime() - 7 * 86_400_000;
  for (const it of items) {
    const d = new Date(it.createdAt);
    if (same(d, now)) today.push(it);
    else if (same(d, y)) yesterday.push(it);
    else if (d.getTime() > weekAgo) week.push(it);
    else earlier.push(it);
  }
  return [["TODAY", today], ["YESTERDAY", yesterday], ["THIS WEEK", week], ["EARLIER", earlier]]
    .filter(([, l]) => (l as NotificationItem[]).length > 0)
    .map(([label, l]) => ({ label: label as string, items: l as NotificationItem[] }));
}

const TINT: Record<NotificationTint, string> = { violet: "text-violet", blue: "text-team1", gold: "text-gold", muted: "text-secondary" };

function TypeGlyph({ icon, tint }: { icon: string; tint: NotificationTint }) {
  if (icon === "weeklyreport" || icon === "streakmilestone" || icon === "messages") return <AssetIcon name={icon} height={15} />;
  const p = { size: 13, strokeWidth: 2.4, className: TINT[tint] };
  switch (icon) {
    case "badge-check": return <BadgeCheck {...p} />;
    case "bar-chart": return <BarChart3 {...p} />;
    case "clock": return <Clock {...p} />;
    case "clock-alert": return <ClockAlert {...p} />;
    case "radio": return <Radio {...p} />;
    case "trophy": return <Trophy {...p} />;
    case "calendar-clock": return <CalendarClock {...p} />;
    case "newspaper": return <Newspaper {...p} />;
    case "trending-up": return <TrendingUp {...p} />;
    case "gift": return <Gift {...p} />;
    case "user-plus": return <UserPlus {...p} />;
    case "star": return <Star {...p} />;
    case "flag": return <Flag {...p} />;
    case "zap": return <Zap {...p} />;
    default: return <Bell {...p} />;
  }
}

function NotificationRow({ item, isLastInGroup, onOpen }: { item: NotificationItem; isLastInGroup: boolean; onOpen: () => void }) {
  const href = notificationHref(item);
  const body = (
    <>
      <span className="relative w-7 self-stretch shrink-0">
        {!isLastInGroup ? <span className="absolute left-[3.5px] top-3.5 -bottom-4 w-px bg-border-subtle" /> : null}
        <span className={clsx("absolute left-0 top-1.5 size-2 rounded-full border-[1.2px]", item.isRead ? "bg-bg border-muted/60" : "bg-violet border-violet")} />
      </span>
      <span className="grid place-items-center size-[30px] rounded-lg bg-surface mr-2.5 shrink-0"><TypeGlyph icon={item.type.icon} tint={item.type.tint} /></span>
      <span className="flex flex-col flex-1 min-w-0 gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={clsx("text-primary truncate flex-1", item.isRead ? "t-body-sm" : "t-label-md")}>{item.title}</span>
          <span className="t-label-sm text-muted shrink-0">{timeAgo(item.createdAt)}</span>
        </span>
        <span className={clsx("t-body-sm line-clamp-2", item.isRead ? "text-muted" : "text-secondary")}>{item.body}</span>
      </span>
    </>
  );
  const cls = "flex items-start py-2 -mx-2 px-2 rounded-lg hover:bg-surface/40 transition-colors w-full text-left";
  if (href) return <Link href={href} onClick={onOpen} className={cls}>{body}</Link>;
  return <button type="button" onClick={onOpen} className={cls}>{body}</button>;
}
