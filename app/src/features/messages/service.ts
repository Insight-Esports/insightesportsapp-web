// messages/service.ts — the browser DMService + DMReadLedger + the socket
// relay (DirectMessages.swift, LiveSocketService's dm:* cases).
//
// Everything readable lives in this browser: ciphertext comes from the API,
// keys come from the linked phone (keys.ts), plaintext never leaves memory.
//
// Nov 17 (parity N5-3, N5-4, N12-5, N15-2): every seal and open goes through
// a key context — the other person's key in a direct chat, the shared group
// key in a group (DMKeyContext). Group keys are opened from the blobs sealed
// to me (GET /dm/groups/:id/keys), made and sealed to every member on create
// and rotation, and kept per version (keys.ts). Replies and forwards ride in
// the envelope; reactions are sealed like messages. A direct chat is sealed
// to the other person's key as the server has it now (read again, cached a
// minute). The unread badge is counted the moment a message arrives, and
// read again after the personal socket reconnects.
"use client";

import { api, ApiError, endpoints, request } from "@/lib/api";
import { blockUser as blockEverywhere, loadBlocked, resetBlocked, unblockUser as unblockEverywhere } from "@/features/moderation/blocked";
import { clearBans } from "@/features/moderation/ban";
import { getSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";
import { b64decode, b64encode, deriveSymmetricKey, importGroupKey, newGroupKeyBytes, openEnvelope, sealEnvelope, type DMEnvelope } from "./crypto";
import { groupKeyVersions, heldKeyForPublic, loadGroupKey, loadKey, loadKeyForVersion, publicKeyBase64, rememberVersion, saveGroupKey, type StoredKey } from "./keys";
import {
  conversationNeedsIdentity, isGroupRow, isPendingId, normalizeConversationRow, normalizeGroupEvents, normalizeKeyRow, normalizeMessageRow, normalizeReactionRow, normalizeThreadPage, prefixChars,
  type DMConversationRow, type DMGroupEvent, type DMKeyRow, type DMMedia, type DMMember, type DMMessage, type DMMessageRow, type DMReaction, type DMReactionRow, type DMThreadPage,
} from "./types";

// ── Tiny event bus (NotificationCenter) ───────────────────────────────────
type Events = {
  message: { conversationId: string; message: DMMessageRow };
  localMessage: { conversationId: string; message: DMMessage };
  read: { conversationId: string; userId: string; readAt: string | null };
  removed: { conversationId: string };
  /** dm:deleted — unsent by its sender (either side, any device). */
  deleted: { conversationId: string; messageId: string };
  /** dm:edited — the sender changed it (pending on the backend). */
  edited: { conversationId: string; message: DMMessageRow };
  typing: { conversationId: string; userId: string };
  /** dm:media_ready — an upload's bytes landed. Bubbles waiting on that id fetch now (only older iOS builds still send before their video is up). */
  mediaReady: { conversationId: string; uploadId: string; kind: string; size: number };
  unread: { count: number };
  link: { state: LinkState };
  /** Versions reported lost came back (DELETE /dm/keys/lost): what the server hid is listed again — re-read. */
  keysReclaimed: Record<string, never>;
  /** dm:reaction — a reaction added (the sealed row) or taken back (null), any member, any device. */
  reaction: { conversationId: string; messageId: string; userId: string; reaction: DMReactionRow | null };
  /** dm:pinned — pinned or unpinned by anyone in it. */
  pinned: { conversationId: string; messageId: string; pinned: boolean; pinnedAt: string | null };
  /** dm:group_updated — a group's name or people changed; `events` are the grey lines it wrote; `removed`: I'm out. */
  groupUpdated: { conversationId: string; conversation: DMConversationRow | null; events: DMGroupEvent[] | undefined; removed: boolean };
  /** dm:group_key — a new key version was sealed to the members. */
  groupKey: { conversationId: string; keyVersion: number };
  /** The personal socket went up or down (`reconnect`: up again after a drop, not the first connect). */
  connection: { connected: boolean; reconnect: boolean };
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
    // The key is settled: versions reported lost that this browser holds go back.
    void reclaimHeldVersions(true);
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
  // A key arrived: what wouldn't open is tried again, and what this key
  // can open is taken back from the lost list.
  forgetHidden();
  void reclaimHeldVersions(true);
}

export function forgetKeyState() {
  // Sign-out: the next account starts with its own blocked list and no ban lines.
  resetBlocked();
  clearBans();
  myKey = null; linkUserId = null; linkPromise = null; keyCache.clear(); publicKeyCache.clear(); currentKeyReadAt.clear();
  latestByConversation.clear(); forgetHidden(); reclaimedAt = 0; lastRows = []; setUnread(0);
  groupFetches.clear(); groupCryptoKeys.clear(); rotatedTo.clear();
  setLink({ kind: "unlinked" });
}

// ── Derived-key cache: one per (otherUser, myVersion, theirVersion, their public key) ──
// The public key is part of the name: when their key at a version couldn't
// be fetched, the current one is tried in its place, and that guess must not
// stand for the version once the real key arrives (the hidden-row retry).
const keyCache = new Map<string, Promise<CryptoKey>>();
async function symmetricKey(otherUserId: string, otherPublicKeyBase64: string, myVersion: number, theirVersion: number): Promise<CryptoKey> {
  const ck = `${otherUserId}|${myVersion}|${theirVersion}|${otherPublicKeyBase64}`;
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
// A numbered version never changes, so it is kept. The current key changes
// when the person moves to a new phone, so it is kept a minute (N15-2).
const publicKeyCache = new Map<string, DMKeyRow>();
const currentKeyReadAt = new Map<string, number>();
export async function publicKeyFor(userId: string, version?: number | null): Promise<DMKeyRow> {
  const k = `${userId}|${version ?? "cur"}`;
  const fresh = version != null || Date.now() - (currentKeyReadAt.get(userId) ?? 0) < 60_000;
  const c = publicKeyCache.get(k);
  if (fresh && c) return c;
  const row = normalizeKeyRow(await api.get(endpoints.dmKey(userId, version)));
  publicKeyCache.set(k, row);
  if (version == null) currentKeyReadAt.set(userId, Date.now());
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

// ── Key contexts (DMKeyContext) ───────────────────────────────────────────
/** Whose key seals a conversation: the other person's in a direct chat, the
 *  shared group key in a group. Every seal and open goes through one. */
export type DMKeyContext =
  | { kind: "pair"; otherUserId: string; publicKey: string | null; keyVersion: number | null }
  | { kind: "group"; conversationId: string; keyVersion: number | null };

export function keyContextOf(row: DMConversationRow): DMKeyContext {
  return isGroupRow(row)
    ? { kind: "group", conversationId: row.id, keyVersion: row.groupKeyVersion }
    : { kind: "pair", otherUserId: row.otherId, publicKey: row.otherPublicKey, keyVersion: row.otherKeyVersion };
}
/** A socket row with no conversation at hand: a group row names its key version; a direct row opens with its sender's key. */
export function contextForRow(row: DMMessageRow, conversationId: string): DMKeyContext {
  if (row.groupKeyVersion != null) return { kind: "group", conversationId, keyVersion: row.groupKeyVersion };
  return { kind: "pair", otherUserId: row.senderId, publicKey: null, keyVersion: null };
}

/** The pair's key for something sealed by me (`mine`) or by them, at the
 *  versions the row names: their version is the sender's if they sealed it,
 *  the recipient's if I did. */
async function pairKey(mine: boolean, senderKeyVersion: number, recipientKeyVersion: number, otherUserId: string, otherPublicKey: string | null, otherKeyVersion: number | null): Promise<CryptoKey | null> {
  const theirVersion = mine ? recipientKeyVersion : senderKeyVersion;
  const myVersion = mine ? senderKeyVersion : recipientKeyVersion;
  let pub = otherPublicKey;
  if (theirVersion !== otherKeyVersion || !pub) {
    try { pub = (await publicKeyFor(otherUserId, theirVersion)).publicKey ?? pub; } catch { /* fall through */ }
  }
  if (!pub) return null;
  try { return await symmetricKey(otherUserId, pub, myVersion, theirVersion); } catch { return null; }
}

/** The envelope as a message: words, a link, or a photo or video, with the reply it answers and whether it was forwarded. */
function messageFromEnvelope(env: DMEnvelope, m: DMMessageRow, mine: boolean): DMMessage {
  const base: DMMessage = { id: m.id, senderId: m.senderId, text: "", isMine: mine, createdAt: m.createdAt, decrypted: true, linkURL: null, media: null };
  let out: DMMessage;
  if (env.t === "link" && env.url && asURL(env.url)) out = { ...base, text: env.url, linkURL: env.url.trim() };
  else {
    const media = mediaFromEnvelope(env);
    out = media ? { ...base, text: media.kind === "image" ? "📷 Photo" : "🎬 Video", media } : { ...base, text: env.body ?? "" };
  }
  if (env.re) out.replyTo = { id: env.re, text: env.rq ?? "Message", senderId: env.rs ?? "" };
  out.forwarded = env.fw === true;
  return out;
}

/** A pair row (DMService.openSealed). */
async function openSealed(m: DMMessageRow, otherUserId: string, otherPublicKey: string | null, otherKeyVersion: number | null): Promise<DMMessage> {
  const mine = m.senderId === linkUserId;
  const base: DMMessage = { id: m.id, senderId: m.senderId, text: "Encrypted message", isMine: mine, createdAt: m.createdAt, decrypted: false, linkURL: null, media: null };
  const key = await pairKey(mine, m.senderKeyVersion, m.recipientKeyVersion, otherUserId, otherPublicKey, otherKeyVersion);
  if (!key) return base;
  try { return messageFromEnvelope(await openEnvelope(m.ciphertext, m.nonce, key), m, mine); } catch { return base; }
}

/** A group row: opened with the group key of the version it names. */
async function openGroupSealed(m: DMMessageRow, conversationId: string): Promise<DMMessage> {
  const mine = m.senderId === linkUserId;
  const base: DMMessage = { id: m.id, senderId: m.senderId, text: "Encrypted message", isMine: mine, createdAt: m.createdAt, decrypted: false, linkURL: null, media: null };
  if (m.groupKeyVersion == null) return base;
  const key = await groupCryptoKey(conversationId, m.groupKeyVersion);
  if (!key) return base;
  try { return messageFromEnvelope(await openEnvelope(m.ciphertext, m.nonce, key), m, mine); } catch { return base; }
}

/** Each reaction opened with the pair's (or the group's) key; one that won't open is left out, never shown as a blob. */
export async function openReactions(rows: DMReactionRow[], ctx: DMKeyContext): Promise<DMReaction[]> {
  if (!rows.length) return [];
  const out: DMReaction[] = [];
  for (const r of rows) {
    const mine = r.userId === linkUserId;
    const key = ctx.kind === "pair"
      ? await pairKey(mine, r.senderKeyVersion, r.recipientKeyVersion, ctx.otherUserId, ctx.publicKey, ctx.keyVersion)
      : await groupCryptoKey(ctx.conversationId, r.groupKeyVersion ?? ctx.keyVersion ?? 1);
    if (!key) continue;
    try {
      const env = await openEnvelope(r.ciphertext, r.nonce, key);
      if (env.body) out.push({ userId: r.userId, emoji: env.body, isMine: mine });
    } catch { /* left out */ }
  }
  return out;
}

/** A row opened with whatever seals its conversation. */
export async function decryptIn(m: DMMessageRow, ctx: DMKeyContext): Promise<DMMessage> {
  const out = ctx.kind === "pair"
    ? await openSealed(m, ctx.otherUserId, ctx.publicKey, ctx.keyVersion)
    : await openGroupSealed(m, ctx.conversationId);
  out.editedAt = m.editedAt;
  out.pinnedAt = m.pinnedAt;
  out.reactions = await openReactions(m.reactions ?? [], ctx);
  if (out.decrypted) unopenable.delete(m.id); else unopenable.add(m.id);
  return out;
}

/** A direct chat's row (the pair's key). */
export async function decrypt(m: DMMessageRow, otherUserId: string, otherPublicKey: string | null, otherKeyVersion: number | null): Promise<DMMessage> {
  return decryptIn(m, { kind: "pair", otherUserId, publicKey: otherPublicKey, keyVersion: otherKeyVersion });
}

// ── What won't open (DMService "What won't open") ─────────────────────────
// A message this browser can't open (locked to a key version it was never
// handed, or to one the phone lost) is hidden everywhere: no bubble, no
// inbox preview, no unread. Never "Encrypted message"
// (backend/dm-key-backup-contract.md §2). Nothing is deleted: the thread
// tries hidden rows again once a minute, and they show once a key opens them.
const unopenable = new Set<string>();
/** Per conversation whose newest server row won't open: the newest one on
 *  the first page that does (null when none does), the row it stands in
 *  for, and when it was looked for. */
const standIns = new Map<string, { forId: string; message: DMMessage | null; at: number }>();

export function isUnopenable(messageId: string): boolean { return unopenable.has(messageId); }

/** A key arrived: everything is tried again. */
export function forgetHidden() {
  unopenable.clear();
  standIns.clear();
}

function hidesNewest(row: DMConversationRow): boolean {
  return !!row.lastMessage && unopenable.has(row.lastMessage.id);
}
function standInMessage(row: DMConversationRow): DMMessage | null {
  const s = standIns.get(row.id);
  if (!row.lastMessage || !s || s.forId !== row.lastMessage.id) return null;
  return s.message;
}

/**
 * The inbox row's message from the server: its `last_message`, opened;
 * when that won't open, the newest on the first page that does. That page
 * is read once per newest message, and again after five minutes in case a
 * key has arrived.
 */
export async function serverPreview(row: DMConversationRow): Promise<DMMessage | null> {
  const last = row.lastMessage;
  if (!last) return null;
  const s = standIns.get(row.id);
  if (s && s.forId === last.id && Date.now() - s.at < 5 * 60_000) return s.message;
  const ctx = keyContextOf(row);
  const m = await decryptIn(last, ctx);
  if (m.decrypted) { standIns.delete(row.id); return m; }
  let found: DMMessage | null = null;
  try {
    const page = await messages(row.id);
    for (const r of page.messages) {                       // newest first
      if (r.id === last.id) continue;
      const o = await decryptIn(r, ctx);
      if (o.decrypted) { found = o; break; }
    }
  } catch { /* the row shows no preview until the next look */ }
  standIns.set(row.id, { forId: last.id, message: found, at: Date.now() });
  return found;
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

// ── Group keys (DMService group keys) ────────────────────────────────────
// Wire: backend/group-chats-contract.md. The group key never travels in the
// clear: it is sealed to each member with the pair's key (the same X25519 +
// HKDF + AES-GCM a direct message uses, envelope {t: "group_key", body:
// base64 32 bytes}) and the server keeps only those blobs.

/** A message the person should read as it is (no "Couldn't…" prefix games). */
export class DMUserError extends Error {
  constructor(message: string) { super(message); this.name = "DMUserError"; }
}

const groupFetches = new Map<string, { at: number; p: Promise<void> }>();
const groupCryptoKeys = new Map<string, Promise<CryptoKey | null>>();
/** A rotation this browser made, until the rows it holds catch up: conversation → version. */
const rotatedTo = new Map<string, number>();

interface GroupKeyBlob { key_version?: unknown; sender_id?: unknown; ciphertext?: unknown; nonce?: unknown; sender_key_version?: unknown; recipient_key_version?: unknown }

/** Every blob sealed to me, opened with the sealer's pair key and kept. One fetch a few seconds a group. */
async function fetchGroupKeys(conversationId: string, me: string): Promise<void> {
  let rows: GroupKeyBlob[];
  try { rows = (await api.get<GroupKeyBlob[]>(endpoints.dmGroupKeys(conversationId))) ?? []; } catch { return; }
  for (const r of Array.isArray(rows) ? rows : []) {
    const version = Number(r.key_version);
    if (!Number.isInteger(version) || version < 1 || (await loadGroupKey(me, conversationId, version))) continue;
    const senderId = String(r.sender_id ?? "");
    // Sealed by me (another device of mine) or by another member.
    const mine = senderId === me;
    const pair = await pairKey(mine, Number(r.sender_key_version) || 1, Number(r.recipient_key_version) || 1, mine ? me : senderId, null, null);
    if (!pair || typeof r.ciphertext !== "string" || typeof r.nonce !== "string") continue;
    try {
      const env = await openEnvelope(r.ciphertext, r.nonce, pair);
      if (env.t !== "group_key" || !env.body) continue;
      const raw = b64decode(env.body);
      if (raw.length === 32) await saveGroupKey(me, conversationId, version, raw);
    } catch { /* not for this browser's keys */ }
  }
}

/** The group's key at a version: kept here, else fetched (every blob sealed to me). */
export async function groupKeyBytes(conversationId: string, version: number): Promise<Uint8Array | null> {
  const me = linkUserId;
  if (!me) return null;
  const have = await loadGroupKey(me, conversationId, version);
  if (have) return have;
  const f = groupFetches.get(conversationId);
  if (f && Date.now() - f.at < 5000) { await f.p; return loadGroupKey(me, conversationId, version); }
  const p = fetchGroupKeys(conversationId, me);
  groupFetches.set(conversationId, { at: Date.now(), p });
  await p;
  return loadGroupKey(me, conversationId, version);
}

async function groupCryptoKey(conversationId: string, version: number): Promise<CryptoKey | null> {
  const ck = `${conversationId}|${version}`;
  const hit = groupCryptoKeys.get(ck);
  if (hit) return hit;
  const p = (async () => {
    const raw = await groupKeyBytes(conversationId, version);
    return raw ? importGroupKey(raw) : null;
  })();
  groupCryptoKeys.set(ck, p);
  void p.then((k) => { if (!k) groupCryptoKeys.delete(ck); }, () => groupCryptoKeys.delete(ck));
  return p;
}

interface SealedKey { recipientId: string; keyVersion: number; ciphertext: string; nonce: string; senderKeyVersion: number; recipientKeyVersion: number }

/** The key sealed to one member, as the wire takes it. */
async function sealedGroupKey(key: Uint8Array, version: number, memberId: string, publicKey: string, keyVersion: number): Promise<SealedKey> {
  if (!myKey) throw new Error("NOT_LINKED");
  const myV = myKey.version;
  const pair = await symmetricKey(memberId, publicKey, myV, keyVersion);
  const sealed = await sealEnvelope({ t: "group_key", body: b64encode(key) }, pair);
  return { recipientId: memberId, keyVersion: version, ciphertext: sealed.ciphertext, nonce: sealed.nonce, senderKeyVersion: myV, recipientKeyVersion: keyVersion };
}

/** The key sealed to each of these people, me included (so my other devices
 *  read the group). Someone without a published DM key can't be in an
 *  encrypted group yet; the error names them. */
async function sealedGroupKeys(key: Uint8Array, version: number, ids: string[], known: DMMember[] = []): Promise<SealedKey[]> {
  const all = new Set(ids);
  if (linkUserId) all.add(linkUserId);
  const out: SealedKey[] = [];
  for (const id of all) {
    const k = known.find((m) => m.id === id);
    let pub = k?.publicKey ?? null, ver = k?.keyVersion ?? null;
    if (!pub || ver == null) {
      try { const row = await publicKeyFor(id, null); pub = row.publicKey; ver = row.keyVersion; } catch { /* named below */ }
    }
    if (!pub || ver == null) {
      const name = k?.username ?? (await identity(id))?.username ?? "Someone";
      throw new DMUserError(`${name} can't be added yet: they haven't opened the latest Insight.`);
    }
    out.push(await sealedGroupKey(key, version, id, pub, ver));
  }
  return out;
}

const groupRowFrom = (raw: unknown): DMConversationRow => normalizeConversationRow(raw);

/** A new group: one key, sealed to everyone. Returns the conversation (kind "group"). */
export async function createGroup(name: string | null, memberIds: string[]): Promise<DMConversationRow> {
  const key = newGroupKeyBytes();
  const keys = await sealedGroupKeys(key, 1, memberIds);
  const body: Record<string, unknown> = { memberIds, keyVersion: 1, keys };
  const n = name?.trim();
  if (n) body.name = n;
  const row = groupRowFrom(await api.post(endpoints.dmGroups, body));
  if (linkUserId) await saveGroupKey(linkUserId, row.id, 1, key);
  return row;
}

/** People joining get every key version I hold, so they read the whole thread. */
export async function addMembers(ids: string[], row: DMConversationRow): Promise<DMConversationRow> {
  const me = linkUserId;
  if (!me) throw new Error("NOT_LINKED");
  // A browser that hasn't opened this group yet holds no versions: the fetch stores every one sealed to me.
  if ((await groupKeyVersions(me, row.id)).length === 0 && row.groupKeyVersion) await groupKeyBytes(row.id, row.groupKeyVersion);
  const keys: SealedKey[] = [];
  for (const v of await groupKeyVersions(me, row.id)) {
    const key = await loadGroupKey(me, row.id, v);
    if (!key) continue;
    keys.push(...(await sealedGroupKeys(key, v, ids, row.members)).filter((k) => ids.includes(k.recipientId)));
  }
  return groupRowFrom(await api.post(endpoints.dmGroupMembers(row.id), { userIds: ids, keys }));
}

/** A new key version sealed to everyone still in the group, so whoever left
 *  can't read what comes next. The server takes exactly current + 1; a 409
 *  means another member got there first. */
export async function rotateGroupKey(row: DMConversationRow, excluding: string[] = []): Promise<number> {
  const version = Math.max(row.groupKeyVersion ?? 0, rotatedTo.get(row.id) ?? 0) + 1;
  const key = newGroupKeyBytes();
  const stay = row.members.filter((m) => !excluding.includes(m.id));
  const keys = await sealedGroupKeys(key, version, stay.map((m) => m.id), stay);
  try {
    await api.post(endpoints.dmGroupKeys(row.id), { keyVersion: version, keys });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return (await conversation(row.id))?.groupKeyVersion ?? version;
    throw e;
  }
  if (linkUserId) await saveGroupKey(linkUserId, row.id, version, key);
  rotatedTo.set(row.id, version);
  return version;
}

/** Removing someone (admin) rotates the key in the same breath. */
export async function removeMember(userId: string, row: DMConversationRow): Promise<void> {
  await request(endpoints.dmGroupMember(row.id, userId), "DELETE");
  await rotateGroupKey({ ...row, members: row.members.filter((m) => m.id !== userId) }, [userId]);
}

/** Leaving: the others rotate when they next send. */
export async function leaveGroup(row: DMConversationRow): Promise<void> {
  if (!linkUserId) return;
  await request(endpoints.dmGroupMember(row.id, linkUserId), "DELETE");
}

export async function renameGroup(row: DMConversationRow, name: string): Promise<DMConversationRow> {
  return groupRowFrom(await api.patch(endpoints.dmGroup(row.id), { name: name.trim() }));
}

export async function setMuted(conversationId: string, muted: boolean): Promise<void> {
  await api.put(endpoints.dmMute(conversationId), { muted });
}

/** The key to seal with right now: rotated first when someone has left and nobody has yet. */
async function groupSealingKey(row: DMConversationRow): Promise<{ key: CryptoKey; version: number }> {
  const mine = rotatedTo.get(row.id) ?? 0;
  let version = Math.max(row.groupKeyVersion ?? 1, mine);
  if (row.keyRotationNeeded && mine <= (row.groupKeyVersion ?? 0)) version = await rotateGroupKey(row);
  const key = await groupCryptoKey(row.id, version);
  if (!key) throw new DMUserError("This group's key isn't in this browser yet. Open the chat again in a moment.");
  return { key, version };
}

// ── Seal / send (DMService.sealedBody) ──────────────────────────────────
/** What a seal is for: a direct chat (the other person's key) or a group (its row: people, key version, rotation). */
export type SealTarget =
  | { kind: "pair"; otherUserId: string; publicKey: string; keyVersion: number }
  | { kind: "group"; row: DMConversationRow };

export function sealTargetOf(row: DMConversationRow): SealTarget | null {
  if (isGroupRow(row)) return { kind: "group", row };
  return row.otherPublicKey && row.otherKeyVersion != null ? { kind: "pair", otherUserId: row.otherId, publicKey: row.otherPublicKey, keyVersion: row.otherKeyVersion } : null;
}

/** The wire body for whichever chat: ciphertext, nonce, key versions and the
 *  content type. A group body carries `groupKeyVersion` and zero pair
 *  versions. A direct chat is sealed to their key as the server has it now
 *  (N15-2): a person who moved to a new phone can't open what was sealed to
 *  the old one; when the server can't be asked, the key in hand is used. */
async function sealedBody(envelope: DMEnvelope, contentType: string, target: SealTarget): Promise<Record<string, unknown>> {
  if (!myKey) throw new Error("NOT_LINKED");
  if (target.kind === "group") {
    const { key, version } = await groupSealingKey(target.row);
    const sealed = await sealEnvelope(envelope, key);
    return { ciphertext: sealed.ciphertext, nonce: sealed.nonce, groupKeyVersion: version, senderKeyVersion: 0, recipientKeyVersion: 0, contentType };
  }
  let theirKey = target.publicKey, theirVersion = target.keyVersion;
  try {
    const now = await publicKeyFor(target.otherUserId, null);
    if (now.publicKey && now.keyVersion != null) { theirKey = now.publicKey; theirVersion = now.keyVersion; }
  } catch { /* the key in hand */ }
  const myV = myKey.version;
  const key = await symmetricKey(target.otherUserId, theirKey, myV, theirVersion);
  const sealed = await sealEnvelope(envelope, key);
  return { ciphertext: sealed.ciphertext, nonce: sealed.nonce, senderKeyVersion: myV, recipientKeyVersion: theirVersion, contentType };
}

/** A group seal the server refused because the key moved on (409 KEY_VERSION /
 *  KEY_ROTATION_NEEDED): the group is read again and sealed once more. */
async function withGroupRetry<T>(target: SealTarget, run: (t: SealTarget) => Promise<T>): Promise<T> {
  try {
    return await run(target);
  } catch (e) {
    if (target.kind !== "group" || !(e instanceof ApiError) || e.status !== 409 || (e.code !== "KEY_VERSION" && e.code !== "KEY_ROTATION_NEEDED")) throw e;
    rotatedTo.delete(target.row.id);
    const fresh = await conversation(target.row.id);
    if (!fresh) throw e;
    return run({ kind: "group", row: fresh });
  }
}

/** The text or link envelope for some words (a message that IS a URL travels as a link). */
export function envelopeFor(text: string): { envelope: DMEnvelope; contentType: string } {
  return asURL(text) !== null ? { envelope: { t: "link", url: text.trim() }, contentType: "link" } : { envelope: { t: "text", body: text }, contentType: "text" };
}

/** Seal any envelope and post it; the server sees ciphertext, nonce, versions and a content type. */
export async function sendEnvelopeTo(envelope: DMEnvelope, contentType: string, conversationId: string, target: SealTarget): Promise<DMMessageRow> {
  const raw = await withGroupRetry(target, async (t) => api.post(endpoints.dmSend(conversationId), await sealedBody(envelope, contentType, t)));
  const row = normalizeMessageRow(raw);
  if (!row) throw new ApiError(0, "Failed to process server response.", "DECODE");
  if (row.groupKeyVersion != null) noteGroupVersion(conversationId, row.groupKeyVersion);
  return row;
}

/** Words (or a link), with the message it answers inside the envelope. */
export async function sendTextTo(text: string, conversationId: string, target: SealTarget, replyTo: { id: string; text: string; senderId: string } | null = null): Promise<DMMessageRow> {
  const { envelope, contentType } = envelopeFor(text);
  if (replyTo) { envelope.re = replyTo.id; envelope.rq = replyTo.text; envelope.rs = replyTo.senderId; }
  return sendEnvelopeTo(envelope, contentType, conversationId, target);
}

/** Direct chats, as before. */
export async function sendText(text: string, conversationId: string, otherUserId: string, otherPublicKey: string, otherKeyVersion: number): Promise<DMMessageRow> {
  return sendTextTo(text, conversationId, { kind: "pair", otherUserId, publicKey: otherPublicKey, keyVersion: otherKeyVersion });
}
export async function sendEnvelope(envelope: DMEnvelope, contentType: string, conversationId: string, otherUserId: string, otherPublicKey: string, otherKeyVersion: number): Promise<DMMessageRow> {
  return sendEnvelopeTo(envelope, contentType, conversationId, { kind: "pair", otherUserId, publicKey: otherPublicKey, keyVersion: otherKeyVersion });
}

/** The server's row says which group key it was sealed with: a rotation of mine it now knows. */
function noteGroupVersion(conversationId: string, version: number) {
  const r = rotatedTo.get(conversationId);
  if (r != null && version >= r) rotatedTo.delete(conversationId);
}

/**
 * Edit (gated by dm_edit): the new text sealed exactly like a send (the text
 * or link envelope), PATCH {ciphertext, nonce, senderKeyVersion,
 * recipientKeyVersion, contentType[, groupKeyVersion]}. Returns the server row when it sends one.
 */
export async function editTextTo(text: string, conversationId: string, messageId: string, target: SealTarget): Promise<DMMessageRow | null> {
  const { envelope, contentType } = envelopeFor(text);
  const raw = await withGroupRetry(target, async (t) => api.patch(endpoints.dmMessage(conversationId, messageId), await sealedBody(envelope, contentType, t)));
  const r = raw && typeof raw === "object" && "message" in (raw as Record<string, unknown>) ? (raw as Record<string, unknown>).message : raw;
  return normalizeMessageRow(r);
}
export async function editText(text: string, conversationId: string, messageId: string, otherUserId: string, otherPublicKey: string, otherKeyVersion: number): Promise<DMMessageRow | null> {
  return editTextTo(text, conversationId, messageId, { kind: "pair", otherUserId, publicKey: otherPublicKey, keyVersion: otherKeyVersion });
}

/**
 * Unsend: DELETE /dm/conversations/:id/messages/:messageId, with
 * {uploadIds: [blobId, posterId]} for a photo or video so the stored files
 * go too. 404 MESSAGE_NOT_FOUND counts as done.
 */
export async function deleteMessage(conversationId: string, message: DMMessage): Promise<void> {
  const uploadIds = message.media ? [message.media.blobId, message.media.posterId].filter((x): x is string => !!x && x !== "pending") : [];
  try {
    await request(endpoints.dmMessage(conversationId, message.id), "DELETE", uploadIds.length ? { uploadIds } : undefined);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && e.code === "MESSAGE_NOT_FOUND") return;
    throw e;
  }
}

// ── Reactions · pins · forward · delete for you · report ─────────────────
// Wire: backend/dm-actions-contract.md.

/** One emoji on a message, sealed like a message ({t: "reaction", body}) so the server holds a blob; null takes yours back. */
export async function react(emoji: string | null, messageId: string, conversationId: string, target: SealTarget): Promise<void> {
  const path = endpoints.dmReaction(conversationId, messageId);
  if (emoji) await withGroupRetry(target, async (t) => api.put(path, await sealedBody({ t: "reaction", body: emoji }, "reaction", t)));
  else await request(path, "DELETE");
}

/** Pin to (or take off) the top of the thread. Three at most (409 PIN_LIMIT past that). */
export async function pin(messageId: string, conversationId: string, on: boolean): Promise<void> {
  const path = endpoints.dmPin(conversationId, messageId);
  if (on) await api.put(path, {}); else await request(path, "DELETE");
}

/** "Delete for you": gone from this account's thread on every device; the others keep it. */
export async function hide(messageId: string, conversationId: string): Promise<void> {
  await api.post(endpoints.dmHide(conversationId, messageId), {});
}

/** Report a message: the words this browser decrypted, with the reason tapped. */
export async function reportMessage(conversationId: string, messageId: string, reason: string, text: string): Promise<void> {
  await api.post(endpoints.dmReport(conversationId, messageId), { reason, text: prefixChars(text, 2000) });
}

/** The same words (or link) to another chat, marked forwarded. Photos and videos can't go yet: their bytes are sealed for one chat. */
export async function forward(m: DMMessage, row: DMConversationRow): Promise<void> {
  if (m.media) throw new DMUserError("Photos and videos can't be forwarded yet.");
  const target = sealTargetOf(row);
  if (!target) throw new DMUserError("They can't receive messages yet.");
  const { envelope, contentType } = envelopeFor(m.linkURL ?? m.text);
  envelope.fw = true;
  const sent = await sendEnvelopeTo(envelope, contentType, row.id, target);
  noteLocalMessage(row.id, { id: sent.id, senderId: sent.senderId, text: m.linkURL ?? m.text, isMine: true, createdAt: sent.createdAt, decrypted: true, linkURL: m.linkURL, media: null, forwarded: true });
}

/** What an alert says: the server's message, or, while the routes aren't
 *  deployed yet (404 without a code / "Route not found", or the server's
 *  503 *_UNAVAILABLE before its migration), that this needs the next server update. */
export function explainActionError(e: unknown, feature: string): string {
  if (e instanceof DMUserError) return e.message;
  if (e instanceof Error && e.message === "NOT_LINKED") return "Link this browser from your phone to use Messages.";
  if (e instanceof ApiError) {
    const routeMissing = (e.status === 404 && (!e.code || e.message.startsWith("Route not found"))) || e.message.startsWith("Route not found");
    const notYet = e.status === 503 && !!e.code && /_UNAVAILABLE$/.test(e.code);
    if (routeMissing || notYet) return `${feature} needs the next server update.`;
    if (e.isConnectionProblem) return "Check your connection and try again.";
    return e.message || "Check your connection and try again.";
  }
  return "Check your connection and try again.";
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

/** One conversation by id (deep links): from the inbox feed; a group with nothing said yet isn't listed, its own route is. */
export async function conversation(id: string): Promise<DMConversationRow | null> {
  try {
    const row = (await conversations()).find((r) => r.id === id);
    if (row) return row;
  } catch { /* the group route below */ }
  try {
    const raw = await api.get(endpoints.dmGroup(id));
    return raw && typeof raw === "object" ? normalizeConversationRow(raw) : null;
  } catch {
    return null;
  }
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
/** The app-wide block (POST /dm/blocks), through the shared blocked store. */
export async function blockUser(userId: string): Promise<void> {
  try { await blockEverywhere(userId); } catch { /* ignore */ }
}
export async function unblockUser(userId: string): Promise<void> {
  try { await unblockEverywhere(userId); } catch { /* ignore */ }
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
/** A pending text that never resolved is forgotten after 20 s; a photo/video
 *  stays "Sending…" while its bytes go up (it isn't sent until they're in). */
export function expireStalePending() {
  for (const [id, m] of latestByConversation) {
    const ttl = m.media ? 10 * 60_000 : 20_000;
    if (isPendingId(m.id) && Date.now() - new Date(m.createdAt).getTime() > ttl) latestByConversation.delete(id);
  }
}
/** A message is gone (unsent): the inbox falls back to the one before it (or the server's row). */
export function forgetLatestIf(conversationId: string, messageId: string, previous: DMMessage | null = null) {
  if (latestByConversation.get(conversationId)?.id !== messageId) return;
  if (previous) latestByConversation.set(conversationId, previous);
  else latestByConversation.delete(conversationId);
}
/** A message was edited: the inbox preview follows when it is the newest. */
export function replaceLatestIf(conversationId: string, message: DMMessage) {
  if (latestByConversation.get(conversationId)?.id === message.id) latestByConversation.set(conversationId, message);
}
/** A dropped send with nothing real before it: the row stops claiming "Sending…". */
export function forgetPendingLatest(conversationId: string, pendingId: string) {
  if (latestByConversation.get(conversationId)?.id === pendingId) latestByConversation.delete(conversationId);
}
export interface Newest { id: string; at: string; isMine: boolean; local: DMMessage | null }
export function newestFor(row: DMConversationRow): Newest | null {
  let server: Newest | null = row.lastMessage ? { id: row.lastMessage.id, at: row.lastMessage.createdAt, isMine: row.lastMessage.senderId === linkUserId, local: null } : null;
  // The server's newest won't open here: the newest that does stands in.
  if (hidesNewest(row)) {
    const s = standInMessage(row);
    server = s ? { id: s.id, at: s.createdAt, isMine: s.isMine, local: s } : null;
  }
  const local = latestByConversation.get(row.id);
  if (!local || unopenable.has(local.id)) return server;
  const mine: Newest = { id: local.id, at: local.createdAt, isMine: local.isMine, local };
  if (!server) return mine;
  if (isPendingId(local.id) || local.id === server.id || new Date(local.createdAt) > new Date(server.at)) return mine;
  return server;
}
/** The one judgement of "how many unread" for a row (inbox dot, badge). */
export function unreadFor(row: DMConversationRow): number {
  const n = newestFor(row);
  if (!n) return hidesNewest(row) ? 0 : (row.unreadCount ?? 0);
  if (readLedger.isRead(row.id, n.id, n.isMine, n.at, row.lastReadAt)) return 0;
  // The server's count includes what won't open here: one, at most.
  if (hidesNewest(row)) return 1;
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

/** The conversations as the server last listed them, so the count can be
 *  judged again here the moment a message arrives. */
let lastRows: DMConversationRow[] = [];

/** A message has just arrived over the socket: the count from what this
 *  browser already knows, at once, so the badge never waits on the server
 *  (the read that follows settles it). A beat first, so a thread that's open
 *  on that chat has marked the message seen (N12-5). */
async function countArrival(conversationId: string, messageId: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 150));
  let count = lastRows.filter((r) => unreadFor(r) > 0).length;
  // A chat the list hasn't shown yet: unread, unless it's the one open.
  if (!lastRows.some((r) => r.id === conversationId) && readLedger.viewedThrough(conversationId) !== messageId) count += 1;
  setUnread(count);
}

/** Unread conversations, by the same judgement the inbox uses. */
export async function refreshUnread(): Promise<void> {
  if (!linkUserId) return;
  try {
    const rows = await conversations();
    lastRows = rows;
    expireStalePending();
    // A row whose newest won't open counts by the newest that does.
    for (const r of rows) if (unreadFor(r) > 0) await serverPreview(r);
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
/** The personal socket is up: dm:* events arrive as they happen (DMSocketHolder.isConnected). */
export function socketConnected(): boolean { return !!relayAttached?.connected; }
export async function ensureDMSocket(): Promise<Socket | null> {
  try {
    const s = await getSocket();
    if (relayAttached === s) return s;
    relayAttached = s;
    // A reconnect (not the first connect, which the start covers): what was
    // sent while the socket was down never reached this tab, so the count is
    // read again.
    let connectedBefore = s.connected;
    s.on("connect", () => {
      const reconnect = connectedBefore;
      connectedBefore = true;
      if (reconnect) void refreshUnread();
      emit("connection", { connected: true, reconnect });
    });
    s.on("disconnect", () => { emit("connection", { connected: false, reconnect: false }); });
    s.on("dm:message", (payload: { conversationId?: string; message?: unknown }) => {
      const row = normalizeMessageRow(payload?.message);
      if (!payload?.conversationId || !row) return;
      const conversationId = payload.conversationId;
      emit("message", { conversationId, message: row });
      // Our own echo is handled by the thread that sent it.
      if (row.senderId !== linkUserId) {
        void (async () => {
          const m = await decryptIn(row, contextForRow(row, conversationId));
          if (!m.decrypted) return;   // hidden: not the newest, not counted
          noteLatest(conversationId, m);
          await countArrival(conversationId, m.id);
          await refreshUnread();
        })();
      }
    });
    // dm:reaction {conversationId, messageId, userId, reaction: sealed row | null} — both sides, every device.
    s.on("dm:reaction", (payload: { conversationId?: string; messageId?: string; userId?: string; reaction?: unknown }) => {
      if (!payload?.conversationId || !payload.messageId) return;
      emit("reaction", { conversationId: payload.conversationId, messageId: String(payload.messageId), userId: String(payload.userId ?? ""), reaction: normalizeReactionRow(payload.reaction) });
    });
    // dm:pinned {conversationId, messageId, pinned, pinnedAt, pinnedBy}.
    s.on("dm:pinned", (payload: { conversationId?: string; messageId?: string; pinned?: boolean; pinnedAt?: string | null }) => {
      if (!payload?.conversationId || !payload.messageId) return;
      emit("pinned", { conversationId: payload.conversationId, messageId: String(payload.messageId), pinned: payload.pinned === true, pinnedAt: payload.pinnedAt || null });
    });
    // dm:group_updated {conversationId, conversation, events?, removed?}: each member's own row; the lines it wrote ride along.
    s.on("dm:group_updated", (payload: { conversationId?: string; conversation?: unknown; events?: unknown; removed?: boolean }) => {
      if (!payload?.conversationId) return;
      const conv = payload.conversation && typeof payload.conversation === "object" ? normalizeConversationRow(payload.conversation) : null;
      emit("groupUpdated", { conversationId: payload.conversationId, conversation: conv, events: normalizeGroupEvents(payload.events), removed: payload.removed === true });
      if (payload.removed === true) { emit("removed", { conversationId: payload.conversationId }); void refreshUnread(); }
    });
    // dm:group_key {conversationId, keyVersion}: a new key version was sealed to the members.
    s.on("dm:group_key", (payload: { conversationId?: string; keyVersion?: number }) => {
      if (!payload?.conversationId) return;
      emit("groupKey", { conversationId: payload.conversationId, keyVersion: Number(payload.keyVersion) || 0 });
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
    s.on("dm:media_ready", (payload: { conversationId?: string; uploadId?: string; kind?: string; size?: number }) => {
      if (!payload?.conversationId || !payload.uploadId) return;
      emit("mediaReady", { conversationId: payload.conversationId, uploadId: payload.uploadId, kind: payload.kind ?? "", size: Number(payload.size ?? 0) });
    });
    s.on("dm:removed", (payload: { conversationId?: string }) => {
      if (payload?.conversationId) emit("removed", { conversationId: payload.conversationId });
    });
    // dm:deleted {conversationId, messageId} reaches both sides, every device.
    s.on("dm:deleted", (payload: { conversationId?: string; messageId?: string }) => {
      if (!payload?.conversationId || !payload.messageId) return;
      forgetLatestIf(payload.conversationId, String(payload.messageId));
      emit("deleted", { conversationId: payload.conversationId, messageId: String(payload.messageId) });
    });
    // dm:edited {conversationId, message: row} (pending on the backend).
    s.on("dm:edited", (payload: { conversationId?: string; message?: unknown }) => {
      const row = normalizeMessageRow(payload?.message);
      if (!payload?.conversationId || !row) return;
      // The inbox re-reads the row rather than keep the old text as "newest".
      forgetLatestIf(payload.conversationId, row.id);
      emit("edited", { conversationId: payload.conversationId, message: { ...row, editedAt: row.editedAt ?? new Date().toISOString() } });
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

// ── Lost key versions taken back (DirectMessages.swift reconcileLostVersions) ──
// GET /dm/keys/lost names the versions of my key some device of mine
// reported lost; the server hides what was locked to them, for the whole
// account. Any of those this browser holds is taken back with
// DELETE /dm/keys/lost {versions: exactly those}, and those messages return.
// (Never an empty list: that would clear versions this browser can't open.)
let reclaimedAt = 0;
let reclaimInFlight: Promise<boolean> | null = null;

const asVersions = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 1))] : [];

/** Whether this browser holds my key at a version: under its number, or
 *  under another (found by the public half the server names for it).
 *  null: the server couldn't be asked. */
async function holdsMyKey(version: number, me: string): Promise<boolean | null> {
  if (await loadKeyForVersion(me, version)) return true;
  let row: DMKeyRow;
  try { row = await publicKeyFor(me, version); } catch { return null; }
  if (!row.publicKey) return false;
  const held = await heldKeyForPublic(me, row.publicKey);
  if (!held) return false;
  await rememberVersion(held, version);
  keyCache.clear();     // a derived key made with the wrong key for that version goes
  return true;
}

/** True when any version came back. */
async function reconcileLostVersions(): Promise<boolean> {
  reclaimedAt = Date.now();
  const me = linkUserId;
  if (!me) return false;
  let lost: number[];
  try { lost = asVersions((await api.get<{ versions?: unknown }>(endpoints.dmLostKeys))?.versions); } catch { return false; }
  if (!lost.length) return false;
  const back: number[] = [];
  for (const v of lost) if ((await holdsMyKey(v, me)) === true) back.push(v);
  if (!back.length || linkUserId !== me) return false;
  try { await request(endpoints.dmLostKeys, "DELETE", { versions: back }); } catch { return false; }
  forgetHidden();
  emit("keysReclaimed", {});
  return true;
}

/**
 * Take back what this browser holds. `force` skips the 10 s spacing (the
 * key just settled, the tab came back, or a message of mine just dropped
 * out of the server's page — which is what the hiding looks like). One
 * check at a time; true when anything came back (the unread count is
 * re-read and `keysReclaimed` fires for the inbox and an open thread).
 */
export function reclaimHeldVersions(force = false): Promise<boolean> {
  if (!linkUserId || (linkState.kind !== "linked" && linkState.kind !== "stale")) return Promise.resolve(false);
  if (reclaimInFlight) return reclaimInFlight;
  if (!force && Date.now() - reclaimedAt < 10_000) return Promise.resolve(false);
  reclaimInFlight = (async () => {
    try {
      const back = await reconcileLostVersions();
      if (back) await refreshUnread();
      return back;
    } finally {
      reclaimInFlight = null;
    }
  })();
  return reclaimInFlight;
}

// Every return to the tab: messages another device of mine hid that this
// browser can open come back.
let visibilityHooked = false;
function hookVisibility() {
  if (visibilityHooked || typeof document === "undefined") return;
  visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void reclaimHeldVersions(true);
  });
}

/** Start everything for a signed-in user: key, socket, unread. Idempotent. */
export async function startDM(userId: string): Promise<LinkState> {
  // Sign-in: the app-wide blocked list loads with the DM service.
  void loadBlocked(userId);
  hookVisibility();
  const state = await ensureLinked(userId);
  await ensureDMSocket();
  if (state.kind !== "unlinked") void refreshUnread();
  return state;
}
