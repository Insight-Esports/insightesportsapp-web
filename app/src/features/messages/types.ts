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
  };
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
}
export function conversationNeedsIdentity(r: DMConversationRow): boolean { return r.otherUsername === "User"; }

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
}

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
