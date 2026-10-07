// /messages — MessagesInboxView. The inbox itself lives in the layout's
// shell; this page fills the thread pane with "Select a conversation".
"use client";

import { ThreadPlaceholder } from "@/features/messages/MessagesShell";

export default function MessagesPage() {
  return <ThreadPlaceholder />;
}
