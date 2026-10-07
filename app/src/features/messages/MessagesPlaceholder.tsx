// MessagesPlaceholder — MessagesInboxView's header, with an empty state
// explaining that end-to-end encrypted messages stay in the iOS app for
// now. The crypto (DirectMessages.swift) is intentionally not ported.
"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, SquarePen } from "lucide-react";
import { useAppState } from "@/store/app-state";
import { AssetIcon, EmptyState, Page, TabHeaderTitle } from "@/components/ui";

export function MessagesPlaceholder() {
  const router = useRouter();
  const { unreadDMs } = useAppState();
  return (
    <Page>
      <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-2">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="grid place-items-center size-8 text-primary hover:text-violet md:hidden"><ChevronLeft size={20} /></button>
        <TabHeaderTitle text="Messages" />
        <span className="flex-1" />
        <span aria-label="New message" title="Available in the iOS app" className="grid place-items-center size-8 text-violet/50"><SquarePen size={18} /></span>
      </div>
      <div className="pt-10 max-w-2xl">
        <EmptyState
          icon={<AssetIcon name="messages" height={30} />}
          title="Messages live in the app for now"
          subtitle={`Your conversations are end-to-end encrypted, and the keys stay on your phone — so for now, read and send messages in the Insight iOS app.${unreadDMs > 0 ? ` You have ${unreadDMs} unread.` : ""}`}
        />
      </div>
    </Page>
  );
}
