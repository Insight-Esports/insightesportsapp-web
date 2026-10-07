// /messages/[id] — MessageThreadView (DMThreadLoaderView by id).
"use client";

import { useParams } from "next/navigation";
import { MessageThread } from "@/features/messages/MessageThread";

export default function MessageThreadPage() {
  const { id } = useParams<{ id: string }>();
  let decoded = id;
  try { decoded = decodeURIComponent(id); } catch { /* keep as is */ }
  return <MessageThread key={decoded} conversationId={decoded} />;
}
