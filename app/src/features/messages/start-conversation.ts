// messages/start-conversation.ts — NewMessageView.open / the profile's
// Message button: POST /conversations, remember the row, go to the thread.
// Errors use the app's coded copy (APIClientError.coded → errorDescription).
"use client";

import { ApiError } from "@/lib/api";
import { createConversation } from "./service";
import { rememberRow } from "./dm-local";
import type { DMConversationRow } from "./types";

const CODED: Record<string, string> = {
  CANNOT_MESSAGE_USER: "You can't message this account.",
  YOU_BLOCKED_THIS_USER: "You blocked this account.",
  NO_KEY: "This user can't receive messages yet.",
  USER_NOT_FOUND: "User not found.",
  SELF_MESSAGE: "You can't message yourself.",
};

export function startConversationMessage(e: unknown): string {
  if (e instanceof ApiError && e.code && CODED[e.code]) return CODED[e.code];
  if (e instanceof ApiError && e.isConnectionProblem) return e.message;
  return "Couldn't start the conversation.";
}

/** Opens (or creates) the thread with a user and returns its row. Throws; callers map with startConversationMessage. */
export async function startConversation(userId: string): Promise<DMConversationRow> {
  const row = await createConversation(userId);
  rememberRow(row);
  return row;
}
