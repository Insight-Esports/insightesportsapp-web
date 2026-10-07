// messages/use-inbox.ts — MessagesInboxViewModel as a hook.
//
// Threads are the server's rows plus what this tab already knows: the
// newest message per conversation (DMService.latestByConversation), the
// read ledger, and anything the socket delivered since the last load. A
// row changes the moment something happens (preview, time, position,
// dot) and the list reloads after, never the other way round.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, endpoints } from "@/lib/api";
import type { Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import {
  blockUser, decrypt, expireStalePending, messages as fetchMessages, newestFor, noteLatest, onDM, refreshUnread, removeConversation, conversations as fetchConversations, unreadFor,
} from "./service";
import { forgetRow, onReadLocal, onRemovedLocal, openConversationId, rememberRows } from "./dm-local";
import { laterOf } from "./format-dm";
import { isPendingId, type DMConversationRow, type DMMessage, type DMMessageRow, type SearchUser } from "./types";

export interface InboxThread {
  row: DMConversationRow;
  preview: string;
  previewIsMine: boolean;
  /** The message the preview shows — makes live updates idempotent. */
  newestId: string | null;
}
export const threadUnread = (t: InboxThread) => t.row.unreadCount ?? 0;

interface FollowRowLite { id?: string | null; target_id?: string | null; username?: string | null; avatar_url?: string | null }

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
    const m = await decrypt(newest, row.otherId, row.otherPublicKey, row.otherKeyVersion);
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
      out.push({ id, username: r.username, avatarURL: r.avatar_url ?? null });
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
        const newest = newestFor(row);
        let preview = "";
        let mine = false;
        if (newest?.local) {
          preview = newest.local.text; mine = newest.local.isMine;
        } else if (row.lastMessage) {
          const m = await decrypt(row.lastMessage, row.otherId, row.otherPublicKey, row.otherKeyVersion);
          preview = m.text; mine = m.isMine;
        }
        const t: InboxThread = { row: { ...row }, preview, previewIsMine: mine, newestId: newest?.id ?? null };
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
    const t: InboxThread = { ...cur, row: { ...cur.row }, newestId: message.id, preview: message.text, previewIsMine: message.isMine };
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
    const m = await decrypt(row, other?.otherId ?? row.senderId, other?.otherPublicKey ?? null, other?.otherKeyVersion ?? null);
    noteLocal(conversationId, m);
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

  // ── Lifecycle ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    void load();
    const offs = [
      onDM("message", ({ conversationId, message }) => { void noteIncoming(conversationId, message); }),
      onDM("localMessage", ({ conversationId, message }) => noteLocal(conversationId, message)),
      onDM("read", () => { setTimeout(() => setTick((t) => t + 1), 150); }),   // the ledger is written first; redraw after
      onDM("removed", ({ conversationId }) => drop(conversationId)),
      onReadLocal(({ conversationId }) => noteRead(conversationId)),
      onRemovedLocal((conversationId) => { drop(conversationId); syncUnread(); }),
    ];
    const onFocus = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    // Fallback freshness: previews and new threads land even if a socket event is missed.
    const poll = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15_000);
    return () => {
      offs.forEach((off) => off());
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      clearInterval(poll);
    };
  }, [enabled, load, noteIncoming, noteLocal, drop, noteRead, syncUnread]);

  return { threads, suggested, isLoading, error, connectionProblem, tick, load, remove, block, drop };
}
