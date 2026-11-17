// messages/use-thread.ts — MessageThreadViewModel as a hook.
//
// Messages oldest → newest, keyset paging upward, read-on-open, the
// optimistic send path (pending bubble → server row; a failed text keeps
// its bubble with a retry, a failed photo/video is removed with the error),
// their read receipt from two facts (an id boundary from
// dm:read, a server-stamped time), typing, and the blocked states.
//
// Oct 28 (MessagesView.swift / DirectMessages.swift): unsend (delete) and
// edit your own messages — both show at once and come back as they were if
// the server refuses — dm:deleted / dm:edited from any device, and the poll
// reconciling both for the span its newest page covers.
//
// Nov 17 (DirectMessages.swift / MessagesView.swift): a message this
// browser can't open gets no bubble — first page, earlier pages, socket,
// poll, edits — and is kept aside (hiddenRows) to be tried again once a
// minute; nothing is deleted. A message of mine that drops out of the
// server's page may be hidden by a lost-key report rather than unsent: the
// versions this browser holds are taken back first, and only if none come
// back is it removed. Runs: one person's messages stay together until the
// other writes or a time stamp comes between them (no five-minute break).
//
// Nov 17, parity N5-3 / N5-4 / N12-5 / N15-3 / N15-4 / N15-5
// (MessagesView.swift MessageThreadViewModel, MessageActions.swift,
// GroupChats.swift): a group thread — the group's row kept fresh from every
// page (people, read stamps, key version), its grey lines (the server's
// `events`, else "joined" lines from the roster), who has read the newest
// message (a read only when the stamp is past their join), "Sending…" →
// "Sent" → "Seen by", the typist's avatar; replies, forwards, reactions,
// pins, delete for you; "Seen" stays on the newest message of mine they saw
// while a newer one is unseen; and the new-message check behind the
// personal socket (every 3 s only while it's down, once when it's back,
// every 30 s while up; never while the tab is hidden or the server is busy).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, isServerBusy } from "@/lib/api";
import { useAppState } from "@/store/app-state";
import type { FlairUser } from "@/components/ui/premium-flair";
import {
  asURL, conversation as fetchConversation, decryptIn, deleteMessage, DMUserError, editTextTo, explainActionError, forgetLatestIf, forgetPendingLatest, hide as hideOnServer,
  markRead, messages as fetchMessages, noteLocalMessage, onDM, openReactions, pin as pinOnServer, publicKeyFor, react as reactOnServer, readLedger,
  reclaimHeldVersions, replaceLatestIf, sendEnvelopeTo, sendTextTo, socketConnected, unblockUser, type DMKeyContext, type SealTarget,
} from "./service";
import { DMMediaError, uploadMedia, type PreparedMedia } from "./media";
import type { DMEnvelope } from "./crypto";
import { emitReadLocal, rememberRow, setOpenConversation } from "./dm-local";
import { seenLabelFor } from "./format-dm";
import {
  isGroupRow, isPendingId, memberFlair, memberOf, otherFlair,
  type DMConversationRow, type DMGroupEvent, type DMMedia, type DMMember, type DMMessage, type DMMessageRow, type DMQuote, type DMReaction, type DMReactionRow, type DMThreadPage,
} from "./types";

export interface BlockedState { text: string; offersUnblock: boolean }
export interface GroupNote { id: string; text: string }
export interface ThreadAlert { title: string; message: string }

const NO_KEY_TEXT = "This user can't receive messages yet — they haven't opened the latest Insight.";
const PAGE = 50;
/** Messages that won't open here are tried again this often. */
const HIDDEN_RETRY_MS = 60_000;
/** Edit is offered for 15 minutes after the send. */
export const DM_EDIT_WINDOW_MS = 15 * 60_000;
/** Three pins at most a conversation. */
export const PIN_LIMIT = 3;

type Retry = { kind: "text"; text: string; replyTo: DMQuote | null };

export function mediaFromEnvelope(e: DMEnvelope): DMMedia | null {
  if ((e.t !== "image" && e.t !== "video") || !e.id || !e.key || !e.nonce) return null;
  return {
    kind: e.t, blobId: e.id, key: e.key, nonce: e.nonce,
    mime: e.mime ?? (e.t === "image" ? "image/jpeg" : "video/mp4"),
    width: e.w ?? 0, height: e.h ?? 0, duration: e.dur ?? null,
    posterId: e.poster ?? null, posterNonce: e.pnonce ?? null,
  };
}

const sameReactions = (a: DMReaction[], b: DMReaction[]) =>
  a.length === b.length && a.every((r, i) => r.userId === b[i].userId && r.emoji === b[i].emoji);

export function useThread(row: DMConversationRow, visible: boolean, onRemoved: () => void) {
  const { user } = useAppState();
  const me = user?.id ?? "";
  const id = row.id;
  const isGroup = isGroupRow(row);   // a chat never changes kind

  const [messages, setMessagesState] = useState<DMMessage[]>([]);
  const messagesRef = useRef<DMMessage[]>([]);
  const setMessages = useCallback((next: DMMessage[] | ((prev: DMMessage[]) => DMMessage[])) => {
    const v = typeof next === "function" ? next(messagesRef.current) : next;
    messagesRef.current = v;
    setMessagesState(v);
  }, []);

  // The conversation as this thread knows it now: a group's people, read
  // stamps and key version move (the inbox row is the start).
  const [conv, setConvState] = useState<DMConversationRow>(row);
  const convRef = useRef<DMConversationRow>(row);
  const setConv = useCallback((next: DMConversationRow | ((c: DMConversationRow) => DMConversationRow)) => {
    const v = typeof next === "function" ? next(convRef.current) : next;
    convRef.current = v;
    setConvState(v);
    rememberRow(v);
  }, []);

  // Pinned to the top, newest pin first (three at most).
  const [pins, setPinsState] = useState<DMMessage[]>([]);
  const pinsRef = useRef<DMMessage[]>([]);
  const setPins = useCallback((next: DMMessage[] | ((prev: DMMessage[]) => DMMessage[])) => {
    const v = typeof next === "function" ? next(pinsRef.current) : next;
    pinsRef.current = v;
    setPinsState(v);
  }, []);

  // A group's grey lines from the server; undefined while it sends none (then the roster's "joined" lines).
  const [, setEventsState] = useState<DMGroupEvent[] | undefined>(undefined);
  const eventsRef = useRef<DMGroupEvent[] | undefined>(undefined);

  const [loaded, setLoaded] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [isLoadingMore, setLoadingMore] = useState(false);
  const [blockedState, setBlockedState] = useState<BlockedState | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [alert, setAlert] = useState<ThreadAlert | null>(null);
  // A passing confirmation over the thread ("Pinned", "Deleted for you"); `n` restarts it.
  const [notice, setNotice] = useState<{ n: number; text: string } | null>(null);
  const say = useCallback((text: string) => setNotice((t) => ({ n: (t?.n ?? 0) + 1, text })), []);
  const [otherIsTyping, setTyping] = useState(false);
  const [typingMember, setTypingMember] = useState<DMMember | null>(null);
  const [receipt, setReceipt] = useState<{ throughId: string | null; at: string | null; learnedAt: string | null }>({ throughId: null, at: null, learnedAt: null });
  const receiptRef = useRef(receipt);

  const oldestRow = useRef<DMMessageRow | null>(null);
  const otherKey = useRef<{ pub: string | null; ver: number | null }>({ pub: row.otherPublicKey, ver: row.otherKeyVersion });
  const lastOwnReadPostAt = useRef(0);
  const typingClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTheirsAt = useRef(0);
  const retries = useRef(new Map<string, Retry>());
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const canLoadMoreRef = useRef(canLoadMore);
  canLoadMoreRef.current = canLoadMore;
  const onRemovedRef = useRef(onRemoved);
  onRemovedRef.current = onRemoved;

  /** What opens this thread's ciphertext: the other person's key, or the group's. */
  const ctxNow = useCallback((): DMKeyContext => {
    const c = convRef.current;
    return isGroupRow(c)
      ? { kind: "group", conversationId: id, keyVersion: c.groupKeyVersion }
      : { kind: "pair", otherUserId: row.otherId, publicKey: otherKey.current.pub, keyVersion: otherKey.current.ver };
  }, [id, row.otherId]);

  // ── Who's who (a group) ────────────────────────────────────────────────
  /** The person behind a message: the group member, else the other person. */
  const sender = useCallback((m: DMMessage): FlairUser => {
    const c = convRef.current;
    if (isGroupRow(c)) {
      const member = memberOf(c, m.senderId);
      if (member) return memberFlair(member);
      if (m.isMine && user) return user;
      return { id: m.senderId, username: "Member", avatarURL: null, isPremium: false, premiumStyle: null };
    }
    return otherFlair(row);
  }, [row, user]);

  /** For a reply's caption in a group: who replied, whom they quoted. */
  const quoteNames = useCallback((m: DMMessage): { replier: string | null; quoted: string | null } => {
    const q = m.replyTo;
    if (!q || !isGroupRow(convRef.current)) return { replier: null, quoted: null };
    const quoted = q.senderId === me ? null : memberOf(convRef.current, q.senderId)?.username ?? null;
    return { replier: m.isMine ? null : sender(m).username, quoted };
  }, [me, sender]);

  /** Who has read a message (N15-4): everyone in the group but its sender
   *  and me whose read stamp reaches it AND is later than when they joined
   *  (the server stamps a person as having read when they are added). A
   *  null stamp is not a read. */
  const readers = useCallback((m: DMMessage): DMMember[] => {
    const c = convRef.current;
    if (!isGroupRow(c) || isPendingId(m.id)) return [];
    const at = new Date(m.createdAt).getTime();
    return c.members.filter((member) => {
      if (member.id === me || member.id === m.senderId || !member.lastReadAt) return false;
      const read = new Date(member.lastReadAt).getTime();
      if (read < at) return false;
      return member.joinedAt ? read > new Date(member.joinedAt).getTime() : true;
    });
  }, [me]);

  // ── What happened to the group (N15-5) ─────────────────────────────────
  const takeEvents = useCallback((fresh: DMGroupEvent[] | undefined) => {
    if (!isGroup || fresh === undefined) return;
    const have = new Set((eventsRef.current ?? []).map((e) => e.id));
    const next = [...(eventsRef.current ?? []), ...fresh.filter((e) => !have.has(e.id))]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    eventsRef.current = next;
    setEventsState(next);
  }, [isGroup]);

  /** One event as a line, from where I stand. Names as the roster has them
   *  now, else the ones sent with the event. An unknown kind gives no line. */
  const eventText = useCallback((e: DMGroupEvent): string | null => {
    const c = convRef.current;
    const name = (uid: string | null, sent: string | null) => (uid ? memberOf(c, uid)?.username : null) ?? sent ?? "Someone";
    const actor = name(e.actorId, e.actorUsername), target = name(e.targetId, e.targetUsername);
    const byMe = !!e.actorId && e.actorId === me, toMe = !!e.targetId && e.targetId === me;
    switch (e.kind) {
      case "added":
        if (!e.actorId) return toMe ? "You joined the group" : `${target} joined the group`;
        if (byMe) return `You added ${target}`;
        return toMe ? `${actor} added you` : `${actor} added ${target}`;
      case "removed":
        if (byMe) return `You removed ${target}`;
        return toMe ? `${actor} removed you` : `${actor} removed ${target}`;
      case "left":
        return byMe ? "You left the group" : `${actor} left the group`;
      case "renamed":
        if (!e.detail) return byMe ? "You removed the group name" : `${actor} removed the group name`;
        return byMe ? `You named the group ${e.detail}` : `${actor} named the group ${e.detail}`;
      default:
        return null;
    }
  }, [me]);

  /** A roster line: "ivan added karlo" when the row says who added them, else "karlo joined the group". */
  const joinText = useCallback((member: DMMember): string => {
    if (member.addedBy) {
      if (member.addedBy === me) return `You added ${member.username}`;
      const adder = memberOf(convRef.current, member.addedBy)?.username ?? member.addedByUsername;
      if (adder) return member.id === me ? `${adder} added you` : `${adder} added ${member.username}`;
    }
    return member.id === me ? "You joined the group" : `${member.username} joined the group`;
  }, [me]);

  const notesBetween = useCallback((after: number, upTo: number): GroupNote[] => {
    const c = convRef.current;
    if (!isGroupRow(c)) return [];
    const evs = eventsRef.current;
    if (evs) {
      const out: GroupNote[] = [];
      for (const e of evs) {
        const t = new Date(e.createdAt).getTime();
        if (t <= after || t > upTo) continue;
        const text = eventText(e);
        if (text) out.push({ id: `event-${e.id}`, text });
      }
      return out;
    }
    // From the roster: everyone who joined after the group was made (the
    // people it was made with share the group's own stamp).
    if (!c.createdAt) return [];
    const made = new Date(c.createdAt).getTime();
    return c.members
      .filter((m) => {
        if (!m.joinedAt) return false;
        const at = new Date(m.joinedAt).getTime();
        return at - made > 1000 && at > after && at <= upTo;
      })
      .sort((a, b) => new Date(a.joinedAt!).getTime() - new Date(b.joinedAt!).getTime())
      .map((m) => ({ id: `join-${m.id}`, text: joinText(m) }));
  }, [eventText, joinText]);

  /** The lines just above message `i`: after the message before it, up to this one. */
  const groupNotesAbove = useCallback((i: number, list: DMMessage[] = messagesRef.current): GroupNote[] => {
    if (!isGroup || i < 0 || i >= list.length) return [];
    if (i === 0 && canLoadMoreRef.current && eventsRef.current === undefined) return [];
    return notesBetween(i === 0 ? -Infinity : new Date(list[i - 1].createdAt).getTime(), new Date(list[i].createdAt).getTime());
  }, [isGroup, notesBetween]);
  /** The lines after the newest message, or every line in a group nobody has written in yet. */
  const groupNotesAtEnd = useCallback((list: DMMessage[] = messagesRef.current): GroupNote[] => {
    if (!isGroup) return [];
    const last = list[list.length - 1];
    return notesBetween(last ? new Date(last.createdAt).getTime() : -Infinity, Infinity);
  }, [isGroup, notesBetween]);

  /** One of the group read: their avatar moves under the newest message. */
  const noteMemberRead = useCallback((userId: string, at: string | null) => {
    const c = convRef.current;
    const i = c.members.findIndex((m) => m.id === userId);
    if (i < 0) return;
    const stamp = at ?? new Date().toISOString();
    const cur = c.members[i].lastReadAt;
    if (cur && new Date(stamp) <= new Date(cur)) return;
    const members = c.members.slice();
    members[i] = { ...members[i], lastReadAt: stamp };
    setConv({ ...c, members });
  }, [setConv]);

  /** The page carries the group fresh: its people with their read stamps, and the key version to seal with. */
  const takeGroup = useCallback((page: DMThreadPage) => {
    if (!isGroup) return;
    const c = convRef.current;
    const next = { ...c };
    if (page.members && page.members.length) next.members = page.members;
    if (page.groupKeyVersion != null) next.groupKeyVersion = page.groupKeyVersion;
    if (page.keyRotationNeeded != null) next.keyRotationNeeded = page.keyRotationNeeded;
    setConv(next);
    takeEvents(page.events);
  }, [isGroup, setConv, takeEvents]);

  /** After a dm:group_updated, or when the group's page opens. */
  const refreshConversation = useCallback(async () => {
    if (!isGroup) return;
    const fresh = await fetchConversation(id);
    if (fresh && isGroupRow(fresh)) setConv(fresh);
  }, [id, isGroup, setConv]);

  // ── Their read receipt (a direct chat) ─────────────────────────────────
  /** "Seen" is WHEN THEY FIRST SAW IT: a newer read stamp is taken only when
   *  it covers something of mine they hadn't seen (the boundary moved, or a
   *  message of mine sits between the old stamp and the new one). */
  const noteOtherRead = useCallback((throughId: string | null, at: string | null) => {
    const cur = receiptRef.current;
    let next = { ...cur };
    let changed = false;
    let boundaryAdvanced = false;
    if (throughId && !isPendingId(throughId) && throughId !== cur.throughId) {
      // The boundary only moves forward.
      let older = false;
      if (cur.throughId) {
        const list = messagesRef.current;
        const ci = list.findIndex((m) => m.id === cur.throughId);
        const ni = list.findIndex((m) => m.id === throughId);
        if (ci >= 0 && ni >= 0) older = ni < ci;
      }
      if (!older) { next.throughId = throughId; changed = true; boundaryAdvanced = true; }
    }
    if (at && (!cur.at || new Date(at) > new Date(cur.at))) {
      const previous = cur.at ? new Date(cur.at).getTime() : -Infinity;
      const stamp = new Date(at).getTime();
      const coversNew = messagesRef.current.some((m) => m.isMine && !isPendingId(m.id) && new Date(m.createdAt).getTime() > previous && new Date(m.createdAt).getTime() <= stamp);
      if (!cur.at || boundaryAdvanced || coversNew) { next.at = at; changed = true; }
    }
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

  /** A group message of mine nobody has read yet: "Sending…" · "Sent". */
  const sentLabel = useCallback((m: DMMessage): string => (isPendingId(m.id) ? (m.failed ? "Not sent" : "Sending…") : "Sent"), []);

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
  /** The dots show only while they're actually typing: each typing event
   *  (sent every ~2 s while keys are pressed) keeps them for 2.5 s more, and
   *  a typing event that was already on the wire when their message landed
   *  doesn't bring them back for a message that's already here. In a group
   *  the dots carry the typist's avatar. */
  const noteTyping = useCallback((who: string) => {
    const c = convRef.current;
    if (isGroupRow(c)) {
      const m = memberOf(c, who);
      if (!m) return;
      setTypingMember(m);
    } else if (who && who !== row.otherId) {
      return;
    }
    if (Date.now() - lastTheirsAt.current < 1200) return;
    setTyping(true);
    if (typingClear.current) clearTimeout(typingClear.current);
    typingClear.current = setTimeout(() => setTyping(false), 2500);
  }, [row.otherId]);

  // ── Load / page / receive ──────────────────────────────────────────────
  const dec = useCallback((r: DMMessageRow) => decryptIn(r, ctxNow()), [ctxNow]);

  // Ids removed from this thread (deleted here, on another device or by
  // them): a poll page or socket echo that raced the delete never brings
  // them back.
  const removedIds = useRef(new Set<string>());
  // Of those, the ones that only dropped out of the server's page (no
  // dm:deleted): they may come back when lost key versions are taken back.
  const pageDropped = useRef(new Set<string>());
  // Rows this browser can't open: no bubble, tried again once a minute.
  const hiddenRows = useRef(new Map<string, DMMessageRow>());

  /** A message lands where its time puts it: the bottom for anything new, its own place for anything that isn't. */
  const insertInOrder = useCallback((m: DMMessage) => {
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev;
      const at = new Date(m.createdAt).getTime();
      const last = prev[prev.length - 1];
      if (!last || at >= new Date(last.createdAt).getTime()) return [...prev, m];
      let i = prev.length;
      while (i > 0 && new Date(prev[i - 1].createdAt).getTime() > at) i--;
      return [...prev.slice(0, i), m, ...prev.slice(i)];
    });
  }, [setMessages]);

  const receive = useCallback(async (r: DMMessageRow) => {
    if (removedIds.current.has(r.id)) return;
    if (messagesRef.current.some((m) => m.id === r.id)) return;
    const m = await dec(r);
    if (removedIds.current.has(r.id) || messagesRef.current.some((x) => x.id === r.id)) return;
    if (!m.decrypted) { hiddenRows.current.set(r.id, r); return; }   // hidden: no bubble, no preview
    hiddenRows.current.delete(r.id);
    if (m.isMine) {
      const i = messagesRef.current.findIndex((x) => isPendingId(x.id) && !x.failed && x.text === m.text && x.media === null && m.media === null);
      if (i >= 0) {
        // Our own message came back before the send call returned.
        setMessages((prev) => prev.map((x, j) => (j === i ? m : x)));
        noteLocalMessage(id, m);
        return;
      }
    }
    if (!m.isMine) { if (typingClear.current) clearTimeout(typingClear.current); setTyping(false); lastTheirsAt.current = Date.now(); }
    insertInOrder(m);
    noteLocalMessage(id, m);
    if (!m.isMine) await markReadIfVisible();
  }, [dec, id, insertInOrder, markReadIfVisible, setMessages]);

  /** A message left the thread (unsent here, on another device, or by them). */
  const dropMessage = useCallback((messageId: string) => {
    removedIds.current.add(messageId);
    hiddenRows.current.delete(messageId);
    setPins((prev) => prev.filter((p) => p.id !== messageId));
    const list = messagesRef.current;
    const i = list.findIndex((m) => m.id === messageId);
    if (i < 0) return;
    const next = list.filter((_, j) => j !== i);
    setMessages(next);
    // The inbox preview falls back to the previous message.
    const prev = [...next].reverse().find((m) => !isPendingId(m.id)) ?? null;
    forgetLatestIf(id, messageId, prev);
  }, [id, setMessages, setPins]);

  /** A shown message that no longer opens here: out of the list (kept aside to try again), the preview falls back. */
  const hideLocally = useCallback((r: DMMessageRow) => {
    hiddenRows.current.set(r.id, r);
    setPins((prev) => prev.filter((p) => p.id !== r.id));
    const next = messagesRef.current.filter((m) => m.id !== r.id);
    if (next.length === messagesRef.current.length) return;
    setMessages(next);
    forgetLatestIf(id, r.id, [...next].reverse().find((m) => !isPendingId(m.id)) ?? null);
  }, [id, setMessages, setPins]);

  /** An edited row (socket or poll): decrypt it and swap it in place, keeping the reactions and pin when the row doesn't carry them. */
  const swapEdited = useCallback(async (r: DMMessageRow) => {
    // A hidden row keeps its newest words for the next try.
    if (hiddenRows.current.has(r.id)) { hiddenRows.current.set(r.id, r); return; }
    if (!messagesRef.current.some((m) => m.id === r.id)) return;
    const m = await dec(r);
    if (!m.decrypted) { hideLocally(r); return; }
    const cur = messagesRef.current.find((x) => x.id === r.id);
    if (!cur) return;
    const next: DMMessage = {
      ...cur, text: m.text, linkURL: m.linkURL, decrypted: m.decrypted, replyTo: m.replyTo ?? cur.replyTo, forwarded: m.forwarded ?? cur.forwarded,
      editedAt: r.editedAt ?? cur.editedAt ?? new Date().toISOString(),
      reactions: r.reactions ? m.reactions : cur.reactions,
      pinnedAt: r.pinnedAt ?? cur.pinnedAt,
    };
    setMessages((prev) => prev.map((x) => (x.id === r.id ? next : x)));
    setPins((prev) => prev.map((p) => (p.id === r.id ? { ...next, pinnedAt: p.pinnedAt } : p)));
    replaceLatestIf(id, next);
  }, [dec, hideLocally, id, setMessages, setPins]);

  /** Hidden rows, tried again (the 60 s timer, and at once when keys come back). */
  const retryHidden = useCallback(async () => {
    if (hiddenRows.current.size === 0) return;
    let theirs = false;
    for (const r of [...hiddenRows.current.values()]) {
      if (removedIds.current.has(r.id)) { hiddenRows.current.delete(r.id); continue; }
      const m = await dec(r);
      if (!m.decrypted || !hiddenRows.current.has(r.id)) continue;
      hiddenRows.current.delete(r.id);
      if (removedIds.current.has(r.id) || messagesRef.current.some((x) => x.id === r.id)) continue;
      insertInOrder(m);
      noteLocalMessage(id, m);
      if (!m.isMine) theirs = true;
    }
    if (theirs) await markReadIfVisible();
  }, [dec, id, insertInOrder, markReadIfVisible]);

  // ── Reactions · pins (the state) ───────────────────────────────────────
  const setReactions = useCallback((list: DMReaction[], messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: list } : m)));
    setPins((prev) => prev.map((p) => (p.id === messageId ? { ...p, reactions: list } : p)));
  }, [setMessages, setPins]);

  const setPinned = useCallback((messageId: string, at: string | null, fallback: DMMessage | null) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pinnedAt: at } : m)));
    const rest = pinsRef.current.filter((p) => p.id !== messageId);
    const base = messagesRef.current.find((m) => m.id === messageId) ?? fallback;
    const next = at && base ? [...rest, { ...base, pinnedAt: at }] : rest;
    next.sort((a, b) => new Date(b.pinnedAt ?? 0).getTime() - new Date(a.pinnedAt ?? 0).getTime());
    setPins(next);
  }, [setMessages, setPins]);

  /** The page's pins (full rows, so a pin older than the page still shows): opened and taken when they differ from what's shown. */
  const takePins = useCallback(async (rows: DMMessageRow[]) => {
    const cur = pinsRef.current;
    const same = rows.length === cur.length && rows.every((r, i) => r.id === cur[i].id && r.pinnedAt === cur[i].pinnedAt);
    if (same) return;
    const out: DMMessage[] = [];
    for (const r of rows) {
      const m = messagesRef.current.find((x) => x.id === r.id);
      if (m) { out.push({ ...m, pinnedAt: r.pinnedAt ?? new Date().toISOString() }); continue; }
      const p = await dec(r);
      if (!p.decrypted) continue;
      out.push({ ...p, pinnedAt: p.pinnedAt ?? new Date().toISOString() });
    }
    const ids = new Map(out.map((p) => [p.id, p.pinnedAt ?? null]));
    setMessages((prev) => prev.map((m) => {
      const at = ids.has(m.id) ? ids.get(m.id)! : null;
      return (m.pinnedAt ?? null) === at ? m : { ...m, pinnedAt: at };
    }));
    out.sort((a, b) => new Date(b.pinnedAt ?? 0).getTime() - new Date(a.pinnedAt ?? 0).getTime());
    setPins(out);
  }, [dec, setMessages, setPins]);

  /** `admit`: ids taken back from a lost-key report, let in wherever they sit. */
  const pollForNew = useCallback(async (admit?: Set<string>) => {
    let page;
    try { page = await fetchMessages(id); } catch { return; }
    const rows = page.messages;                     // newest first
    takeGroup(page);
    // The newest page is the truth for the span it covers: a message inside
    // it that it no longer lists was unsent (or deleted for me on another
    // device), a row with a newer edited_at was edited. Anything newer than
    // its newest row is never judged (it may have landed while the page loaded).
    if (rows.length > 0) {
      const newestAt = new Date(rows[0].createdAt).getTime();
      const oldestAt = new Date(rows[rows.length - 1].createdAt).getTime();
      const wholeThread = rows.length < PAGE;
      const listed = new Map(rows.map((r) => [r.id, r]));
      const gone: DMMessage[] = [];
      for (const m of messagesRef.current) {
        if (isPendingId(m.id) || listed.has(m.id)) continue;
        const t = new Date(m.createdAt).getTime();
        if (t > newestAt) continue;
        if (!wholeThread && t <= oldestAt) continue;
        gone.push(m);
      }
      // A message of mine the page dropped may be hidden, not unsent:
      // another device of mine reported its key lost. Taken back, the page
      // is read again (keysReclaimed) and nothing is removed.
      if (gone.some((m) => m.isMine) && (await reclaimHeldVersions(true))) return;
      for (const m of gone) { dropMessage(m.id); pageDropped.current.add(m.id); }
      for (const r of rows) {
        if (!r.editedAt) continue;
        const hidden = hiddenRows.current.get(r.id);
        if (hidden) { if (hidden.editedAt !== r.editedAt) hiddenRows.current.set(r.id, r); continue; }
        const cur = messagesRef.current.find((m) => m.id === r.id);
        if (cur && (!cur.editedAt || new Date(r.editedAt) > new Date(cur.editedAt))) await swapEdited(r);
      }
      // Reactions the socket missed: re-opened when the people differ.
      for (const r of rows) {
        const cur = messagesRef.current.find((m) => m.id === r.id);
        if (!cur) continue;
        const listedIds = new Set((r.reactions ?? []).map((x) => x.userId));
        const shownIds = new Set((cur.reactions ?? []).map((x) => x.userId));
        if (listedIds.size !== shownIds.size || [...listedIds].some((u) => !shownIds.has(u))) {
          setReactions(await openReactions(r.reactions ?? [], ctxNow()), r.id);
        }
      }
    }
    if (page.pins) await takePins(page.pins);
    // Only what's newer than the oldest message on screen is new: an older
    // one the page slid back to (after a delete) belongs to "Load earlier".
    // Rows already hidden wait for their once-a-minute retry.
    const floorMsg = messagesRef.current.find((m) => !isPendingId(m.id));
    const floor = floorMsg ? new Date(floorMsg.createdAt).getTime() : null;
    const known = new Set(messagesRef.current.map((m) => m.id));
    const fresh = rows
      .filter((r) => !known.has(r.id) && !hiddenRows.current.has(r.id) && (floor === null || new Date(r.createdAt).getTime() >= floor || !!admit?.has(r.id)))
      .reverse();
    if (!isGroup && page.otherLastReadAt) noteOtherRead(null, page.otherLastReadAt);
    for (const r of fresh) await receive(r);
  }, [ctxNow, dropMessage, id, isGroup, noteOtherRead, receive, setReactions, swapEdited, takeGroup, takePins]);

  const ensureKeys = useCallback(async () => {
    if (isGroup) return true;
    if (otherKey.current.pub && otherKey.current.ver != null) return true;
    try {
      const fresh = await publicKeyFor(row.otherId, null);
      if (fresh.publicKey && fresh.keyVersion != null) { otherKey.current = { pub: fresh.publicKey, ver: fresh.keyVersion }; return true; }
    } catch { /* no key yet */ }
    return false;
  }, [isGroup, row.otherId]);

  const load = useCallback(async () => {
    await ensureKeys();
    if (!isGroup) {
      seedReceipt();
      if (row.otherLastReadAt) noteOtherRead(null, row.otherLastReadAt);
    }
    let page;
    try { page = await fetchMessages(id); } catch { setLoaded(true); return; }
    if (!isGroup && page.otherLastReadAt) noteOtherRead(null, page.otherLastReadAt);
    takeGroup(page);
    const rows = page.messages;                 // newest first
    oldestRow.current = rows[rows.length - 1] ?? null;
    setCanLoadMore(rows.length >= PAGE);
    const out: DMMessage[] = [];
    for (const r of [...rows].reverse()) {
      const m = await dec(r);
      if (m.decrypted) { out.push(m); hiddenRows.current.delete(r.id); } else hiddenRows.current.set(r.id, r);   // one that won't open here is hidden
    }
    // Merge, never replace: a socket-delivered message that arrived while
    // this page was in flight would otherwise be dropped.
    const byId = new Map<string, DMMessage>();
    for (const m of messagesRef.current) byId.set(m.id, m);
    for (const m of out) byId.set(m.id, m);
    let merged = [...byId.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const realMine = new Set(merged.filter((m) => m.isMine && !isPendingId(m.id) && m.media === null).map((m) => m.text));
    merged = merged.filter((m) => !(isPendingId(m.id) && !m.failed && m.media === null && realMine.has(m.text)));
    setMessages(merged);
    // Their read stamp again, now that the messages it may cover are here
    // (a newer stamp is taken only when it covers something of mine).
    if (!isGroup && page.otherLastReadAt) noteOtherRead(null, page.otherLastReadAt);
    if (page.pins) await takePins(page.pins);
    else setPins(merged.filter((m) => m.pinnedAt).sort((a, b) => new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime()));
    setLoaded(true);
    await markReadIfVisible();
  }, [dec, ensureKeys, id, isGroup, markReadIfVisible, noteOtherRead, row.otherLastReadAt, seedReceipt, setMessages, setPins, takeGroup, takePins]);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !oldestRow.current) return;
    setLoadingMore(true);
    try {
      const page = await fetchMessages(id, oldestRow.current);
      takeEvents(page.events);
      const rows = page.messages;
      if (rows.length === 0) { setCanLoadMore(false); return; }
      oldestRow.current = rows[rows.length - 1];
      setCanLoadMore(rows.length >= PAGE);
      const older: DMMessage[] = [];
      for (const r of [...rows].reverse()) {
        const m = await dec(r);
        if (m.decrypted) older.push(m); else if (!removedIds.current.has(r.id)) hiddenRows.current.set(r.id, r);
      }
      const known = new Set(messagesRef.current.map((m) => m.id));
      setMessages((prev) => [...older.filter((m) => !known.has(m.id)), ...prev]);
    } catch { /* the button stays; try again */ } finally {
      setLoadingMore(false);
    }
  }, [dec, id, isLoadingMore, setMessages, takeEvents]);

  // ── Sealing, for whichever chat this is ────────────────────────────────
  /** A group seals with its key (fetched or rotated on demand); a direct chat with the other person's, refreshed when there's none. */
  const sealTarget = useCallback(async (): Promise<SealTarget | null> => {
    const c = convRef.current;
    if (isGroupRow(c)) return { kind: "group", row: c };
    if (!(await ensureKeys())) return null;
    return { kind: "pair", otherUserId: row.otherId, publicKey: otherKey.current.pub!, keyVersion: otherKey.current.ver! };
  }, [ensureKeys, row.otherId]);

  /** The server's row names the group key it was sealed with: a rotation shows in the thread at once. */
  const noteSealedWith = useCallback((r: DMMessageRow | null) => {
    const v = r?.groupKeyVersion;
    const c = convRef.current;
    if (v == null || !isGroupRow(c) || (v <= (c.groupKeyVersion ?? 0) && !c.keyRotationNeeded)) return;
    setConv({ ...c, groupKeyVersion: Math.max(v, c.groupKeyVersion ?? 0), keyRotationNeeded: false });
  }, [setConv]);

  // ── Send ───────────────────────────────────────────────────────────────
  /** A failed send keeps its bubble ("Tap to retry") and hands the inbox back the last real message. */
  const markFailed = useCallback((pendingId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, failed: true } : m)));
    const prev = [...messagesRef.current].reverse().find((m) => !isPendingId(m.id));
    if (prev) noteLocalMessage(id, prev); else forgetPendingLatest(id, pendingId);
  }, [id, setMessages]);

  const dropPending = useCallback((pendingId: string) => {
    retries.current.delete(pendingId);
    setMessages((prev) => prev.filter((m) => m.id !== pendingId));
    const prev = [...messagesRef.current].reverse().find((m) => !isPendingId(m.id));
    if (prev) noteLocalMessage(id, prev); else forgetPendingLatest(id, pendingId);
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
    if (e instanceof DMMediaError || e instanceof DMUserError) { setSendError(e.message); return; }
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

  const send = useCallback(async (text: string, replyTo: DMQuote | null = null) => {
    // No key on the row? Ask the key endpoint live — they may have published since.
    const target = await sealTarget();
    if (!target) { setBlockedState({ text: NO_KEY_TEXT, offersUnblock: false }); return; }
    setBlockedState(null);
    const pendingId = "pending-" + crypto.randomUUID();
    const pending: DMMessage = { id: pendingId, senderId: me, text, isMine: true, createdAt: new Date().toISOString(), decrypted: true, linkURL: asURL(text) ? text.trim() : null, media: null, replyTo };
    retries.current.set(pendingId, { kind: "text", text, replyTo });
    setMessages((prev) => [...prev, pending]);
    noteLocalMessage(id, pending);
    try {
      const r = await sendTextTo(text, id, target, replyTo);
      noteSealedWith(r);
      // Show our own plaintext (no need to decrypt what we just sealed).
      confirmPending(pendingId, { id: r.id, senderId: r.senderId, text, isMine: true, createdAt: r.createdAt, decrypted: true, linkURL: pending.linkURL, media: null, replyTo });
    } catch (e) {
      handleSendError(e, pendingId);
    }
  }, [confirmPending, handleSendError, id, me, noteSealedWith, sealTarget, setMessages]);

  /** A photo/video send that didn't make it: the pending bubble goes and the
   *  error shows (MessagesView.sendMedia), never a half-sent message. */
  const handleMediaSendError = useCallback((e: unknown, pendingId: string) => {
    dropPending(pendingId);
    if (e instanceof ApiError) {
      if (e.code === "CANNOT_MESSAGE_USER") { setBlockedState({ text: "You can't message this account.", offersUnblock: false }); return; }
      if (e.code === "YOU_BLOCKED_THIS_USER") { setBlockedState({ text: "You blocked this account.", offersUnblock: true }); return; }
      if (e.code === "FEATURE_DISABLED") { setSendError(e.message); return; }
      if (e.isRateLimited) { setSendError("Slow down — messages are limited to 30 a minute."); return; }
      setSendError(e.isConnectionProblem ? "Couldn't send. Check your connection." : e.message);
      return;
    }
    if (e instanceof DMMediaError || e instanceof DMUserError) { setSendError(e.message); return; }
    if (e instanceof Error && e.message === "NOT_LINKED") { setSendError("Link this browser from your phone to send messages."); return; }
    setSendError("Couldn't send. Check your connection.");
  }, [dropPending]);

  /** Optimistic like text: the picked photo/video shows at once as a pending
   *  bubble with a spinner ("Sending…" under it and in the inbox). Nothing is
   *  sent until the bytes are fully up (a video's poster and video in
   *  parallel, both /completed); only then does the envelope go out and the
   *  receipt turn "Sent", so the receiver only ever gets media that plays. */
  const sendMedia = useCallback(async (media: PreparedMedia) => {
    const target = await sealTarget();
    if (!target) { setBlockedState({ text: NO_KEY_TEXT, offersUnblock: false }); return; }
    setBlockedState(null);
    const pendingId = "pending-" + crypto.randomUUID();
    const label = media.kind === "image" ? "📷 Photo" : "🎬 Video";
    const pending: DMMessage = {
      id: pendingId, senderId: me, text: label, isMine: true, createdAt: new Date().toISOString(), decrypted: true, linkURL: null,
      media: { kind: media.kind, blobId: "pending", key: "", nonce: "", mime: media.mime, width: media.width, height: media.height, duration: media.duration ?? null, posterId: null, posterNonce: null },
      localPreview: media.previewURL,
    };
    setMessages((prev) => [...prev, pending]);
    noteLocalMessage(id, pending);
    try {
      const envelope = await uploadMedia(media, id);
      const r = await sendEnvelopeTo(envelope, media.kind, id, target);
      noteSealedWith(r);
      confirmPending(pendingId, { id: r.id, senderId: r.senderId, text: label, isMine: true, createdAt: r.createdAt, decrypted: true, linkURL: null, media: mediaFromEnvelope(envelope), localPreview: media.previewURL });
    } catch (e) {
      handleMediaSendError(e, pendingId);
    }
  }, [confirmPending, handleMediaSendError, id, me, noteSealedWith, sealTarget, setMessages]);

  /** Tap to retry: the failed bubble goes, the same content is sent again. */
  const retry = useCallback(async (pendingId: string) => {
    const r = retries.current.get(pendingId);
    retries.current.delete(pendingId);
    setMessages((prev) => prev.filter((m) => m.id !== pendingId));
    if (r) await send(r.text, r.replyTo);
  }, [send, setMessages]);

  /**
   * Unsend one of yours: gone at once; if the server refuses it goes back
   * where it was and the error comes back (the thread shows "Couldn't
   * delete"). 404 MESSAGE_NOT_FOUND counts as done.
   */
  const remove = useCallback(async (m: DMMessage): Promise<string | null> => {
    if (!m.isMine || isPendingId(m.id)) return null;
    const before = messagesRef.current;
    const at = before.findIndex((x) => x.id === m.id);
    if (at < 0) return null;
    const pinsBefore = pinsRef.current;
    dropMessage(m.id);
    try {
      await deleteMessage(id, m);
      return null;
    } catch (e) {
      removedIds.current.delete(m.id);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.slice(0, at), m, ...prev.slice(at)]));
      setPins(pinsBefore);
      const last = [...messagesRef.current].reverse().find((x) => !isPendingId(x.id));
      if (last) noteLocalMessage(id, last);
      return e instanceof ApiError ? (e.isConnectionProblem ? "Check your connection and try again." : e.message) : "Check your connection and try again.";
    }
  }, [dropMessage, id, setMessages, setPins]);

  /**
   * Edit one of yours (gated by dm_edit): sealed like a send, shown at once
   * with "Edited", put back if the server refuses.
   */
  const edit = useCallback(async (m: DMMessage, text: string): Promise<string | null> => {
    const next = text.trim();
    if (!next || next === m.text || !m.isMine || isPendingId(m.id) || m.media) return null;
    const target = await sealTarget();
    if (!target) return NO_KEY_TEXT;
    const edited: DMMessage = { ...m, text: next, linkURL: asURL(next) ? next : null, editedAt: new Date().toISOString() };
    setMessages((prev) => prev.map((x) => (x.id === m.id ? edited : x)));
    replaceLatestIf(id, edited);
    try {
      const saved = await editTextTo(next, id, m.id, target);
      noteSealedWith(saved);
      if (saved?.editedAt) setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, editedAt: saved.editedAt } : x)));
      return null;
    } catch (e) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      replaceLatestIf(id, m);
      if (e instanceof DMUserError) return e.message;
      if (e instanceof Error && e.message === "NOT_LINKED") return "Link this browser from your phone to send messages.";
      return e instanceof ApiError ? (e.isConnectionProblem ? "Check your connection and try again." : e.message) : "Check your connection and try again.";
    }
  }, [id, noteSealedWith, sealTarget, setMessages]);

  // ── Reactions · pins · delete for you (MessageActions.swift) ───────────
  /** Yours on a message: shown at once, sealed for the server, taken back if it says no. null removes it. */
  const react = useCallback(async (emoji: string | null, m: DMMessage) => {
    if (isPendingId(m.id)) return;
    const cur = messagesRef.current.find((x) => x.id === m.id);
    if (!cur) return;
    const target = await sealTarget();
    if (!target) return;
    const before = cur.reactions ?? [];
    const next = before.filter((r) => !r.isMine);
    if (emoji) next.push({ userId: me, emoji, isMine: true });
    if (sameReactions(next, before)) return;
    setReactions(next, m.id);
    try {
      await reactOnServer(emoji, m.id, id, target);
    } catch (e) {
      setReactions(before, m.id);
      setAlert({ title: "Couldn't react", message: explainActionError(e, "Reactions") });
    }
  }, [id, me, sealTarget, setReactions]);

  /** Theirs (or yours from another device), over the socket: the sealed row replaces that person's reaction; none takes it away. */
  const applyReaction = useCallback(async (messageId: string, userId: string, r: DMReactionRow | null) => {
    const cur = messagesRef.current.find((m) => m.id === messageId);
    if (!cur) return;
    let list = (cur.reactions ?? []).filter((x) => x.userId !== userId);
    if (r) list = [...list, ...(await openReactions([r], ctxNow()))];
    setReactions(list, messageId);
  }, [ctxNow, setReactions]);

  /** Pin or unpin: at once here, then the server; back if it says no. */
  const togglePin = useCallback(async (m: DMMessage) => {
    if (isPendingId(m.id)) return;
    const cur = messagesRef.current.find((x) => x.id === m.id) ?? m;
    const on = !cur.pinnedAt;
    if (on && pinsRef.current.length >= PIN_LIMIT) {
      setAlert({ title: "Pin limit", message: "You can pin up to 3 messages. Unpin one first." });
      return;
    }
    const before = cur.pinnedAt ?? null;
    setPinned(m.id, on ? new Date().toISOString() : null, cur);
    try {
      await pinOnServer(m.id, id, on);
      say(on ? "Pinned" : "Unpinned");
    } catch (e) {
      setPinned(m.id, before, cur);
      const limit = e instanceof ApiError && e.code === "PIN_LIMIT";
      setAlert({ title: on ? (limit ? "Pin limit" : "Couldn't pin") : "Couldn't unpin", message: limit ? "You can pin up to 3 messages. Unpin one first." : explainActionError(e, "Pinning") });
    }
  }, [id, say, setPinned]);

  /** Over the socket. A pinned message that isn't loaded shows once the next page (which lists the pins) arrives. */
  const applyPin = useCallback((messageId: string, pinned: boolean, at: string | null) => {
    setPinned(messageId, pinned ? (at ?? new Date().toISOString()) : null, null);
  }, [setPinned]);

  /** Delete for you: gone from your side on every device; theirs stays. */
  const hide = useCallback(async (m: DMMessage) => {
    if (isPendingId(m.id)) return;
    const at = messagesRef.current.findIndex((x) => x.id === m.id);
    if (at < 0) return;
    const pinsBefore = pinsRef.current;
    dropMessage(m.id);
    try {
      await hideOnServer(m.id, id);
      say("Deleted for you");
    } catch (e) {
      removedIds.current.delete(m.id);
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev.slice(0, at), m, ...prev.slice(at)]));
      setPins(pinsBefore);
      const last = [...messagesRef.current].reverse().find((x) => !isPendingId(x.id));
      if (last) noteLocalMessage(id, last);
      setAlert({ title: "Couldn't delete", message: explainActionError(e, "Delete for you") });
    }
  }, [dropMessage, id, say, setMessages, setPins]);

  const unblock = useCallback(async () => {
    await unblockUser(row.otherId);
    setBlockedState(null);
  }, [row.otherId]);

  // ── Grouping / chapters ────────────────────────────────────────────────
  /** A stamp at the top, and whenever 20+ minutes pass between messages — never per bubble. */
  const showsTimeStamp = useCallback((i: number, list: DMMessage[] = messages): boolean => {
    if (i <= 0) return true;
    return new Date(list[i].createdAt).getTime() - new Date(list[i - 1].createdAt).getTime() > 20 * 60_000;
  }, [messages]);
  /** A run = one sender's consecutive messages, until a time stamp or a
   *  group line comes between them. (It used to break after five minutes
   *  too, which left uneven gaps inside one person's run.) */
  const startsRun = useCallback((i: number, list: DMMessage[] = messages): boolean => {
    if (i <= 0) return true;
    return list[i - 1].senderId !== list[i].senderId || list[i - 1].isMine !== list[i].isMine || showsTimeStamp(i, list) || (isGroup && groupNotesAbove(i, list).length > 0);
  }, [groupNotesAbove, isGroup, messages, showsTimeStamp]);
  const endsRun = useCallback((i: number, list: DMMessage[] = messages): boolean => (i >= list.length - 1 ? true : startsRun(i + 1, list)), [messages, startsRun]);

  // ── Receipts ───────────────────────────────────────────────────────────
  const last = messages[messages.length - 1];
  /** A direct chat: the receipt sits under the last message, only when it is mine. */
  const receiptMessageId = !isGroup && last && last.isMine ? last.id : null;
  /** "Seen" stays where they got to (N15-3): while the last message of mine
   *  is still unseen, the newest one before it that they did see keeps its
   *  "Seen". Only across my own run at the end of the thread; once they've
   *  replied, the reply says it. */
  let seenMessageId: string | null = null;
  if (!isGroup && last && last.isMine && !isSeen(last)) {
    for (let i = messages.length - 2; i >= 0; i--) {
      const m = messages[i];
      if (!m.isMine) break;
      if (isSeen(m)) { seenMessageId = m.id; break; }
    }
  }
  /** A group: my newest message reads "Sending…", then "Sent" until someone has read it, then "Seen by". */
  const groupSentId = isGroup && last && last.isMine && readers(last).length === 0 ? last.id : null;
  const lastMineId = () => [...messagesRef.current].reverse().find((m) => m.isMine && !isPendingId(m.id))?.id ?? null;

  /** The typist (a group: whoever is typing; a chat: the other person). */
  const typingIdentity: FlairUser = isGroup
    ? (typingMember ? memberFlair(typingMember) : (conv.members.find((m) => m.id !== me) ? memberFlair(conv.members.find((m) => m.id !== me)!) : otherFlair(row)))
    : otherFlair(row);

  // ── Lifecycle ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Viewed — recorded the moment the screen appears, from what the row
    // already knows; refined to the true newest once loaded.
    noteViewedNow(row.lastMessage?.id ?? null);
    void markReadIfVisible();
    // The chat opens: its page, then (at most every 10 s) the key versions
    // another device of mine reported lost that this browser holds.
    void load().then(() => reclaimHeldVersions());
    const offs = [
      // Messages the server hid from me are back: try what's hidden, read the newest page again.
      onDM("keysReclaimed", () => {
        const restored = new Set(pageDropped.current);
        for (const mid of restored) removedIds.current.delete(mid);
        pageDropped.current.clear();
        void retryHidden().then(() => pollForNew(restored));
      }),
      onDM("message", ({ conversationId, message }) => { if (conversationId === id) void receive(message); }),
      onDM("read", ({ conversationId, userId, readAt }) => {
        if (conversationId !== id) return;
        if (userId && userId === me) return;                      // our own read, echoed
        // Only a read that names the other party counts as theirs. An
        // unnamed read is never assumed: re-fetch the page and let
        // other_last_read_at decide. A read from anyone else is ignored.
        if (!userId) { if (!justPostedRead()) void pollForNew(); return; }
        // A group: one of them read; their avatar moves under the newest message.
        if (isGroupRow(convRef.current)) { noteMemberRead(userId, readAt); return; }
        if (userId !== row.otherId) return;
        noteOtherRead(lastMineId(), readAt);
        if (!readAt) void pollForNew();
      }),
      onDM("typing", ({ conversationId, userId }) => { if (conversationId === id && userId !== me) noteTyping(userId); }),
      onDM("removed", ({ conversationId }) => { if (conversationId === id) onRemovedRef.current(); }),
      onDM("deleted", ({ conversationId, messageId }) => { if (conversationId === id) dropMessage(messageId); }),
      onDM("edited", ({ conversationId, message }) => { if (conversationId === id) void swapEdited(message); }),
      // A reaction or a pin from anyone in it (or another device of yours).
      onDM("reaction", ({ conversationId, messageId, userId, reaction }) => { if (conversationId === id && userId) void applyReaction(messageId, userId, reaction); }),
      onDM("pinned", ({ conversationId, messageId, pinned, pinnedAt }) => { if (conversationId === id) applyPin(messageId, pinned, pinnedAt); }),
      // The group's name or people changed (someone added, left, renamed): the line now, the row after.
      onDM("groupUpdated", ({ conversationId, events: lines, conversation: c, removed }) => {
        if (conversationId !== id || removed) return;
        takeEvents(lines);
        if (c && isGroupRow(c) && c.id === id) setConv((cur) => ({ ...cur, ...c, members: c.members.length ? c.members : cur.members }));
        void refreshConversation();
      }),
      // A new key version: what didn't open may now.
      onDM("groupKey", ({ conversationId }) => { if (conversationId === id) void refreshConversation().then(() => retryHidden()); }),
    ];
    // The socket delivers each message as it's sent; this check is the
    // safety net behind it (N12-5): every 3 s while the personal socket is
    // down, once when it comes back, every 30 s while it's up; never while
    // the tab is hidden or the server is asking for room (503 OVERLOADED).
    let sinceCheck = 0;
    let wasConnected = socketConnected();
    const poll = setInterval(() => {
      sinceCheck += 3;
      const connected = socketConnected();
      const due = !connected || !wasConnected || sinceCheck >= 30;
      wasConnected = connected;
      if (!due || document.visibilityState !== "visible" || isServerBusy()) return;
      sinceCheck = 0;
      void pollForNew();
    }, 3000);
    // What won't open is tried again once a minute, in case its key turned up.
    const hiddenRetry = setInterval(() => { void retryHidden(); }, HIDDEN_RETRY_MS);
    return () => {
      offs.forEach((off) => off());
      clearInterval(poll);
      clearInterval(hiddenRetry);
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
    conv, isGroup, messages, pins, loaded, canLoadMore, isLoadingMore, blockedState, sendError, clearSendError: () => setSendError(null),
    alert, dismissAlert: () => setAlert(null), notice, say,
    otherIsTyping, typingIdentity, receipt, receiptMessageId, seenMessageId, groupSentId, seenLabel, sentLabel,
    sender, quoteNames, readers, groupNotesAbove, groupNotesAtEnd, refreshConversation, setConv,
    load, loadMore, send, sendMedia, retry, unblock, remove, edit, react, togglePin, hide, startsRun, endsRun, showsTimeStamp,
  };
}
