// MessagesInbox — MessagesInboxView.swift: a ledger of threads (avatar,
// name, decrypted preview, time, unread dot), the swipe actions as a row
// menu (Remove chat · Block), people you follow when the list is short,
// and the link banner when the phone holds a newer key.
"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, SquarePen, Ellipsis, Hand, Trash2, TriangleAlert } from "lucide-react";
import { clsx } from "@/lib/format";
import { AssetIcon, ConfirmDialog, EmptyState, InitialAvatar, LoadFailure, SkeletonLedger, TabHeaderTitle, Toast } from "@/components/ui";
import { readLedger, type LinkState } from "./service";
import { useInbox, threadUnread, type InboxThread } from "./use-inbox";
import { useNow } from "./hooks";
import { relativeAgo, relativeShort } from "./format-dm";
import { startConversation, startConversationMessage } from "./start-conversation";
import { onInboxToast, takeInboxToast } from "./dm-local";
import type { SearchUser } from "./types";

export function MessagesInbox({ selectedId, linkState }: { selectedId: string | null; linkState: LinkState }) {
  const router = useRouter();
  const enabled = linkState.kind === "linked" || linkState.kind === "stale";
  const { threads, suggested, isLoading, error, connectionProblem, load, remove, block } = useInbox(enabled);
  const now = useNow(60_000);
  const [toast, setToast] = useState<string | null>(() => takeInboxToast());
  const say = useCallback((m: string) => setToast(m), []);
  useEffect(() => onInboxToast(setToast), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  const open = async (user: SearchUser) => {
    try {
      const row = await startConversation(user.id);
      router.push(`/messages/${encodeURIComponent(row.id)}`);
    } catch (e) {
      say(startConversationMessage(e));
    }
  };

  const showSuggested = suggested.length > 0 && threads.length < 5;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* In-content header — back arrow, title, compose */}
      <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-2 shrink-0">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="grid place-items-center size-8 text-primary hover:text-violet md:hidden"><ChevronLeft size={20} /></button>
        <TabHeaderTitle text="Messages" />
        <span className="flex-1 min-w-2" />
        <Link href="/messages/new" aria-label="New message" title="New message" className="grid place-items-center size-8 rounded-lg text-violet hover:bg-card transition-colors"><SquarePen size={18} /></Link>
      </div>

      {linkState.kind === "stale" ? (
        <div className="mx-3 mb-2 flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-card border border-border-subtle shrink-0">
          <TriangleAlert size={16} className="text-warning shrink-0 mt-0.5" />
          <span className="t-body-sm text-secondary">
            Your phone has a newer message key — relink this browser to read new messages.{" "}
            <Link href="/messages/link" className="text-violet hover:underline">Relink</Link>
          </span>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto pb-[calc(var(--tabbar-h)+16px)] md:pb-4">
        {linkState.kind === "checking" || (isLoading && threads.length === 0 && suggested.length === 0) ? (
          <div className="px-3 pt-1"><SkeletonLedger rows={7} avatar={44} /></div>
        ) : error && threads.length === 0 ? (
          <div className="pt-6"><LoadFailure error={error} connectionProblem={connectionProblem} onRetry={() => void load()} /></div>
        ) : (
          <>
            {threads.length > 0 ? (
              <div className="flex flex-col">
                {threads.map((t) => (
                  <InboxRow key={t.row.id} thread={t} now={now} selected={t.row.id === selectedId} onRemove={() => remove(t)} onBlock={() => block(t)} />
                ))}
              </div>
            ) : null}

            {showSuggested ? (
              <div className="flex flex-col">
                <span className={clsx("px-4 t-kicker", threads.length === 0 ? "pt-2 pb-1.5" : "pt-4 pb-1.5")}>{threads.length === 0 ? "Start a conversation" : "People you follow"}</span>
                {suggested.map((u) => (
                  <button key={u.id} type="button" onClick={() => void open(u)} className="flex items-center gap-3 px-4 py-2.5 hairline-b hover:bg-surface/60 text-left transition-colors">
                    <InitialAvatar name={u.username} imageURL={u.avatarURL} size={44} />
                    <span className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <span className="t-body-md text-primary truncate">{u.username}</span>
                      <span className="t-label-sm text-muted">You follow</span>
                    </span>
                    <AssetIcon name="messages" height={18} />
                  </button>
                ))}
              </div>
            ) : null}

            {threads.length === 0 && suggested.length === 0 ? (
              <div className="pt-10">
                <EmptyState icon={<AssetIcon name="messages" height={30} />} title="No messages yet" subtitle="Follow people to see them here, or tap the compose icon." />
              </div>
            ) : null}
          </>
        )}
      </div>
      <Toast message={toast} />
    </div>
  );
}

/** Instagram's second line (InboxRow.secondLine). */
function secondLine(t: InboxThread, now: Date): { text: string; bold: boolean } {
  const when = t.row.lastMessageAt ?? t.row.createdAt ?? now.toISOString();
  const unread = threadUnread(t);
  if (unread > 1) return { text: `${unread} new messages`, bold: true };
  if (unread === 1) return { text: t.preview || "Sent you a message", bold: true };
  if (t.previewIsMine) return { text: (otherHasSeen(t) ? "Seen " : "Sent ") + relativeAgo(when, now), bold: false };
  return { text: t.preview || "Say hi", bold: false };
}

/** Their receipt for your newest message: the ledger's boundary or their server read stamp at/after it. */
function otherHasSeen(t: InboxThread): boolean {
  const newestId = t.newestId ?? t.row.lastMessage?.id ?? null;
  const newestAt = t.row.lastMessage?.createdAt ?? t.row.lastMessageAt;
  const seen = readLedger.otherSeenState(t.row.id);
  if (newestId && seen?.throughId === newestId) return true;
  if (newestAt) {
    const n = new Date(newestAt).getTime();
    if (seen?.at && new Date(seen.at).getTime() >= n) return true;
    if (t.row.otherLastReadAt && new Date(t.row.otherLastReadAt).getTime() >= n) return true;
  }
  return false;
}

function InboxRow({ thread, now, selected, onRemove, onBlock }: { thread: InboxThread; now: Date; selected: boolean; onRemove: () => void; onBlock: () => void }) {
  const line = secondLine(thread, now);
  const unread = threadUnread(thread);
  const when = thread.row.lastMessageAt ?? thread.row.createdAt;
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"remove" | "block" | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  return (
    <div className={clsx("relative group hairline-b", selected ? "bg-surface/60" : "hover:bg-surface/40", "transition-colors")}>
      <Link href={`/messages/${encodeURIComponent(thread.row.id)}`} className="flex items-center gap-3.5 pl-4 pr-14 py-2.5">
        <InitialAvatar name={thread.row.otherUsername} imageURL={thread.row.otherAvatarURL} size={48} />
        <span className="flex flex-col gap-1 min-w-0 flex-1">
          <span className={clsx("truncate text-primary", unread > 0 ? "t-label-lg" : "t-body-md")}>{thread.row.otherUsername}</span>
          <span className={clsx("truncate", line.bold ? "t-label-md text-primary" : "t-body-sm text-muted")}>{line.text}</span>
        </span>
        <span className="flex flex-col items-end gap-1.5 shrink-0">
          {when ? <span className={clsx("t-label-sm", unread > 0 ? "text-violet-light" : "text-muted")}>{relativeShort(when, now)}</span> : null}
          {/* Unread: the dot. The count lives in the line, as Instagram does it. */}
          <span className={clsx("size-2 rounded-full", unread > 0 ? "bg-violet" : "bg-transparent")} />
        </span>
      </Link>
      <span className="absolute right-2 top-1/2 -translate-y-1/2">
        <button
          type="button" aria-label="More" title="More"
          onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}
          className={clsx("grid place-items-center size-8 rounded-lg text-muted hover:text-primary hover:bg-card transition-opacity", menu ? "opacity-100" : "md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100")}
        >
          <Ellipsis size={18} />
        </button>
        {menu ? (
          <div className="absolute right-0 top-9 z-20 min-w-44 ledger py-1" role="menu">
            <MenuItem onClick={() => setConfirm("remove")} icon={<Trash2 size={15} />} className="text-primary">Remove chat</MenuItem>
            <MenuItem onClick={() => setConfirm("block")} icon={<Hand size={15} />} className="text-error">Block</MenuItem>
          </div>
        ) : null}
      </span>
      <ConfirmDialog
        open={confirm === "remove"} title="Remove chat?"
        message="This conversation leaves your inbox. A new message from either side brings it back."
        confirmTitle="Remove" onConfirm={() => { setConfirm(null); onRemove(); }} onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "block"} title={`Block @${thread.row.otherUsername}?`}
        message="They won't be able to message you, and this conversation leaves your inbox."
        confirmTitle="Block" destructive onConfirm={() => { setConfirm(null); onBlock(); }} onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

export function MenuItem({ onClick, icon, className, children }: { onClick: () => void; icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={clsx("flex items-center gap-2.5 w-full px-3 py-2.5 t-body-md hover:bg-surface/60 text-left whitespace-nowrap", className)}>
      {icon}{children}
    </button>
  );
}
