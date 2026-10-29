// moderation/chat-actions.ts — Edit and Delete on your own live chat
// messages (parity §4; backend/message-edit-delete-contract.md, pending:
// PATCH / DELETE /chat/:room/messages/:id, socket chat:edited / chat:deleted,
// gated by /status chat_edit).
//
// Both show up at once: the change goes out as a local event that the live
// match hook (use-live-match.ts) applies to its message list, and if the
// server refuses, a `restore` puts the message back exactly as it was.
import { api, ApiError, endpoints } from "@/lib/api";
import type { Json } from "@/lib/types";
import { chatEditedPayload, type LiveChatMessage } from "@/features/matches/live/types";

export type ChatLocalEvent =
  /** Replace the message with this id, in place. */
  | { type: "edit"; roomId: string; message: LiveChatMessage }
  | { type: "delete"; roomId: string; messageId: string }
  /** Put it back as it was (replace, or re-insert by time when it was removed). */
  | { type: "restore"; roomId: string; message: LiveChatMessage };

const handlers = new Set<(e: ChatLocalEvent) => void>();
export function onChatLocal(h: (e: ChatLocalEvent) => void): () => void {
  handlers.add(h);
  return () => { handlers.delete(h); };
}
function emit(e: ChatLocalEvent) {
  handlers.forEach((h) => { try { h(e); } catch { /* a listener bug must not break the edit */ } });
}

/** PATCH {text}. Throws (after restoring the original) when the server refuses. */
export async function editChatMessage(roomId: string, original: LiveChatMessage, text: string): Promise<void> {
  const optimistic: LiveChatMessage = { ...original, message: text, editedAt: new Date().toISOString() };
  emit({ type: "edit", roomId, message: optimistic });
  try {
    const raw = await api.patch<Json>(endpoints.chatMessage(roomId, original.id), { text });
    const saved = chatEditedPayload(raw)?.message;
    if (saved && saved.id === original.id) emit({ type: "edit", roomId, message: { ...optimistic, message: saved.message, editedAt: saved.editedAt ?? optimistic.editedAt } });
  } catch (e) {
    emit({ type: "restore", roomId, message: original });
    throw e;
  }
}

/** DELETE. A message already gone counts as done; anything else restores it and throws. */
export async function deleteChatMessage(roomId: string, original: LiveChatMessage): Promise<void> {
  emit({ type: "delete", roomId, messageId: original.id });
  try {
    await api.delete(endpoints.chatMessage(roomId, original.id));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && e.code === "MESSAGE_NOT_FOUND") return;
    emit({ type: "restore", roomId, message: original });
    throw e;
  }
}

/** Apply a local event or a socket change to a message list (oldest → newest). */
export function applyChatChange(list: LiveChatMessage[], e: ChatLocalEvent): LiveChatMessage[] {
  if (e.type === "delete") return list.some((m) => m.id === e.messageId) ? list.filter((m) => m.id !== e.messageId) : list;
  const i = list.findIndex((m) => m.id === e.message.id);
  if (i >= 0) return list.map((m, j) => (j === i ? e.message : m));
  if (e.type === "edit") return list;   // an edit to a message we don't hold changes nothing
  const t = e.message.timestamp ? Date.parse(e.message.timestamp) : NaN;
  if (Number.isNaN(t)) return [...list, e.message];
  const at = list.findIndex((m) => m.timestamp != null && Date.parse(m.timestamp) > t);
  return at < 0 ? [...list, e.message] : [...list.slice(0, at), e.message, ...list.slice(at)];
}
