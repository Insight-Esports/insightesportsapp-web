// MessagesShell — the Messages area's frame, hosted by messages/layout.tsx
// so the inbox survives thread-to-thread navigation.
//
// Desktop (≥ md): two panes — the inbox on the left (360px), the selected
// thread (/messages/[id]) on the right, "Select a conversation" otherwise.
// Phones: the inbox and the thread are separate screens, like the app.
// /messages/new and /messages/link render on their own, outside the panes.
//
// This browser reads with the phone's key (keys.ts): unlinked → the
// "Link your phone" empty state; stale → the inbox with a relink banner;
// checking → the skeleton.
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { clsx } from "@/lib/format";
import { AssetIcon, EmptyState, TabHeaderTitle } from "@/components/ui";
import { MessagesInbox } from "./MessagesInbox";
import { useDMLink } from "./hooks";

export function selectedConversationId(pathname: string): string | null {
  const m = /^\/messages\/([^/]+)\/?$/.exec(pathname);
  if (!m || m[1] === "new" || m[1] === "link") return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

export function MessagesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const linkState = useDMLink();
  const standalone = pathname === "/messages/new" || pathname.startsWith("/messages/link");
  const selectedId = selectedConversationId(pathname);

  // Fill the viewport below whatever the shell draws above us (banners).
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<string>("100dvh");
  useEffect(() => {
    if (standalone) return;
    const measure = () => {
      const top = frame.current?.getBoundingClientRect().top ?? 0;
      setHeight(`calc(100dvh - ${Math.max(0, Math.round(top + window.scrollY))}px)`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [standalone, linkState.kind]);

  if (standalone) return <>{children}</>;

  if (linkState.kind === "unlinked") {
    return (
      <div className="flex flex-col pb-[calc(var(--tabbar-h)+24px)] md:pb-10">
        <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-2">
          <button type="button" onClick={() => router.back()} aria-label="Back" className="grid place-items-center size-8 text-primary hover:text-violet md:hidden"><ChevronLeft size={20} /></button>
          <TabHeaderTitle text="Messages" />
        </div>
        <div className="pt-10 max-w-2xl">
          <EmptyState
            icon={<AssetIcon name="messages" height={30} />}
            title="Link your phone to use Messages here"
            subtitle="Your messages are end-to-end encrypted with a key that lives on your phone. Link this browser once from the app: Settings → Link web."
            actionTitle="Link this browser"
            onAction={() => router.push("/messages/link")}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={frame} className="flex min-h-0 w-full max-w-[1400px]" style={{ height }}>
      <aside className={clsx("w-full md:w-[360px] md:shrink-0 md:border-r md:border-hairline flex-col min-h-0 bg-bg", selectedId ? "hidden md:flex" : "flex")}>
        <MessagesInbox selectedId={selectedId} linkState={linkState} />
      </aside>
      <section className={clsx("flex-1 min-w-0 min-h-0 flex-col", selectedId ? "flex" : "hidden md:flex")}>
        {linkState.kind === "checking" ? null : children}
      </section>
    </div>
  );
}

/** The right pane with nothing selected (desktop only; phones never show it). */
export function ThreadPlaceholder() {
  return (
    <div className="flex-1 grid place-items-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <AssetIcon name="messages" height={30} />
        <span className="t-headline-sm text-primary">Select a conversation</span>
        <span className="t-body-sm text-muted">Pick a thread on the left, or start a new message.</span>
      </div>
    </div>
  );
}
