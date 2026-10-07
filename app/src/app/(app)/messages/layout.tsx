// /messages/* — the Messages frame (inbox pane + thread pane on desktop,
// separate screens on phones). A layout so the inbox stays mounted while
// threads come and go.
"use client";

import { MessagesShell } from "@/features/messages/MessagesShell";

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <MessagesShell>{children}</MessagesShell>;
}
