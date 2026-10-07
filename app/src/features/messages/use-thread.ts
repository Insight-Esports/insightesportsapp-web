// messages/use-thread.ts — MessageThreadViewModel as a hook.
//
// Messages oldest → newest, keyset paging upward, read-on-open, the
// optimistic send path (pending bubble → server row, or failed with a
// retry), their read receipt from two facts (an id boundary from
// dm:read, a server-stamped time), typing, and the blocked states.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAppState } from "@/store/app-state";
import {
  asURL, decrypt, markRead, messages as fetchMessages, noteLocalMessage, onDM, publicKeyFor, readLedger, sendEnvelope, sendText, unblockUser,
} from "./service";
import { DMMediaError, uploadMedia, type PreparedMedia } from "./media";
import type { DMEnvelope } from "./crypto";
import { emitReadLocal, setOpenConversation } from "./dm-local";
import { seenLabelFor } from "./format-dm";
import { isPendingId, type DMConversationRow, type DMMedia, type DMMessage, type DMMessageRow } from "./types";

export interface BlockedState { text: string; offersUnblock: boolean }

const NO_KEY_TEXT = "This user can't receive messages yet — they haven't opened the latest Insight.";
const PAGE = 50;

type Retry = { kind: "text"; text: string } | { kind: "media"; media: PreparedMedia };

export function mediaFromEnvelope(e: DMEnvelope): DMMedia | null {
  if ((e.t !== "image" && e.t !== "video") || !e.id || !e.key || !e.nonce) return null;
  return {
    kind: e.t, blobId: e.id, key: e.key, nonce: e.nonce,
    mime: e.mime ?? (e.t === "image" ? "image/jpeg" : "video/mp4"),
    width: e.w ?? 0, height: e.h ?? 0, duration: e.dur ?? null,
    posterId: e.poster ?? null, posterNonce: e.pnonce ?? null,
  };
}

export function useThread(row: DMConversationRow, visible: boolean, onRemoved: () => void) {
  const { user } = useAppState();
  const me = user?.id ?? "";
  const id = row.id;

  const [messages, setMessagesState] = useState<DMMessage[]>([]);
  const messagesRef = useRef<DMMessage[]>([]);
  const setMessages = useCallback((next: DMMessage[] | ((prev: DMMessage[]) => DMMessage[])) => {
    const v = typeof next === "function" ? next(messagesRef.current) : next;
    messagesRef.current = v;
    setMessagesState(v);
  }, []);

  const [loaded, setLoaded] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [blockedState, setBlockedState] = useState<BlockedState | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [otherIsTyping, setTyping] = useState(false);
  const [receipt, setReceipt] = useState<{ throughId: string | null; at: string | null; learnedAt: string | null }>({ throughId: null, at: null, learnedAt: null });
  const receiptRef = useRef(receipt);

  const oldestRow = useRef<DMMessageRow | null>(null);
  const otherKey = useRef<{ pub: string | null; ver: number | null }>({ pub: row.otherPublicKey, ver: row.otherKeyVersion });
  const lastOwnReadPostAt = useRef(0);
  const typingClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retries = useRef(new Map<string, Retry>());
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onRemovedRef = useRef(onRemoved);
  onRemovedRef.current = onRemoved;

  // ── Their read receipt ─────────────────────────────────────────────────
  const noteOtherRead = useCallback((throughId: string | null, at: string | null) => {
    const cur = receiptRef.current;
    let next = { ...cur };
    let changed = false;
    if (throughId && !isPendingId(throughId) && throughId !== cur.throughId) {
      // The boundary only moves forward.
      let older = false;
      if (cur.throughId) {
        const list = messagesRef.current;
        const ci = list.findIndex((m) => m.id === cur.throughId);
        const ni = list.findIndex((m) => m.id === throughId);
        if (ci >= 0 && ni >= 0) older = ni < ci;
      }
      if (!older) { next.throughId = throughId; changed = true; }
    }
    if (at && (!cur.at || new Date(at) > new Date(cur.at))) { next.at = at; changed = true; }
    if (changed) {
      next = { ...next, learnedAt: new Date().toISOString() };
      receiptRef.current = next;
      setReceipt(next);
      readLedger.noteOtherSeen(id, next.throughId, next.at);
    }
  }, [id]);

  const seedReceipt = useCallback(() => {
    const saved = readLedger.otherSeenState(id);
    if (!saved) return;
    const next = { throughId: saved.throughId ?? null, at: saved.at ?? null, learnedAt: saved.at ?? null };
    receiptRef.current = next;
    setReceipt(next);
  }, [id]);

  /** Has the other person seen this message of mine? */
  const isSeen = useCallback((m: DMMessage): boolean => {
    if (!m.isMine || isPendingId(m.id)) return false;
    const r = receiptRef.current;
    if (r.throughId) {
      if (r.throughId === m.id) return true;
      const list = messagesRef.current;
      const ti = list.findIndex((x) => x.id === r.throughId);
      const mi = list.findIndex((x) => x.id === m.id);
      if (ti >= 0 && mi >= 0 && mi < ti) return true;
    }
    if (r.at && new Date(r.at) >= new Date(m.createdAt)) return true;
    return false;
  }, []);

  /** "Sending…" · "Sent" · "Seen just now" · "Seen 20m ago" · "Seen yesterday" */
  const seenLabel = useCallback((m: DMMessage): string => {
    if (isPendingId(m.id)) return m.failed ? "Not sent" : "Sending…";
    if (!isSeen(m)) return "Sent";
    const at = receiptRef.current.at ?? receiptRef.current.learnedAt;
    return at ? seenLabelFor(at) : "Seen";
  }, [isSeen]);

  // ── Read state ─────────────────────────────────────────────────────────
  const noteViewedNow = useCallback((fallbackId: string | null = null) => {
    const last = [...messagesRef.current].reverse().find((m) => !isPendingId(m.id))?.id ?? fallbackId;
    readLedger.markViewed(id, last);
    emitReadLocal(id, last);
  }, [id]);

  const justPostedRead = () => Date.now() - lastOwnReadPostAt.current < 3000;

  const markReadIfVisible = useCallback(async () => {
    if (!visibleRef.current) return;
    noteViewedNow();
    lastOwnReadPostAt.current = Date.now();
    await markRead(id);
  }, [id, noteViewedNow]);

  // ── Typing ─────────────────────────────────────────────────────────────
  const noteTyping = useCallback(() => {
    setTyping(true);
    if (typingClear.current) clearTimeout(typingClear.current);
    typingClear.current = setTimeout(() => setTyping(false), 3000);
  }, []);

  // ── Load / page / receive ──────────────────────────────────────────────
  const dec = useCallback((r: DMMessageRow) => decrypt(r, row.otherId, otherKey.current.pub, otherKey.current.ver), [row.otherId]);

  const receive = useCallback(async (r: DMMessageRow) => {
    if (messagesRef.current.some((m) => m.id === r.id)) return;
    const m = await dec(r);
    if (messagesRef.current.some((x) => x.id === r.id)) return;
    if (m.isMine) {
      const i = messagesRef.current.findIndex((x) => isPendingId(x.id) && !x.failed && x.text === m.text && x.media === null && m.media === null);
      if (i >= 0) {
        // Our own message came back before the send call returned.
        setMessages((prev) => prev.map((x, j) => (j === i ? m : x)));
        noteLocalMessage(id, m);
        return;
      }
    }
    if (!m.isMine) { if (typingClear.current) clearTimeout(typingClear.current); setTyping(false); }
    setMessages((prev) => [...prev, m]);
    noteLocalMessage(id, m);
    if (!m.isMine) await markReadIfVisible();
  }, [dec, id, markReadIfVisible, setMessages]);

  const pollForNew = useCallback(async () => {
    let page;
    try { page = await fetchMessages(id); } catch { return; }
    const known = new Set(messagesRef.current.map((m) => m.id));
    const fresh = page.messages.filter((r) => !known.has(r.id)).reverse();
    if (page.otherLastReadAt) noteOtherRead(null, page.otherLastReadAt);
    for (const r of fresh) await receive(r);
  }, [id, noteOtherRead, receive]);

  const ensureKeys = useCallback(async () => {
    if (otherKey.current.pub && otherKey.current.ver != null) return true;
    try {
      const fresh = await publicKeyFor(row.otherId, null);
      if (fresh.publicKey && fresh.keyVersion != null) { otherKey.current = { pub: fresh.publicKey, ver: fresh.keyVersion }; return true; }
    } catch { /* no key yet */ }
    return false;
  }, [row.otherId]);

  const load = useCallback(async () => {
    await ensureKeys();
    seedReceipt();
    if (row.otherLastReadAt) noteOtherRead(null, row.otherLastReadAt);
    let page;
    try { page = await fetchMessages(id); } catch { setLoaded(true); return; }
    if (page.otherLastReadAt) noteOtherRead(null, page.otherLastReadAt);
    const rows = page.messages;                 // newest first
    oldestRow.current = rows[rows.length - 1] ?? null;
    setCanLoadMore(rows.length >= PAGE);
    const out: DMMessage[] = [];
    for (const r of [...rows].reverse()) out.push(await dec(r));
    // Merge, never replace: a socket-delivered message that arrived while
    // this page was in flight would otherwise be dropped.
    const byId = new Map<string, DMMessage>();
    for (const m of messagesRef.current) byId.set(m.id, m);
    for (const m of out) byId.set(m.id, m);
    let merged = [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const realMine = new Set(merged.filter((m) => m.isMine && !isPendingId(m.id) && m.media === null).map((m) => m.text));
    merged = merged.filter((m) => !(isPendingId(m.id) && !m.failed && m.media === null && realMine.has(m.text)));
    setMessages(merged);
    setLoaded(true);
    await markReadIfVisible();
  }, [dec, ensureKeys, id, markReadIfVisible, noteOtherRead, row.otherLastReadAt, seedReceipt, setMessages]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !oldestRow.current) return;
    setLoadingMore(true);
    try {
      const page = await fetchMessages(id, oldestRow.current);
      const rows = page.messages;
      if (rows.length === 0) { setCanLoadMore(false); return; }
      oldestRow.current = rows[rows.length - 1];
      setCanLoadMore(rows.length >= PAGE);
      const older: DMMessage[] = [];
      for (const r of [...rows].reverse()) older.push(await dec(r));
      const known = new Set(messagesRef.current.map((m) => m.id));
      setMessages((prev) => [...older.filter((m) => !known.has(m.id)), ...prev]);
    } catch { /* the button stays; try again */ } finally {
      setLoadingMore(false);
    }
  }, [dec, id, isLoadingMore, setMessages]);

  // ── Send ───────────────────────────────────────────────────────────────
  /** A failed send keeps its bubble ("Tap to retry") and hands the inbox back the last real message. */
  const markFailed = useCallback((pendingId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, failed: true } : m)));
    const prev = [...messagesRef.current].reverse().find((m) => !isPendingId(m.id));
    if (prev) noteLocalMessage(id, prev);
  }, [id, setMessages]);

  const dropPending = useCallback((pendingId: string) => {
    retries.current.delete(pendingId);
    setMessages((prev) => prev.filter((m) => m.id !== pendingId));
    const prev = [...messagesRef.current].reverse().find((m) => !isPendingId(m.id));
    if (prev) noteLocalMessage(id, prev);
  }, [id, setMessages]);

  const handleSendError = useCallback((e: unknown, pendingId: string) => {
    if (e instanceof ApiError) {
      if (e.code === "CANNOT_MESSAGE_USER") { dropPending(pendingId); setBlockedState({ text: "You can't message this account.", offersUnblock: false }); return; }
      if (e.code === "YOU_BLOCKED_THIS_USER") { dropPending(pendingId); setBlockedState({ text: "You blocked this account.", offersUnblock: true }); return; }
      if (e.code === "FEATURE_DISABLED") { dropPending(pendingId); setSendError(e.message); return; }
      if (e.isRateLimited) { markFailed(pendingId); setSendError("Slow down — messages are limited to 30 a minute."); return; }
      markFailed(pendingId);
      setSendError(e.isConnectionProblem ? "Couldn't send. Check your connection." : e.message);
      return;
    }
    markFailed(pendingId);
    if (e instanceof DMMediaError) { setSendError(e.message); return; }
    if (e instanceof Error && e.message === "NOT_LINKED") { setSendError("Link this browser from your phone to send messages."); return; }
    setSendError("Couldn't send. Check your connection.");
  }, [dropPending, markFailed]);

  const confirmPending = useCallback((pendingId: string, m: DMMessage) => {
    const list = messagesRef.current;
    const i = list.findIndex((x) => x.id === pendingId);
    if (i >= 0) {
      if (list.some((x) => x.id === m.id)) setMessages(list.filter((_, j) => j !== i));   // poll/echo beat us
      else setMessages(list.map((x, j) => (j === i ? m : x)));
    }
    // Always announce the confirmed row, whichever path landed it.
    const confirmed = messagesRef.current.find((x) => x.id === m.id) ?? m;
    noteLocalMessage(id, confirmed);
    retries.current.delete(pendingId);
  }, [id, setMessages]);

  const send = useCallback(async (text: string) => {
    // No key on the row? Ask the key endpoint live — they may have published since.
    if (!(await ensureKeys())) { setBlockedState({ text: NO_KEY_TEXT, offersUnblock: false }); return; }
    setBlockedState(null);
    const pub = otherKey.current.pub!, ver = otherKey.current.ver!;
    const pendingId = "pending-" + crypto.randomUUID();
    const pending: DMMessage = { id: pendingId, senderId: me, text, isMine: true, createdAt: new Date().toISOString(), decrypted: true, linkURL: asURL(text) ? text.trim() : null, media: null };
    retries.current.set(pendingId, { kind: "text", text });
    setMessages((prev) => [...prev, pending]);
    noteLocalMessage(id, pending);
    try {
      const r = await sendText(text, id, row.otherId, pub, ver);
      // Show our own plaintext (no need to decrypt what we just sealed).
      confirmPending(pendingId, { id: r.id, senderId: r.senderId, text, isMine: true, createdAt: r.createdAt, decrypted: true, linkURL: pending.linkURL, media: null });
    } catch (e) {
      handleSendError(e, pendingId);
    }
  }, [confirmPending, ensureKeys, handleSendError, id, me, row.otherId, setMessages]);

  /** Optimistic like text: the picked photo shows at once; encrypt → upload → send. */
  const sendMedia = useCallback(async (media: PreparedMedia) => {
    if (!(await ensureKeys())) { setBlockedState({ text: NO_KEY_TEXT, offersUnblock: false }); return; }
    setBlockedState(null);
    const pub = otherKey.current.pub!, ver = otherKey.current.ver!;
    const pendingId = "pending-" + crypto.randomUUID();
    const label = media.kind === "image" ? "📷 Photo" : "🎬 Video";
    const pending: DMMessage = {
      id: pendingId, senderId: me, text: label, isMine: true, createdAt: new Date().toISOString(), decrypted: true, linkURL: null,
      media: { kind: media.kind, blobId: "pending", key: "", nonce: "", mime: media.mime, width: media.width, height: media.height, duration: media.duration ?? null, posterId: null, posterNonce: null },
      localPreview: media.previewURL,
    };
    retries.current.set(pendingId, { kind: "media", media });
    setMessages((prev) => [...prev, pending]);
    noteLocalMessage(id, pending);
    try {
      const envelope = await uploadMedia(media, id);
      const r = await sendEnvelope(envelope, media.kind, id, row.otherId, pub, ver);
      confirmPending(pendingId, { id: r.id, senderId: r.senderId, text: label, isMine: true, createdAt: r.createdAt, decrypted: true, linkURL: null, media: mediaFromEnvelope(envelope), localPreview: media.previewURL });
    } catch (e) {
      handleSendError(e, pendingId);
    }
  }, [confirmPending, ensureKeys, handleSendError, id, me, row.otherId, setMessages]);

  /** Tap to retry: the failed bubble goes, the same content is sent again. */
  const retry = useCallback(async (pendingId: string) => {
    const r = retries.current.get(pendingId);
    retries.current.delete(pendingId);
    setMessages((prev) => prev.filter((m) => m.id !== pendingId));
    if (!r) return;
    if (r.kind === "text") await send(r.text); else await sendMedia(r.media);
  }, [send, sendMedia, setMessages]);

  const unblock = useCallback(async () => {
    await unblockUser(row.otherId);
    setBlockedState(null);
  }, [row.otherId]);

  // ── Grouping / chapters ────────────────────────────────────────────────
  const startsRun = useCallback((i: number, list: DMMessage[] = messages): boolean => {
    if (i <= 0) return true;
    const a = list[i - 1], b = list[i];
    return a.isMine !== b.isMine || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() > 300_000;
  }, [messages]);
  const endsRun = useCallback((i: number, list: DMMessage[] = messages): boolean => (i >= list.length - 1 ? true : startsRun(i + 1, list)), [messages, startsRun]);
  const showsTimeStamp = useCallback((i: number, list: DMMessage[] = messages): boolean => {
    if (i <= 0) return true;
    return new Date(list[i].createdAt).getTime() - new Date(list[i - 1].createdAt).getTime() > 20 * 60_000;
  }, [messages]);

  /** The receipt sits under the last message, only when it is mine. */
  const last = messages[messages.length - 1];
  const receiptMessageId = last && last.isMine ? last.id : null;
  const lastMineId = () => [...messagesRef.current].reverse().find((m) => m.isMine && !isPendingId(m.id))?.id ?? null;

  // ── Lifecycle ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Viewed — recorded the moment the screen appears, from what the row
    // already knows; refined to the true newest once loaded.
    noteViewedNow(row.lastMessage?.id ?? null);
    void markReadIfVisible();
    void load();
    const offs = [
      onDM("message", ({ conversationId, message }) => { if (conversationId === id) void receive(message); }),
      onDM("read", ({ conversationId, userId, readAt }) => {
        if (conversationId !== id) return;
        if (userId && userId === me) return;                      // our own read, echoed
        if (!userId && justPostedRead()) { void pollForNew(); return; }
        noteOtherRead(lastMineId(), readAt);
        if (!readAt) void pollForNew();
      }),
      onDM("typing", ({ conversationId, userId }) => { if (conversationId === id && userId !== me) noteTyping(); }),
      onDM("removed", ({ conversationId }) => { if (conversationId === id) onRemovedRef.current(); }),
    ];
    // Belt-and-braces arrival: the socket keeps it instant, the poll guarantees it's never stale.
    const poll = setInterval(() => { if (visibleRef.current) void pollForNew(); }, 5000);
    return () => {
      offs.forEach((off) => off());
      clearInterval(poll);
      if (typingClear.current) clearTimeout(typingClear.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const firstVisible = useRef(true);
  useEffect(() => {
    setOpenConversation(visible ? id : null);
    // Back to the foreground: catch up and tell the server we're looking
    // (the first run is covered by load()).
    if (visible && !firstVisible.current) { void pollForNew(); void markReadIfVisible(); }
    firstVisible.current = false;
    return () => { setOpenConversation(null); };
  }, [visible, id, pollForNew, markReadIfVisible]);

  return {
    messages, loaded, canLoadMore, isLoadingMore, blockedState, sendError, clearSendError: () => setSendError(null),
    otherIsTyping, receipt, receiptMessageId, seenLabel,
    load, loadMore, send, sendMedia, retry, unblock, startsRun, endsRun, showsTimeStamp,
  };
}
