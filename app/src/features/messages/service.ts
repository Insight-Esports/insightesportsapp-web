// messages/service.ts — the browser DMService + DMReadLedger + the socket
// relay (DirectMessages.swift, LiveSocketService's dm:* cases).
//
// Everything readable lives in this browser: ciphertext comes from the API,
// keys come from the linked phone (keys.ts), plaintext never leaves memory.
"use client";

import { api, ApiError, endpoints } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";
import { deriveSymmetricKey, openEnvelope, sealEnvelope, type DMEnvelope } from "./crypto";
import { loadKey, loadKeyForVersion, publicKeyBase64, type StoredKey } from "./keys";
import {
  conversationNeedsIdentity, isPendingId, normalizeConversationRow, normalizeKeyRow, normalizeMessageRow, normalizeThreadPage,
  type DMConversationRow, type DMKeyRow, type DMMedia, type DMMessage, type DMMessageRow, type DMThreadPage,
} from "./types";

// ── Tiny event bus (NotificationCenter) ───────────────────────────────────
type Events = {
  message: { conversationId: string; message: DMMessageRow };
  localMessage: { conversationId: string; message: DMMessage };
  read: { conversationId: string; userId: string; readAt: string | null };
  removed: { conversationId: string };
  typing: { conversationId: string; userId: string };
  unread: { count: number };
  link: { state: LinkState };
};
type Handler<K extends keyof Events> = (payload: Events[K]) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlers = new Map<keyof Events, Set<(payload: any) => void>>();
export function onDM<K extends keyof Events>(event: K, h: Handler<K>): () => void {
  let set = handlers.get(event);
  if (!set) { set = new Set(); handlers.set(event, set); }
  set.add(h);
  return () => { handlers.get(event)?.delete(h); };
}
function emit<K extends keyof Events>(event: K, payload: Events[K]) {
  handlers.get(event)?.forEach((h) => { try { h(payload); } catch { /* listener bug must not break the relay */ } });
}

// ── Link state (is this browser a linked device?) ─────────────────────────
export type LinkState =
  | { kind: "checking" }
  | { kind: "unlinked" }
  | { kind: "linked"; version: number }
  /** The phone has rotated to a newer key than the one we hold — new messages won't open. */
  | { kind: "stale"; version: number; serverVersion: number };

let linkState: LinkState = { kind: "checking" };
let linkUserId: string | null = null;
let myKey: StoredKey | null = null;
let linkPromise: Promise<LinkState> | null = null;

export function currentLinkState(): LinkState { return linkState; }
export function myKeyVersion(): number { return myKey?.version ?? 1; }

function setLink(s: LinkState) { linkState = s; emit("link", { state: s }); }

/** Load the linked key for the signed-in user and check it against the server. */
export function ensureLinked(userId: string, force = false): Promise<LinkState> {
  if (!force && linkPromise && linkUserId === userId) return linkPromise;
  linkUserId = userId;
  linkPromise = (async () => {
    const k = await loadKey(userId);
    if (!k) { myKey = null; setLink({ kind: "unlinked" }); return linkState; }
    myKey = k;
    setLink({ kind: "linked", version: k.version });
    // Server truth: is this still the account's current key?
    try {
      const row = normalizeKeyRow(await api.get(endpoints.dmKey(userId)));
      if (row.publicKey && row.keyVersion != null) {
        if (row.publicKey === publicKeyBase64(k.privateKey)) {
          if (row.keyVersion !== k.version) { myKey = { ...k, version: row.keyVersion }; }
          setLink({ kind: "linked", version: row.keyVersion });
        } else if (row.keyVersion > k.version) {
          setLink({ kind: "stale", version: k.version, serverVersion: row.keyVersion });
        }
      }
    } catch { /* offline: trust the stored key */ }
    return linkState;
  })();
  return linkPromise;
}

/** After /messages/link stores a key: adopt it immediately. */
export function adoptKey(k: StoredKey) {
  myKey = k;
  linkUserId = k.userId;
  linkPromise = Promise.resolve(linkState);
  keyCache.clear();
  setLink({ kind: "linked", version: k.version });
}

export function forgetKeyState() {
  myKey = null; linkUserId = null; linkPromise = null; keyCache.clear(); publicKeyCache.clear();
  latestByConversation.clear(); setUnread(0);
  setLink({ kind: "unlinked" });
}

// ── Derived-key cache: one per (otherUser, myVersion, theirVersion) ────────
const keyCache = new Map<string, Promise<CryptoKey>>();
async function symmetricKey(otherUserId: string, otherPublicKeyBase64: string, myVersion: number, theirVersion: number): Promise<CryptoKey> {
  const ck = `${otherUserId}|${myVersion}|${theirVersion}`;
  const hit = keyCache.get(ck);
  if (hit) return hit;
  const p = (async () => {
    const uid = linkUserId ?? "";
    const mine = (await loadKeyForVersion(uid, myVersion)) ?? myKey;
    if (!mine) throw new Error("NOT_LINKED");
    return deriveSymmetricKey(mine.privateKey, otherPublicKeyBase64);
  })();
  keyCache.set(ck, p);
  p.catch(() => keyCache.delete(ck));
  return p;
}

// ── Other users' public keys ──────────────────────────────────────────────
const publicKeyCache = new Map<string, DMKeyRow>();
export async function publicKeyFor(userId: string, version?: number | null): Promise<DMKeyRow> {
  const k = `${userId}|${version ?? "cur"}`;
  const c = publicKeyCache.get(k);
  if (c) return c;
  const row = normalizeKeyRow(await api.get(endpoints.dmKey(userId, version)));
  publicKeyCache.set(k, row);
  return row;
}

// ── Identity enrichment (rows may arrive without other_username) ─────────
const profileCache = new Map<string, { username: string; avatarURL: string | null }>();
export async function identity(userId: string): Promise<{ username: string; avatarURL: string | null } | null> {
  const c = profileCache.get(userId);
  if (c) return c;
  try {
    const p = await api.get<{ id?: string; username?: string; avatar_url?: string | null }>(endpoints.publicProfile(userId));
    if (!p?.username) return null;
    const v = { username: p.username, avatarURL: p.avatar_url ?? null };
    profileCache.set(userId, v);
    return v;
  } catch {
    return null;
  }
}

// ── Decrypt ───────────────────────────────────────────────────────────────
function mediaFromEnvelope(e: DMEnvelope): DMMedia | null {
  if ((e.t !== "image" && e.t !== "video") || !e.id || !e.key || !e.nonce) return null;
  return {
    kind: e.t, blobId: e.id, key: e.key, nonce: e.nonce,
    mime: e.mime ?? (e.t === "image" ? "image/jpeg" : "video/mp4"),
    width: e.w ?? 0, height: e.h ?? 0, duration: e.dur ?? null,
    posterId: e.poster ?? null, posterNonce: e.pnonce ?? null,
  };
}

export async function decrypt(m: DMMessageRow, otherUserId: string, otherPublicKey: string | null, otherKeyVersion: number | null): Promise<DMMessage> {
  const mine = m.senderId === linkUserId;
  // Which of their versions was used: the sender's if they sent it, the recipient's if I did.
  const theirVersion = mine ? m.recipientKeyVersion : m.senderKeyVersion;
  const myVersion = mine ? m.senderKeyVersion : m.recipientKeyVersion;
  let pub = otherPublicKey;
  if (theirVersion !== otherKeyVersion || !pub) {
    try { pub = (await publicKeyFor(otherUserId, theirVersion)).publicKey ?? pub; } catch { /* fall through */ }
  }
  const base: DMMessage = { id: m.id, senderId: m.senderId, text: "Encrypted message", isMine: mine, createdAt: m.createdAt, decrypted: false, linkURL: null, media: null };
  if (!pub) return base;
  try {
    const key = await symmetricKey(otherUserId, pub, myVersion, theirVersion);
    const env = await openEnvelope(m.ciphertext, m.nonce, key);
    if (env.t === "link" && env.url && asURL(env.url)) return { ...base, text: env.url, decrypted: true, linkURL: env.url.trim() };
    const media = mediaFromEnvelope(env);
    if (media) return { ...base, text: media.kind === "image" ? "📷 Photo" : "🎬 Video", decrypted: true, media };
    return { ...base, text: env.body ?? "", decrypted: true };
  } catch {
    return base;
  }
}

/** The whole message is a single http(s) URL → link. */
export function asURL(s: string): URL | null {
  const t = s.trim();
  if (!t || /\s/.test(t)) return null;
  try {
    const u = new URL(t);
    if ((u.protocol === "http:" || u.protocol === "https:") && u.host) return u;
  } catch { /* not a url */ }
  return null;
}

// ── Send ──────────────────────────────────────────────────────────────────
export async function sendText(text: string, conversationId: string, otherUserId: string, otherPublicKey: string, otherKeyVersion: number): Promise<DMMessageRow> {
  const isLink = asURL(text) !== null;
  const envelope: DMEnvelope = isLink ? { t: "link", url: text.trim() } : { t: "text", body: text };
  return sendEnvelope(envelope, isLink ? "link" : "text", conversationId, otherUserId, otherPublicKey, otherKeyVersion);
}

/** Seal any envelope and post it; the server sees ciphertext, nonce, versions and a content type. */
export async function sendEnvelope(envelope: DMEnvelope, contentType: string, conversationId: string, otherUserId: string, otherPublicKey: string, otherKeyVersion: number): Promise<DMMessageRow> {
  if (!myKey) throw new Error("NOT_LINKED");
  const myV = myKey.version;
  const key = await symmetricKey(otherUserId, otherPublicKey, myV, otherKeyVersion);
  const sealed = await sealEnvelope(envelope, key);
  const raw = await api.post(endpoints.dmSend(conversationId), {
    ciphertext: sealed.ciphertext, nonce: sealed.nonce,
    senderKeyVersion: myV, recipientKeyVersion: otherKeyVersion, contentType,
  });
  const row = normalizeMessageRow(raw);
  if (!row) throw new ApiError(0, "Failed to process server response.", "DECODE");
  return row;
}

// ── Endpoints ─────────────────────────────────────────────────────────────
export async function conversations(before?: string | null): Promise<DMConversationRow[]> {
  const raw = await api.get<unknown[]>(endpoints.dmConversations(before));
  const rows = (Array.isArray(raw) ? raw : []).map(normalizeConversationRow);
  await Promise.all(rows.map(async (r, i) => {
    if (!conversationNeedsIdentity(r)) return;
    const who = await identity(r.otherId);
    if (who) rows[i] = { ...r, otherUsername: who.username, otherAvatarURL: who.avatarURL };
  }));
  return rows;
}

export async function conversation(id: string): Promise<DMConversationRow | null> {
  return (await conversations()).find((r) => r.id === id) ?? null;
}

export async function createConversation(userId: string): Promise<DMConversationRow> {
  let row = normalizeConversationRow(await api.post(endpoints.dmCreateConversation, { userId }));
  if (!row.otherId) row = { ...row, otherId: userId };
  if (conversationNeedsIdentity(row)) {
    const who = await identity(userId);
    if (who) row = { ...row, otherUsername: who.username, otherAvatarURL: who.avatarURL };
  }
  return row;
}

export async function messages(conversationId: string, before?: DMMessageRow | null): Promise<DMThreadPage> {
  return normalizeThreadPage(await api.get(endpoints.dmMessages(conversationId, before?.createdAt ?? null, before?.id ?? null)));
}

export async function markRead(conversationId: string): Promise<void> {
  try { await api.post(endpoints.dmRead(conversationId), {}); } catch { /* the next open retries */ }
  await refreshUnread();
}

export async function removeConversation(conversationId: string): Promise<void> {
  try { await api.delete(endpoints.dmRemove(conversationId)); } catch { /* row already gone locally */ }
}
export async function blockUser(userId: string): Promise<void> {
  try { await api.post(endpoints.dmBlock, { userId }); } catch { /* ignore */ }
}
export async function unblockUser(userId: string): Promise<void> {
  try { await api.delete(endpoints.dmUnblock(userId)); } catch { /* ignore */ }
}

// ── Read ledger (DMReadLedger) — per account, in localStorage ─────────────
interface OtherSeen { throughId?: string | null; at?: string | null }
interface LedgerSaved { through: Record<string, string>; readAt: Record<string, string>; otherSeen: Record<string, OtherSeen> }
const ledgerKey = () => `dm.readLedger.v1.${linkUserId ?? "anon"}`;
let ledger: LedgerSaved | null = null;
function loadLedger(): LedgerSaved {
  if (ledger) return ledger;
  try {
    const raw = localStorage.getItem(ledgerKey());
    ledger = raw ? (JSON.parse(raw) as LedgerSaved) : { through: {}, readAt: {}, otherSeen: {} };
  } catch { ledger = { through: {}, readAt: {}, otherSeen: {} }; }
  ledger.otherSeen ??= {};
  return ledger;
}
function persistLedger() { try { localStorage.setItem(ledgerKey(), JSON.stringify(loadLedger())); } catch { /* quota */ } }

export const readLedger = {
  noteOtherSeen(conversationId: string, throughId: string | null, at: string | null) {
    const l = loadLedger();
    const cur = l.otherSeen[conversationId] ?? {};
    if (throughId && !isPendingId(throughId)) cur.throughId = throughId;
    if (at && (!cur.at || new Date(at) > new Date(cur.at))) cur.at = at;
    l.otherSeen[conversationId] = cur;
    persistLedger();
  },
  otherSeenState(conversationId: string): OtherSeen | null { return loadLedger().otherSeen[conversationId] ?? null; },
  markViewed(conversationId: string, throughMessageId: string | null) {
    const l = loadLedger();
    if (throughMessageId && !isPendingId(throughMessageId)) l.through[conversationId] = throughMessageId;
    l.readAt[conversationId] = new Date().toISOString();
    persistLedger();
  },
  viewedThrough(conversationId: string): string | null { return loadLedger().through[conversationId] ?? null; },
  /** Nothing unread when: the newest is mine, or it's the one last seen on screen, or the server's read stamp is at/past it. */
  isRead(conversationId: string, newestId: string | null, newestIsMine: boolean, newestAt: string | null, serverLastReadAt: string | null): boolean {
    if (newestIsMine) return true;
    if (newestId && loadLedger().through[conversationId] === newestId) return true;
    if (newestAt && serverLastReadAt && new Date(newestAt) <= new Date(serverLastReadAt)) return true;
    return false;
  },
  clear() { ledger = { through: {}, readAt: {}, otherSeen: {} }; persistLedger(); },
};

// ── Newest message per conversation (DMService.latestByConversation) ──────
const latestByConversation = new Map<string, DMMessage>();

export function noteLatest(conversationId: string, message: DMMessage): boolean {
  const incomingPending = isPendingId(message.id);
  const have = latestByConversation.get(conversationId);
  if (have) {
    const havePending = isPendingId(have.id);
    if (!incomingPending && !havePending) {
      if (have.id === message.id) return false;
      if (new Date(have.createdAt) > new Date(message.createdAt)) return false;
    }
  }
  latestByConversation.set(conversationId, message);
  return true;
}
export function expireStalePending() {
  for (const [id, m] of latestByConversation) {
    if (isPendingId(m.id) && Date.now() - new Date(m.createdAt).getTime() > 20_000) latestByConversation.delete(id);
  }
}
export interface Newest { id: string; at: string; isMine: boolean; local: DMMessage | null }
export function newestFor(row: DMConversationRow): Newest | null {
  const server: Newest | null = row.lastMessage ? { id: row.lastMessage.id, at: row.lastMessage.createdAt, isMine: row.lastMessage.senderId === linkUserId, local: null } : null;
  const local = latestByConversation.get(row.id);
  if (!local) return server;
  const mine: Newest = { id: local.id, at: local.createdAt, isMine: local.isMine, local };
  if (!server) return mine;
  if (isPendingId(local.id) || local.id === server.id || new Date(local.createdAt) > new Date(server.at)) return mine;
  return server;
}
/** The one judgement of "how many unread" for a row (inbox dot, badge). */
export function unreadFor(row: DMConversationRow): number {
  const n = newestFor(row);
  if (!n) return row.unreadCount ?? 0;
  if (readLedger.isRead(row.id, n.id, n.isMine, n.at, row.lastReadAt)) return 0;
  const localIsNewer = n.local !== null && n.id !== row.lastMessage?.id;
  if (!localIsNewer) return row.unreadCount ?? 0;
  const serverNewestRead = row.lastMessage
    ? readLedger.isRead(row.id, row.lastMessage.id, row.lastMessage.senderId === linkUserId, row.lastMessage.createdAt, row.lastReadAt)
    : true;
  return serverNewestRead ? 1 : Math.max(row.unreadCount ?? 0, 1);
}

// ── Unread count store ────────────────────────────────────────────────────
let unreadCount = 0;
const unreadListeners = new Set<(n: number) => void>();
function setUnread(n: number) { if (unreadCount !== n) { unreadCount = n; unreadListeners.forEach((l) => l(n)); emit("unread", { count: n }); } }
export function getUnread(): number { return unreadCount; }
export function subscribeUnread(l: (n: number) => void): () => void { unreadListeners.add(l); return () => { unreadListeners.delete(l); }; }

/** Unread conversations, by the same judgement the inbox uses. */
export async function refreshUnread(): Promise<void> {
  if (!linkUserId) return;
  try {
    const rows = await conversations();
    expireStalePending();
    setUnread(rows.filter((r) => unreadFor(r) > 0).length);
  } catch {
    try {
      const r = await api.get<{ unread_count?: number; count?: number }>(endpoints.dmUnreadCount);
      setUnread(Number(r?.unread_count ?? r?.count ?? 0));
    } catch { /* keep the last value */ }
  }
}

// ── Socket relay (the personal room's dm:* events) ────────────────────────
let relayAttached: Socket | null = null;
export async function ensureDMSocket(): Promise<Socket | null> {
  try {
    const s = await getSocket();
    if (relayAttached === s) return s;
    relayAttached = s;
    s.on("dm:message", (payload: { conversationId?: string; message?: unknown }) => {
      const row = normalizeMessageRow(payload?.message);
      if (!payload?.conversationId || !row) return;
      emit("message", { conversationId: payload.conversationId, message: row });
      // Our own echo is handled by the thread that sent it.
      if (row.senderId !== linkUserId) {
        void (async () => {
          const m = await decrypt(row, row.senderId, null, null);
          noteLatest(payload.conversationId!, m);
          await refreshUnread();
        })();
      }
    });
    s.on("dm:typing", (payload: { conversationId?: string; userId?: string }) => {
      if (payload?.conversationId) emit("typing", { conversationId: payload.conversationId, userId: payload.userId ?? "" });
    });
    s.on("dm:read", (payload: { conversationId?: string; userId?: string; readAt?: string }) => {
      if (!payload?.conversationId) return;
      const who = payload.userId ?? "";
      const at = payload.readAt ?? null;
      if (who && who !== linkUserId && at) readLedger.noteOtherSeen(payload.conversationId, null, at);
      emit("read", { conversationId: payload.conversationId, userId: who, readAt: at });
    });
    s.on("dm:removed", (payload: { conversationId?: string }) => {
      if (payload?.conversationId) emit("removed", { conversationId: payload.conversationId });
    });
    return s;
  } catch {
    return null;
  }
}

/** Typing signal for a conversation (callers throttle to one per 2 s). */
export function sendTyping(conversationId: string) {
  relayAttached?.emit("dm:typing", { conversationId });
}

/** A decrypted message produced locally (sent from a thread). */
export function noteLocalMessage(conversationId: string, message: DMMessage) {
  noteLatest(conversationId, message);
  emit("localMessage", { conversationId, message });
}

/** Start everything for a signed-in user: key, socket, unread. Idempotent. */
export async function startDM(userId: string): Promise<LinkState> {
  const state = await ensureLinked(userId);
  await ensureDMSocket();
  if (state.kind !== "unlinked") void refreshUnread();
  return state;
}
