// NotificationsPopover — the desktop bell. Instead of leaving the screen,
// the bell drops a panel under itself: "Notifications" + Mark all read on
// top, the inbox's own rows (same chapters, same glyphs, same deep links)
// in a scrollable list, "See all" to the full /notifications page below.
// Closes on an outside click, Esc, or when a row is followed.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { type Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { Spinner, ToolButton } from "@/components/ui";
import { groupNotificationsByDay, NotificationRow } from "./NotificationsInbox";
import { normalizeNotifications, type NotificationItem } from "./types";

const PAGE_SIZE = 20;

export function NotificationsBell({ className }: { className?: string }) {
  const { unreadNotifications, refreshUnread } = useAppState();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await api.get<Json>(endpoints.notifications(PAGE_SIZE, 0));
      setItems(normalizeNotifications(raw));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fresh rows every time the panel opens; outside click / Esc close it.
  useEffect(() => {
    if (!open) return;
    void load();
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, load]);

  function markRead(item: NotificationItem) {
    setOpen(false);
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

  const hasUnread = unreadNotifications > 0 || items.some((i) => !i.isRead);
  const groups = useMemo(() => groupNotificationsByDay(items), [items]);

  return (
    <span ref={wrap} className={className ? `relative ${className}` : "relative"}>
      <ToolButton label="Notifications" onClick={() => setOpen((v) => !v)} badge={unreadNotifications || undefined} aria-expanded={open} aria-haspopup="dialog" className={open ? "text-primary bg-card" : undefined}>
        <Bell size={17} strokeWidth={2.25} fill="currentColor" />
      </ToolButton>
      {open ? (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-32px)] z-40 rounded-xl bg-card border border-hairline shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 hairline-b">
            <span className="t-headline-sm text-primary">Notifications</span>
            <span className="flex-1" />
            {hasUnread ? <button type="button" onClick={markAllRead} className="t-label-md text-violet hover:underline whitespace-nowrap">Mark all read</button> : null}
          </div>
          <div className="max-h-[min(60vh,520px)] overflow-y-auto px-4 pb-2">
            {loading && items.length === 0 ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : error && items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <span className="t-body-sm text-muted">{error}</span>
                <button type="button" onClick={() => void load()} className="t-label-md text-violet hover:underline">Retry</button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center px-4">
                <BellOff size={22} className="text-muted" />
                <span className="t-label-md text-primary">No notifications yet</span>
                <span className="t-body-sm text-muted">We&apos;ll let you know about your predictions, followed teams, and leaderboard rank.</span>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.label}>
                  <span className="block t-kicker pt-3.5 pb-1">{g.label}</span>
                  {g.items.map((item, i) => (
                    <NotificationRow key={item.id} item={item} isLastInGroup={i === g.items.length - 1} onOpen={() => markRead(item)} />
                  ))}
                </div>
              ))
            )}
          </div>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block text-center py-2.5 hairline-t t-label-md text-violet hover:bg-surface/60 transition-colors">See all</Link>
        </div>
      ) : null}
    </span>
  );
}
