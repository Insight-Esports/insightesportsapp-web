// notifications/bell.ts — what the bell list holds and the number on the bell
// (NotificationsView.swift's NotificationsViewModel.load / appendNextPage and
// NotificationManager.refreshUnreadCount). Shared by the inbox page and the
// desktop bell's popover; the app store only listens for the number.
//
//   List: pages of 60 from GET /notifications, kept to the types the bell
//   shows (BELL_ELIGIBLE). A page can be all match traffic, so on open it
//   reads on (up to four more pages) until there are 20 rows or the history
//   ends. The cursor is rows FETCHED, not rows kept.
//   Number: counts only what the list shows. Once a list is loaded, its own
//   unread rows are the number; otherwise GET /notifications?unread_only=true,
//   kept the same way. /notifications/unread-count is the fallback only, and
//   not tried when the first read came back 503 (the number stays). One
//   count read at a time: later callers share the read already out.
import { api, ApiError, endpoints } from "@/lib/api";
import type { Json } from "@/lib/types";
import { normalizeNotification, type NotificationItem } from "./types";

export const BELL_PAGE_SIZE = 60;
/** A screenful: read on until the list holds this many rows. */
const SCREENFUL = 20;
const MAX_EXTRA_PAGES = 4;

function rowsOf(raw: Json): Json[] | null {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.notifications)) return raw.notifications;
  if (Array.isArray(raw?.data)) return raw.data;
  return null;
}
const keep = (rows: Json[]) => rows.map(normalizeNotification).filter((x): x is NotificationItem => x != null);

// ── The list ──────────────────────────────────────────────────────────────
export interface BellList {
  items: NotificationItem[];
  /** Rows read from the server so far: the next page's offset. */
  fetched: number;
  /** The last page was full: older history may follow. */
  more: boolean;
}

/** One page from `offset`, kept to the bell's types. Throws when the read fails. */
export async function fetchBellPage(offset: number): Promise<BellList> {
  const rows = rowsOf(await api.get<Json>(endpoints.notifications(BELL_PAGE_SIZE, offset))) ?? [];
  return { items: keep(rows), fetched: offset + rows.length, more: rows.length >= BELL_PAGE_SIZE };
}

/** `older` after `prev`, minus the ids `prev` already holds. */
export function appendOlder(prev: NotificationItem[], older: NotificationItem[]): NotificationItem[] {
  const known = new Set(prev.map((i) => i.id));
  return [...prev, ...older.filter((o) => !known.has(o.id))];
}

/** The list on open: the first page (a failure throws), then up to four more
 *  while it's short of a screenful (a failure there keeps what's in). The
 *  loaded list's unread rows become the bell's number. */
export async function loadBellList(): Promise<BellList> {
  let list = await fetchBellPage(0);
  for (let extra = 0; list.items.length < SCREENFUL && list.more && extra < MAX_EXTRA_PAGES; extra++) {
    let next: BellList;
    try { next = await fetchBellPage(list.fetched); } catch { break; }
    list = { items: appendOlder(list.items, next.items), fetched: next.fetched, more: next.more };
  }
  publishBellUnread(list.items.filter((i) => !i.isRead).length);
  return list;
}

// ── The number ────────────────────────────────────────────────────────────
type Listener = (n: number) => void;
const listeners = new Set<Listener>();
/** Bumped whenever a loaded list sets the number: a count read that started before it is stale. */
let generation = 0;
let inflight: { gen: number; promise: Promise<void> } | null = null;
/** Unread DMs (the Messages badge), for the fallback count, whose total includes them. */
let dmUnread = 0;

/** The app store's hook for the number. */
export function subscribeBellUnread(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
const emit = (n: number) => { for (const l of listeners) l(n); };

/** The Messages badge's number, so the fallback count can leave DMs out. */
export function noteDMUnread(n: number): void {
  dmUnread = Number.isFinite(n) && n > 0 ? n : 0;
}

/** A loaded list's own unread rows are the number. */
export function publishBellUnread(n: number): void {
  generation += 1;
  emit(Math.max(0, n));
}

/** Reads the number again. One read at a time: a caller while a read is out
 *  waits on it (a read that a loaded list has since overtaken is let land,
 *  then read again). */
export async function refreshBellUnread(): Promise<void> {
  while (inflight) {
    if (inflight.gen === generation) return inflight.promise;
    await inflight.promise;
  }
  const mine = { gen: generation, promise: readUnread(generation) };
  inflight = mine;
  try { await mine.promise; } finally { if (inflight === mine) inflight = null; }
}

async function readUnread(gen: number): Promise<void> {
  let n: number | null = null;
  try {
    const rows = rowsOf(await api.get<Json>(endpoints.notificationsUnreadOnly));
    if (rows) n = keep(rows).filter((i) => !i.isRead).length;
  } catch (e) {
    // Busy (and already asked twice): the bell keeps its number, and the
    // count endpoint isn't tried on top.
    if (e instanceof ApiError && e.status === 503) return;
  }
  if (n == null) {
    try {
      const d = await api.get<Json>(endpoints.notificationsUnreadCount);
      const total = Number(d?.unread_count ?? d?.count ?? d?.unread);
      if (Number.isFinite(total)) n = Math.max(0, total - dmUnread);
    } catch { /* keep the number */ }
  }
  if (n != null && gen === generation) emit(n);
}
