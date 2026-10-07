// messages/dm-local.ts — what the iOS screens pass around through
// NotificationCenter (.dmReadLocal) and AppState (openDMConversationId,
// pendingDMConversationId), as one small module the inbox, the thread and
// the profile's Message button share.
"use client";

import type { DMConversationRow } from "./types";

// ── Rows known to this tab (the inbox's list + conversations just opened) ──
const rows = new Map<string, DMConversationRow>();
export function rememberRow(row: DMConversationRow) { rows.set(row.id, row); }
export function rememberRows(list: DMConversationRow[]) { for (const r of list) rows.set(r.id, r); }
export function forgetRow(id: string) { rows.delete(id); }
export function knownRow(id: string): DMConversationRow | null { return rows.get(id) ?? null; }

// ── The thread on screen (AppState.openDMConversationId) ──────────────────
let openId: string | null = null;
export function setOpenConversation(id: string | null) { openId = id; }
export function openConversationId(): string | null { return openId; }

// ── .dmReadLocal — the thread was viewed; the inbox clears its row now ───
type ReadLocal = { conversationId: string; lastMessageId: string | null };
const readLocalHandlers = new Set<(p: ReadLocal) => void>();
export function emitReadLocal(conversationId: string, lastMessageId: string | null) {
  readLocalHandlers.forEach((h) => { try { h({ conversationId, lastMessageId }); } catch { /* listener bug */ } });
}
export function onReadLocal(h: (p: ReadLocal) => void): () => void {
  readLocalHandlers.add(h);
  return () => { readLocalHandlers.delete(h); };
}

// ── A toast for the inbox ("Conversation removed"): shown now if it is
//    mounted (desktop panes), or on its next mount (phones).
let pendingToast: string | null = null;
const toastHandlers = new Set<(message: string) => void>();
export function queueInboxToast(message: string) {
  if (toastHandlers.size > 0) toastHandlers.forEach((h) => h(message));
  else pendingToast = message;
}
export function takeInboxToast(): string | null { const t = pendingToast; pendingToast = null; return t; }
export function onInboxToast(h: (message: string) => void): () => void {
  toastHandlers.add(h);
  return () => { toastHandlers.delete(h); };
}

// ── A thread removed or blocked from its own header: the inbox drops the row ─
const removedHandlers = new Set<(conversationId: string) => void>();
export function emitRemovedLocal(conversationId: string) {
  removedHandlers.forEach((h) => { try { h(conversationId); } catch { /* listener bug */ } });
}
export function onRemovedLocal(h: (conversationId: string) => void): () => void {
  removedHandlers.add(h);
  return () => { removedHandlers.delete(h); };
}
