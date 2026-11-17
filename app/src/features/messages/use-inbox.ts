// messages/use-inbox.ts — MessagesInboxViewModel as a hook.
//
// Threads are the server's rows plus what this tab already knows: the
// newest message per conversation (DMService.latestByConversation), the
// read ledger, and anything the socket delivered since the last load. A
// row changes the moment something happens (preview, time, position,
// dot) and the list reloads after, never the other way round.
//
// Nov 17: a message this browser can't open is never the preview and never
// counted (the newest that does open stands in, service.serverPreview), and
// opening the inbox takes back key versions reported lost that this browser
// holds (at most every 10 s), reloading when any came back.
//
// Nov 17 (parity N5-4, N12-5): group rows (their key context, "karlo: text"
// previews, Leave instead of Remove / Block, a group's changes over the
// socket), and the re-read behind the personal socket: every 5 s while it's
// down, once when it comes back, every 30 s while it's up; never while the
// tab is hidden or the server is busy.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, endpoints, isServerBusy } from "@/lib/api";
import { normalizePremiumStyle, normalizeTitle, type Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import {
  blockUser, contextForRow, decryptIn, expireStalePending, keyContextOf, leaveGroup, messages as fetchMessages, newestFor, noteLatest, onDM, reclaimHeldVersions, refreshUnread, removeConversation,
  conversations as fetchConversations, serverPreview, socketConnected, unreadFor,
} from "./service";
import { forgetRow, onReadLocal, onRemovedLocal, openConversationId, rememberRows } from "./dm-local";
import { onBlockChange } from "@/features/moderation/blocked";
import { laterOf } from "./format-dm";
import { isGroupRow, isPendingId, memberOf, type DMConversationRow, type DMMessage, type DMMessageRow, type SearchUser } from "./types";

export interface InboxThread {
  row: DMConversationRow;
  preview: string;
  previewIsMine: boolean;
  /** The message the preview shows — makes live updates idempotent. */
  newestId: string | null;
  /** A group: who said the preview, when it wasn't you. */
  previewSender: string | null;
}
/** A group's preview line names who said it. */
const senderName = (row: DMConversationRow, mine: boolean, senderId: string | null): string | null =>
  isGroupRow(row) && !mine && senderId ? memberOf(row, senderId)?.username ?? null : null;
export const threadUnread = (t: InboxThread) => t.row.unreadCount ?? 0;

interface FollowRowLite { id?: string | null; target_id?: string | null; username?: string | null; avatar_url?: string | null; is_premium?: boolean | null; premium_style?: unknown; title?: string | null }

export function useInbox(enabled: boolean) {
  const { refreshUnread: refreshBadges } = useAppState();
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [suggested, setSuggested] = useState<SearchUser[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionProblem, setConnectionProblem] = useState(false);
  const [tick, setTick] = useState(0);              // redraw on receipt / minute changes
  const threadsRef = useRef<InboxThread[]>([]);
  const verifiedAt = useRef(new Map<string, string>());
  const suggestionsLoadedAt = useRef(0);
  const loadingRef = useRef(false);
  const { user } = useAppState();
  const me = user?.id ?? null;

  const commit = useCallback((next: InboxThread[]) => { threadsRef.current = next; setThreads(next); }, []);

  /** Unread total → the shell's badge (DMService.setUnreadCount). The socket relay
   *  already recounts through the service on every incoming message. */
  const syncUnread = useCallback(() => { void refreshBadges(); }, [refreshBadges]);

  // One thread read when the server row disagrees with itself.
  const verifyLatest = useCallback(async (row: DMConversationRow) => {
    const stamp = row.lastMessageAt ?? row.lastMessage?.createdAt ?? "";
    if (verifiedAt.current.get(row.id) === stamp) return;
    let inconsistent: boolean;
    if (row.lastMessage) {
      const lastAt = new Date(row.lastMessage.createdAt).getTime();
      inconsistent = new Date(row.lastMessageAt ?? row.lastMessage.createdAt).getTime() - lastAt > 1000;
    } else {
      inconsistent = row.lastMessageAt !== null;
    }
    if (!inconsistent) { verifiedAt.current.set(row.id, stamp); return; }
    let newest: DMMessageRow | undefined;
    try { newest = (await fetchMessages(row.id)).messages[0]; } catch { /* keep the row as is */ }
    if (!newest) { verifiedAt.current.set(row.id, stamp); return; }
    verifiedAt.current.set(row.id, laterOf(stamp, newest.createdAt) ?? stamp);
    const m = await decryptIn(newest, keyContextOf(row));
    if (!m.decrypted) return;   // hidden: the row's preview finds one that opens
    const have = newestFor(row)?.local;
    if (have && isPendingId(have.id)) {
      // A send is in flight: only its own confirmation may replace it.
      if (m.isMine && m.text === have.text) noteLatest(row.id, m);
      return;
    }
    noteLatest(row.id, m);
  }, []);

  const loadSuggestions = useCallback(async (force = false) => {
    if (!me) return;
    if (!force && Date.now() - suggestionsLoadedAt.current < 60_000) return;
    suggestionsLoadedAt.current = Date.now();
    let rows: FollowRowLite[];
    try {
      const raw = await api.get<Json>(endpoints.following(me, 30, 0, "user"));
      rows = Array.isArray(raw) ? (raw as FollowRowLite[]) : [];
    } catch { return; }
    const threaded = new Set(threadsRef.current.map((t) => t.row.otherId));
    const out: SearchUser[] = [];
    for (const r of rows) {
      const id = r.target_id ?? r.id;
      if (!id || !r.username || threaded.has(id) || id === me) continue;
      out.push({ id, username: r.username, avatarURL: r.avatar_url ?? null, flair: { id, username: r.username, avatarURL: r.avatar_url ?? null, isPremium: !!r.is_premium, premiumStyle: normalizePremiumStyle(r.premium_style), title: r.title !== undefined ? normalizeTitle(r.title) : undefined } });
    }
    setSuggested(out);
  }, [me]);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (threadsRef.current.length === 0) setLoading(true);
    try {
      const rows = await fetchConversations();
      rememberRows(rows);
      expireStalePending();
      for (const row of rows.slice(0, 20)) await verifyLatest(row);
      const built: InboxThread[] = [];
      for (const row of rows) {
        // Preview: the newest this browser knows — local when newer than the
        // server's last_message, else the server's; one that won't open here
        // is skipped for the newest that does.
        const opened = await serverPreview(row);
        const newest = newestFor(row);
        let preview = "";
        let mine = false;
        let from: string | null = null;
        if (newest?.local) {
          preview = newest.local.text; mine = newest.local.isMine; from = newest.local.senderId;
        } else if (opened) {
          preview = opened.text; mine = opened.isMine; from = opened.senderId;
        }
        const t: InboxThread = { row: { ...row }, preview, previewIsMine: mine, newestId: newest?.id ?? null, previewSender: senderName(row, mine, from) };
        if (newest) t.row.lastMessageAt = laterOf(t.row.lastMessageAt, newest.at);
        t.row.unreadCount = unreadFor(row);
        built.push(t);
      }
      built.sort((a, b) => new Date(b.row.lastMessageAt ?? 0).getTime() - new Date(a.row.lastMessageAt ?? 0).getTime());
      commit(built);
      setError(null);
      setConnectionProblem(false);
      syncUnread();
    } catch (e) {
      if (threadsRef.current.length === 0) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setConnectionProblem(e instanceof ApiError && e.isConnectionProblem);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
      void loadSuggestions();
    }
  }, [commit, loadSuggestions, syncUnread, verifyLatest]);

  /** A message landed (socket, or sent/received in a thread): the row changes now. */
  const noteLocal = useCallback((conversationId: string, message: DMMessage) => {
    noteLatest(conversationId, message);
    const i = threadsRef.current.findIndex((t) => t.row.id === conversationId);
    if (i < 0) return;
    const cur = threadsRef.current[i];
    // Apply only if this is now the newest we know.
    if (newestFor(cur.row)?.local?.id !== message.id) return;
    if (cur.newestId === message.id) return;
    const t: InboxThread = { ...cur, row: { ...cur.row }, newestId: message.id, preview: message.text, previewIsMine: message.isMine, previewSender: senderName(cur.row, message.isMine, message.senderId) };
    t.row.lastMessageAt = laterOf(t.row.lastMessageAt, message.createdAt);
    if (message.isMine) t.row.unreadCount = 0;
    else if (openConversationId() !== conversationId) t.row.unreadCount = (t.row.unreadCount ?? 0) + 1;
    const next = threadsRef.current.filter((_, j) => j !== i);
    next.unshift(t);
    commit(next);
    syncUnread();
  }, [commit, syncUnread]);

  /** Socket row → decrypt → the row updates now; a brand-new conversation only exists on the server. */
  const noteIncoming = useCallback(async (conversationId: string, row: DMMessageRow) => {
    const other = threadsRef.current.find((t) => t.row.id === conversationId)?.row;
    const m = await decryptIn(row, other ? keyContextOf(other) : contextForRow(row, conversationId));
    if (m.decrypted) noteLocal(conversationId, m);    // hidden: no preview, no count
    if (!other) await load();
  }, [load, noteLocal]);

  /** The thread was viewed: clear the row now, no waiting on the server. */
  const noteRead = useCallback((conversationId: string) => {
    const i = threadsRef.current.findIndex((t) => t.row.id === conversationId);
    if (i < 0) return;
    const next = threadsRef.current.slice();
    next[i] = { ...next[i], row: { ...next[i].row, unreadCount: 0 } };
    commit(next);
    syncUnread();
  }, [commit, syncUnread]);

  const drop = useCallback((id: string) => {
    commit(threadsRef.current.filter((t) => t.row.id !== id));
    forgetRow(id);
  }, [commit]);

  const remove = useCallback((t: InboxThread) => { drop(t.row.id); void removeConversation(t.row.id).then(() => { void refreshUnread(); syncUnread(); }); }, [drop, syncUnread]);
  const block = useCallback((t: InboxThread) => { drop(t.row.id); void blockUser(t.row.otherId).then(() => { void refreshUnread(); syncUnread(); }); }, [drop, syncUnread]);
  /** Out of a group: the row goes now; the others rotate their key. */
  const leave = useCallback((t: InboxThread) => { drop(t.row.id); void leaveGroup(t.row).catch(() => {}).then(() => { void refreshUnread(); syncUnread(); }); }, [drop, syncUnread]);

  // ── Lifecycle ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    void load();
    // Take back what another device of mine hid that this browser can open.
    void reclaimHeldVersions();
    const offs = [
      onDM("keysReclaimed", () => { void load(); }),
      onDM("message", ({ conversationId, message }) => { void noteIncoming(conversationId, message); }),
      onDM("localMessage", ({ conversationId, message }) => noteLocal(conversationId, message)),
      onDM("read", () => { setTimeout(() => setTick((t) => t + 1), 150); }),   // the ledger is written first; redraw after
      onDM("removed", ({ conversationId }) => drop(conversationId)),
      // An unsent or edited message: the preview falls back / follows (re-read).
      onDM("deleted", () => { void load(); }),
      onDM("edited", () => { void load(); }),
      // A group's name or people changed (or I'm out of it): the row is read again.
      onDM("groupUpdated", ({ conversationId, removed }) => { if (removed) drop(conversationId); else void load(); }),
      // Blocked anywhere in the app: their thread leaves the inbox now.
      onBlockChange((userId, blocked) => {
        if (!blocked) return;
        for (const t of threadsRef.current) if (t.row.otherId === userId) drop(t.row.id);
        setSuggested((prev) => prev.filter((u) => u.id !== userId));
      }),
      onReadLocal(({ conversationId }) => noteRead(conversationId)),
      onRemovedLocal((conversationId) => { drop(conversationId); syncUnread(); }),
    ];
    const onFocus = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    // The socket brings previews and new threads as they happen; this
    // re-read is the safety net behind it (N12-5): every 5 s while the
    // socket is down, once when it comes back, every 30 s while it's up, and
    // not while the server is asking for room (503 OVERLOADED).
    let sinceRead = 0;
    let wasConnected = socketConnected();
    const poll = setInterval(() => {
      sinceRead += 5;
      const connected = socketConnected();
      const due = !connected || !wasConnected || sinceRead >= 30;
      wasConnected = connected;
      if (!due || document.visibilityState !== "visible" || isServerBusy()) return;
      sinceRead = 0;
      void load();
    }, 5000);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(poll);
    };
  }, [enabled, load, noteIncoming, noteLocal, drop, noteRead, syncUnread]);

  return { threads, suggested, isLoading, error, connectionProblem, tick, load, remove, block, leave, drop };
}
