// messages/types.ts — the DM wire models (DirectMessages.swift), decoded
// tolerantly like the app does: the other party may arrive flat
// (other_username…) or nested ({other: {…}}); a missing name renders "User".
import { bool, int, iso, normalizePremiumStyle, normalizeTitle, str, type Json, type PremiumStylePiece } from "@/lib/types";
// Type-only: the decoders below stay free of UI imports (no import cycle via app state).
import type { FlairUser } from "@/components/ui/premium-flair";

export interface DMKeyRow {
  userId: string | null;
  publicKey: string | null;
  keyVersion: number | null;
  algorithm: string | null;
  rotated: boolean | null;
}
export function normalizeKeyRow(raw: Json): DMKeyRow {
  const r = raw ?? {};
  return {
    userId: str(r.user_id ?? r.userId),
    publicKey: str(r.public_key ?? r.publicKey),
    keyVersion: int(r.key_version ?? r.keyVersion),
    algorithm: str(r.algorithm),
    rotated: typeof r.rotated === "boolean" ? r.rotated : null,
  };
}

/** A message as the server stores it: ciphertext only. */
export interface DMMessageRow {
  id: string;
  conversationId: string | null;
  senderId: string;
  ciphertext: string;
  nonce: string;
  senderKeyVersion: number;
  recipientKeyVersion: number;
  contentType: string | null;
  createdAt: string; // ISO
  /** Set once the sender edited it (pending on the backend: dm_edit). */
  editedAt: string | null;
  /** Everyone's reactions, each sealed like a message (null: the row carried none). */
  reactions: DMReactionRow[] | null;
  /** Set while the message is pinned to the top of the thread. */
  pinnedAt: string | null;
  /** In a group: the group key version it was sealed with (the pair versions are 0 there). */
  groupKeyVersion: number | null;
}
/** One person's reaction on a message: an emoji sealed with the pair's (or the group's) key. */
export interface DMReactionRow {
  userId: string;
  ciphertext: string;
  nonce: string;
  senderKeyVersion: number;
  recipientKeyVersion: number;
  createdAt: string | null;
  groupKeyVersion: number | null;
}
/** Decoded tolerantly: a bad row is skipped, never the message. */
export function normalizeReactionRow(raw: Json): DMReactionRow | null {
  if (!raw || typeof raw !== "object") return null;
  const userId = str(raw.user_id ?? raw.userId), ciphertext = str(raw.ciphertext), nonce = str(raw.nonce);
  if (!userId || !ciphertext || !nonce) return null;
  return {
    userId, ciphertext, nonce,
    senderKeyVersion: int(raw.sender_key_version ?? raw.senderKeyVersion) ?? 1,
    recipientKeyVersion: int(raw.recipient_key_version ?? raw.recipientKeyVersion) ?? 1,
    createdAt: iso(raw.created_at ?? raw.createdAt),
    groupKeyVersion: int(raw.group_key_version ?? raw.groupKeyVersion),
  };
}
export function normalizeMessageRow(raw: Json): DMMessageRow | null {
  if (!raw || typeof raw !== "object" || raw.id == null) return null;
  return {
    id: String(raw.id),
    conversationId: str(raw.conversation_id ?? raw.conversationId),
    senderId: str(raw.sender_id ?? raw.senderId) ?? "",
    ciphertext: str(raw.ciphertext) ?? "",
    nonce: str(raw.nonce) ?? "",
    senderKeyVersion: int(raw.sender_key_version ?? raw.senderKeyVersion) ?? 1,
    recipientKeyVersion: int(raw.recipient_key_version ?? raw.recipientKeyVersion) ?? 1,
    contentType: str(raw.content_type ?? raw.contentType),
    createdAt: iso(raw.created_at ?? raw.createdAt) ?? new Date().toISOString(),
    editedAt: iso(raw.edited_at ?? raw.editedAt),
    reactions: Array.isArray(raw.reactions) ? raw.reactions.map(normalizeReactionRow).filter((r: DMReactionRow | null): r is DMReactionRow => r !== null) : null,
    pinnedAt: iso(raw.pinned_at ?? raw.pinnedAt),
    groupKeyVersion: int(raw.group_key_version ?? raw.groupKeyVersion),
  };
}

/** One person in a group (the wire's `members[]`): who, their role, how far
 *  they've read, when they joined (and who added them), and their current DM
 *  key so a group key can be sealed to them without another round trip. */
export interface DMMember {
  id: string;
  username: string;
  avatarURL: string | null;
  title?: string | null;
  isPremium: boolean;
  premiumStyle: PremiumStylePiece[] | null;
  role: string;
  joinedAt: string | null;
  /** Who added them; null for founders and older rows. */
  addedBy: string | null;
  /** Their name, sent so the line reads right after they leave. */
  addedByUsername: string | null;
  lastReadAt: string | null;
  publicKey: string | null;
  keyVersion: number | null;
}
export function normalizeMember(raw: Json): DMMember | null {
  if (!raw || typeof raw !== "object") return null;
  const id = str(raw.id ?? raw.user_id);
  if (!id) return null;
  return {
    id,
    username: str(raw.username) ?? "User",
    avatarURL: str(raw.avatar_url ?? raw.avatarURL),
    title: raw.title !== undefined ? normalizeTitle(raw.title) : undefined,
    isPremium: bool(raw.is_premium ?? raw.isPremium),
    premiumStyle: normalizePremiumStyle(raw.premium_style ?? raw.premiumStyle),
    role: str(raw.role) ?? "member",
    joinedAt: iso(raw.joined_at),
    addedBy: str(raw.added_by),
    addedByUsername: str(raw.added_by_username),
    lastReadAt: iso(raw.last_read_at),
    publicKey: str(raw.public_key),
    keyVersion: int(raw.key_version),
  };
}
export const isAdmin = (m: DMMember) => m.role === "admin";
export function memberFlair(m: DMMember): FlairUser {
  return { id: m.id, username: m.username, avatarURL: m.avatarURL, isPremium: m.isPremium, premiumStyle: m.premiumStyle, title: m.title };
}
function normalizeMembers(v: Json): DMMember[] {
  return Array.isArray(v) ? v.map(normalizeMember).filter((m: DMMember | null): m is DMMember => m !== null) : [];
}

/** One thing that happened to a group (the wire's `events[]`): added, removed,
 *  left, renamed. The names travel with it (someone who left is no longer in
 *  members[]). Read leniently: one odd entry never costs the page. */
export interface DMGroupEvent {
  id: string;
  kind: string;               // added · removed · left · renamed
  createdAt: string;
  actorId: string | null;
  actorUsername: string | null;
  targetId: string | null;
  targetUsername: string | null;
  /** renamed: the new name, "" when it was cleared. */
  detail: string | null;
}
export function normalizeGroupEvent(raw: Json): DMGroupEvent | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: str(raw.id) ?? crypto.randomUUID(),
    kind: str(raw.kind) ?? "",
    createdAt: iso(raw.created_at) ?? new Date(0).toISOString(),
    actorId: str(raw.actor_id),
    actorUsername: str(raw.actor_username),
    targetId: str(raw.target_id),
    targetUsername: str(raw.target_username),
    detail: typeof raw.detail === "string" ? raw.detail : null,
  };
}
/** undefined: the wire carried no `events` (a server before the migration). */
export function normalizeGroupEvents(v: Json): DMGroupEvent[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map(normalizeGroupEvent).filter((e: DMGroupEvent | null): e is DMGroupEvent => e !== null);
}

/** An inbox row (GET /dm/conversations) or the open response (POST). */
export interface DMConversationRow {
  id: string;
  createdAt: string | null;
  lastMessageAt: string | null;
  lastReadAt: string | null;        // mine
  otherLastReadAt: string | null;   // theirs — the receipt
  muted: boolean;
  otherId: string;
  otherUsername: string;
  otherAvatarURL: string | null;
  /** The other person's look (other_is_premium / other_premium_style / other_title). */
  otherIsPremium: boolean;
  otherPremiumStyle: PremiumStylePiece[] | null;
  /** undefined = not on the row (podium fallback). */
  otherTitle?: string | null;
  otherPublicKey: string | null;
  otherKeyVersion: number | null;
  lastMessage: DMMessageRow | null;
  unreadCount: number | null;
  // ── Groups (backend/group-chats-contract.md) ──
  /** "direct" (the default) or "group". */
  kind: string;
  /** The group's name, when it has one; else the members' names stand in. */
  name: string | null;
  createdBy: string | null;
  /** The group key version messages are sealed with right now. */
  groupKeyVersion: number | null;
  /** Someone left or was removed and nobody has rotated yet: the next sender rotates first. */
  keyRotationNeeded: boolean;
  /** Everyone in the group, me included. */
  members: DMMember[];
}
export const isGroupRow = (r: DMConversationRow) => r.kind === "group";
export function conversationNeedsIdentity(r: DMConversationRow): boolean { return !isGroupRow(r) && r.otherUsername === "User"; }
export function memberOf(r: DMConversationRow, id: string | null | undefined): DMMember | null {
  return id ? r.members.find((m) => m.id === id) ?? null : null;
}
/** Everyone but me. */
export function othersOf(r: DMConversationRow, me: string | null | undefined): DMMember[] {
  return r.members.filter((m) => m.id !== me);
}
export function iAmAdmin(r: DMConversationRow, me: string | null | undefined): boolean {
  if (!me) return false;
  const m = memberOf(r, me);
  return m ? isAdmin(m) : r.createdBy === me;
}
/** What the row and the header call this chat: the group's name, or its
 *  people ("karlo, aina, leah"), or the other person. */
export function conversationTitle(r: DMConversationRow, me: string | null | undefined): string {
  if (!isGroupRow(r)) return r.otherUsername;
  const n = r.name?.trim();
  if (n) return n;
  const names = othersOf(r, me).map((m) => m.username);
  return names.length === 0 ? "Group" : names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
}

export function normalizeConversationRow(raw: Json): DMConversationRow {
  const r = raw ?? {};
  const nested = (r.other && typeof r.other === "object" ? r.other : r.other_user && typeof r.other_user === "object" ? r.other_user : null) as Json;
  return {
    id: str(r.id ?? r.conversation_id) ?? crypto.randomUUID(),
    createdAt: iso(r.created_at),
    lastMessageAt: iso(r.last_message_at),
    lastReadAt: iso(r.last_read_at),
    otherLastReadAt: iso(r.other_last_read_at),
    muted: bool(r.muted),
    otherId: str(r.other_id ?? nested?.id ?? r.other_user_id) ?? "",
    otherUsername: str(r.other_username ?? nested?.username ?? r.username) ?? "User",
    otherAvatarURL: str(r.other_avatar_url ?? nested?.avatar_url ?? r.avatar_url),
    otherIsPremium: bool(r.other_is_premium ?? nested?.is_premium),
    otherPremiumStyle: normalizePremiumStyle(r.other_premium_style ?? nested?.premium_style),
    otherTitle: r.other_title !== undefined ? normalizeTitle(r.other_title) : nested && nested.title !== undefined ? normalizeTitle(nested.title) : undefined,
    otherPublicKey: str(r.other_public_key ?? nested?.public_key),
    otherKeyVersion: int(r.other_key_version ?? nested?.key_version),
    lastMessage: normalizeMessageRow(r.last_message),
    unreadCount: int(r.unread_count),
    kind: str(r.kind) ?? "direct",
    name: str(r.name),
    createdBy: str(r.created_by),
    groupKeyVersion: int(r.group_key_version),
    keyRotationNeeded: bool(r.key_rotation_needed),
    members: normalizeMembers(r.members),
  };
}

/** The other person as UserIdentity draws them (ring, shine, diamond, ORACLE). */
export function otherFlair(r: DMConversationRow): FlairUser {
  return { id: r.otherId || null, username: r.otherUsername, avatarURL: r.otherAvatarURL, isPremium: r.otherIsPremium, premiumStyle: r.otherPremiumStyle, title: r.otherTitle };
}

export interface DMThreadPage {
  conversationId: string | null;
  otherId: string | null;
  lastReadAt: string | null;       // ours
  otherLastReadAt: string | null;  // theirs
  messages: DMMessageRow[];
  /** The pinned messages as full rows (they may be older than the page); null when absent. */
  pins: DMMessageRow[] | null;
  /** A group: everyone in it with their read stamps, fresh on every page. */
  members: DMMember[] | null;
  groupKeyVersion: number | null;
  keyRotationNeeded: boolean | null;
  /** A group: the grey lines for this page's stretch of time; undefined when the server sends none yet. */
  events: DMGroupEvent[] | undefined;
}
export function normalizeThreadPage(raw: Json): DMThreadPage {
  const r = raw ?? {};
  const list = Array.isArray(r.messages) ? r.messages : Array.isArray(r) ? r : [];
  return {
    conversationId: str(r.conversation_id),
    otherId: str(r.other_id),
    lastReadAt: iso(r.last_read_at),
    otherLastReadAt: iso(r.other_last_read_at),
    messages: list.map(normalizeMessageRow).filter((m: DMMessageRow | null): m is DMMessageRow => m !== null),
    pins: Array.isArray(r.pins) ? r.pins.map(normalizeMessageRow).filter((m: DMMessageRow | null): m is DMMessageRow => m !== null) : null,
    members: Array.isArray(r.members) ? normalizeMembers(r.members) : null,
    groupKeyVersion: int(r.group_key_version),
    keyRotationNeeded: typeof r.key_rotation_needed === "boolean" ? r.key_rotation_needed : null,
    events: normalizeGroupEvents(r.events),
  };
}

/** An encrypted attachment as the envelope describes it (DMMedia). */
export interface DMMedia {
  kind: "image" | "video";
  blobId: string;
  key: string;      // base64 per-file key
  nonce: string;    // base64 blob nonce
  mime: string;
  width: number;
  height: number;
  duration: number | null;
  posterId: string | null;
  posterNonce: string | null;
}
export function mediaAspect(m: DMMedia): number { return m.width > 0 && m.height > 0 ? m.width / m.height : 1; }

/** A decrypted message for display (DMMessage). */
export interface DMMessage {
  id: string;
  senderId: string;
  text: string;          // decrypted body, or "Encrypted message"
  isMine: boolean;
  createdAt: string;     // ISO
  decrypted: boolean;
  linkURL: string | null;
  media: DMMedia | null;
  /** A send in flight shows what was picked, at once (object URL). */
  localPreview?: string | null;
  /** Set on a pending row that the server rejected. */
  failed?: boolean;
  /** Set once edited ("Edited" under the bubble). */
  editedAt?: string | null;
  /** The message this one answers (inside the envelope: re / rq / rs). */
  replyTo?: DMQuote | null;
  /** Sent on from another chat (fw: true). */
  forwarded?: boolean;
  /** Everyone's reactions, mine included. */
  reactions?: DMReaction[];
  /** Pinned to the top of the thread. */
  pinnedAt?: string | null;
}

/** The message a reply answers, as the reply carries it. */
export interface DMQuote { id: string; text: string; senderId: string }
/** One reaction, opened. */
export interface DMReaction { userId: string; emoji: string; isMine: boolean }

export const myReaction = (m: DMMessage): string | null => m.reactions?.find((r) => r.isMine)?.emoji ?? null;
/** What a reply or the pinned bar quotes: the words, or what it was. */
export function quoteText(m: DMMessage): string {
  if (m.media) return m.media.kind === "image" ? "Photo" : "Video";
  if (m.linkURL) return m.linkURL;
  return m.text;
}
/** Swift's String.prefix(n): n characters as a person sees them (grapheme clusters). */
export function prefixChars(s: string, n: number): string {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (!Seg) return Array.from(s).slice(0, n).join("");
  let out = "", i = 0;
  for (const g of new Seg(undefined, { granularity: "grapheme" }).segment(s)) { if (i++ >= n) break; out += g.segment; }
  return out;
}
export function asQuote(m: DMMessage): DMQuote { return { id: m.id, text: prefixChars(quoteText(m), 140), senderId: m.senderId }; }

export const isPendingId = (id: string) => id.startsWith("pending-");

/** Search result row (/search → users[]), or a follow row (suggestions). */
export interface SearchUser { id: string; username: string; avatarURL: string | null; flair?: FlairUser }
export function normalizeSearchUser(raw: Json): SearchUser | null {
  if (!raw || raw.id == null) return null;
  const id = String(raw.id);
  const username = str(raw.username) ?? "user";
  const avatarURL = str(raw.avatar_url ?? raw.avatarURL);
  return {
    id, username, avatarURL,
    flair: { id, username, avatarURL, isPremium: bool(raw.is_premium ?? raw.isPremium), premiumStyle: normalizePremiumStyle(raw.premium_style ?? raw.premiumStyle), title: raw.title !== undefined ? normalizeTitle(raw.title) : undefined },
  };
}
/** The look of a SearchUser (plain when the row carried none). */
export function searchUserFlair(u: SearchUser): FlairUser {
  return u.flair ?? { id: u.id, username: u.username, avatarURL: u.avatarURL, isPremium: false, premiumStyle: null };
}
