// MessageThread — MessageThreadView.swift: the person plainly in the
// header, messages as a quiet timeline (day chapters, runs, a "Seen"
// receipt under the last message of mine, typing dots), keyset paging
// upward, and the composer (photo / video attach when the server lists
// dm_media / dm_video, Enter sends, Shift+Enter breaks a line).
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Ellipsis, Hand, ImagePlus, Send, Trash2 } from "lucide-react";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { ConfirmDialog, EmptyState, InitialAvatar, Spinner, Toast } from "@/components/ui";
import { blockUser, conversation as fetchConversation, removeConversation, sendTyping } from "./service";
import { DMMediaError, prepareImage, prepareVideo } from "./media";
import { emitRemovedLocal, forgetRow, knownRow, queueInboxToast, rememberRow } from "./dm-local";
import { dmsReadOnly, useMediaFeatures, useNow, usePageVisible } from "./hooks";
import { chapterStamp } from "./format-dm";
import { useThread } from "./use-thread";
import { MediaViewer, MessageBubble, TypingBubble } from "./bubbles";
import { MenuItem } from "./MessagesInbox";
import type { DMConversationRow, DMMessage } from "./types";

/** DMThreadLoaderView: the row by id (what the inbox already holds, else the list). */
export function MessageThread({ conversationId }: { conversationId: string }) {
  const [row, setRow] = useState<DMConversationRow | null>(() => knownRow(conversationId));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (row) return;
    let active = true;
    void fetchConversation(conversationId).then((r) => {
      if (!active) return;
      if (r) { rememberRow(r); setRow(r); } else setFailed(true);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [conversationId, row]);

  if (row) return <ThreadView row={row} />;
  if (failed) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-2 hairline-b md:hidden">
          <Link href="/messages" aria-label="Back" className="grid place-items-center size-8 text-primary hover:text-violet"><ChevronLeft size={20} /></Link>
        </div>
        <div className="pt-10">
          <EmptyState title="Conversation not found" subtitle="This conversation isn't available" />
          <div className="flex justify-center pt-4"><Link href="/messages" className="t-label-md text-violet hover:underline">Back to Messages</Link></div>
        </div>
      </div>
    );
  }
  return <div className="flex-1 grid place-items-center"><Spinner /></div>;
}

function ThreadView({ row }: { row: DMConversationRow }) {
  const router = useRouter();
  const { status } = useAppState();
  const visible = usePageVisible();
  const now = useNow(60_000);
  const features = useMediaFeatures();
  const readOnly = dmsReadOnly(status);

  const onRemoved = useCallback(() => {
    forgetRow(row.id);
    queueInboxToast("Conversation removed");
    router.replace("/messages");
  }, [router, row.id]);

  const vm = useThread(row, visible, onRemoved);
  const { messages, loaded, canLoadMore, isLoadingMore, blockedState, sendError, clearSendError, otherIsTyping, receiptMessageId, seenLabel, loadMore, send, sendMedia, retry, unblock, startsRun, endsRun, showsTimeStamp } = vm;

  const [draft, setDraft] = useState("");
  const [revealedTimeId, setRevealedTimeId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DMMessage | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"remove" | "block" | null>(null);
  const lastTypingSent = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const shownToast = toast ?? (sendError ? `Couldn't send — ${sendError}` : null);
  useEffect(() => { if (!shownToast) return; const t = setTimeout(() => { setToast(null); clearSendError(); }, 3500); return () => clearTimeout(t); }, [shownToast, clearSendError]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [menu]);

  // ── Scrolling: bottom-anchored; a single append animates, loads jump;
  //    paging upward keeps the viewport where it was. ─────────────────────
  const list = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const count = messages.length;
    if (prepend.current) {
      el.scrollTop = el.scrollHeight - prepend.current.height + prepend.current.top;
      prepend.current = null;
    } else if (count !== prevCount.current) {
      const animated = count === prevCount.current + 1 && prevCount.current > 0;
      el.scrollTo({ top: el.scrollHeight, behavior: animated ? "smooth" : "auto" });
    }
    prevCount.current = count;
  }, [messages]);
  useEffect(() => {
    if (!otherIsTyping || !list.current) return;
    list.current.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [otherIsTyping]);

  const loadEarlier = useCallback(() => {
    const el = list.current;
    if (!el || isLoadingMore || !canLoadMore) return;
    prepend.current = { height: el.scrollHeight, top: el.scrollTop };
    void loadMore().finally(() => { if (prepend.current) prepend.current = null; });
  }, [canLoadMore, isLoadingMore, loadMore]);
  const onScroll = () => {
    const el = list.current;
    if (el && el.scrollTop < 40 && canLoadMore && !isLoadingMore) loadEarlier();
  };

  // ── Composer ───────────────────────────────────────────────────────────
  const grow = () => {
    const t = textarea.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
  };
  const onDraft = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setDraft(text);
    grow();
    if (text && Date.now() - lastTypingSent.current > 2000) { lastTypingSent.current = Date.now(); sendTyping(row.id); }
  };
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    requestAnimationFrame(grow);
    void send(text);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };
  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    try {
      if (isVideo) {
        if (!features.video) { setToast("Couldn't send — Videos aren't available yet."); return; }
        await sendMedia(await prepareVideo(file));
      } else {
        await sendMedia(await prepareImage(file));
      }
    } catch (err) {
      setToast(`Couldn't send — ${err instanceof DMMediaError ? err.message : "That file couldn't be sent."}`);
    }
  };

  const runMenuAction = async () => {
    const which = confirm;
    setConfirm(null);
    if (!which) return;
    emitRemovedLocal(row.id);
    forgetRow(row.id);
    if (which === "remove") await removeConversation(row.id); else await blockUser(row.otherId);
    router.replace("/messages");
  };

  const canSend = draft.trim().length > 0;
  const profileHref = `/profile/${encodeURIComponent(row.otherId)}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      {/* Header: back · avatar · name — the person, plainly */}
      <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-2 hairline-b shrink-0">
        <Link href="/messages" aria-label="Back" className="grid place-items-center size-8 text-primary hover:text-violet md:hidden"><ChevronLeft size={20} /></Link>
        <Link href={profileHref} className="flex items-center gap-2.5 min-w-0 hover:opacity-80">
          <InitialAvatar name={row.otherUsername} imageURL={row.otherAvatarURL} size={30} />
          <span className="text-[17px] font-bold tracking-[-0.3px] text-primary truncate">{row.otherUsername}</span>
        </Link>
        <span className="flex-1" />
        <span className="relative">
          <button type="button" aria-label="More" title="More" onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }} className="grid place-items-center size-8 rounded-lg text-secondary hover:text-primary hover:bg-card"><Ellipsis size={18} /></button>
          {menu ? (
            <div className="absolute right-0 top-9 z-20 min-w-44 ledger py-1" role="menu">
              <MenuItem onClick={() => setConfirm("remove")} icon={<Trash2 size={15} />} className="text-primary">Remove chat</MenuItem>
              <MenuItem onClick={() => setConfirm("block")} icon={<Hand size={15} />} className="text-error">Block</MenuItem>
            </div>
          ) : null}
        </span>
      </div>

      {/* Messages */}
      <div ref={list} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-1.5">
        {!loaded && messages.length === 0 ? (
          <div className="h-full grid place-items-center"><Spinner /></div>
        ) : (
          <div className="flex flex-col gap-0.5 max-w-[860px]">
            {canLoadMore ? (
              <button type="button" onClick={loadEarlier} className="self-center t-label-sm text-muted py-2.5 hover:text-primary">{isLoadingMore ? "Loading…" : "Load earlier"}</button>
            ) : null}
            {messages.map((m, i) => {
              const stamp = showsTimeStamp(i);
              const starts = startsRun(i);
              return (
                <div key={m.id} className={clsx(starts && !stamp && "pt-2")}>
                  {stamp ? (
                    <div className="text-center py-3 text-[10px] font-semibold tracking-[1.2px] text-muted">{chapterStamp(m.createdAt, now)}</div>
                  ) : null}
                  <MessageBubble
                    message={m}
                    seenLabel={m.id === receiptMessageId ? seenLabel(m) : null}
                    endsRun={endsRun(i)}
                    avatarURL={row.otherAvatarURL}
                    initialsName={row.otherUsername}
                    showTime={revealedTimeId === m.id}
                    onToggleTime={() => setRevealedTimeId((cur) => (cur === m.id ? null : m.id))}
                    onOpenMedia={setViewing}
                    onRetry={(id) => void retry(id)}
                  />
                </div>
              );
            })}
            {otherIsTyping ? <div className="pt-1.5"><TypingBubble avatarURL={row.otherAvatarURL} initialsName={row.otherUsername} /></div> : null}
            <div className="h-1.5" />
          </div>
        )}
      </div>

      {/* Blocked state, read-only switch, or composer */}
      <div className="shrink-0 hairline-t bg-bg pb-[calc(var(--tabbar-h)+8px)] md:pb-2">
        {readOnly.readOnly ? (
          <div className="px-4 py-3 text-center t-body-sm text-muted">{readOnly.message ?? "Messaging is temporarily read-only."}</div>
        ) : blockedState ? (
          <div className="flex flex-col items-center gap-2 px-4 py-3">
            <span className="t-body-sm text-muted text-center">{blockedState.text}</span>
            {blockedState.offersUnblock ? <button type="button" onClick={() => void unblock()} className="t-label-md text-violet hover:underline">Unblock</button> : null}
          </div>
        ) : (
          <div className="px-4 pt-2.5">
            <div className={clsx("flex items-end gap-2 rounded-[22px] bg-surface border border-border-subtle py-1.5 pr-1.5 max-w-[860px]", features.media ? "pl-2" : "pl-4")}>
              {features.media ? (
                <>
                  <input ref={fileInput} type="file" accept={features.video ? "image/*,video/mp4,video/quicktime" : "image/*"} className="hidden" onChange={(e) => void onPick(e)} />
                  <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach a photo" title="Attach a photo" className="grid place-items-center size-[30px] shrink-0 text-violet hover:text-violet-light mb-px"><ImagePlus size={18} /></button>
                </>
              ) : null}
              <textarea
                ref={textarea}
                value={draft}
                onChange={onDraft}
                onKeyDown={onKey}
                placeholder="Message…"
                rows={1}
                className="flex-1 min-w-0 resize-none bg-transparent outline-none t-body-md text-white placeholder:text-muted py-[5px] max-h-[120px] leading-[1.4]"
              />
              <button type="button" onClick={submit} aria-label="Send" title="Send" disabled={!canSend} className={clsx("grid place-items-center size-[30px] shrink-0 rounded-full bg-violet text-white transition-opacity", canSend ? "opacity-100 hover:brightness-110" : "opacity-0 pointer-events-none")}>
                <Send size={14} strokeWidth={2.5} className="-ml-px" />
              </button>
            </div>
          </div>
        )}
      </div>

      {viewing ? <MediaViewer message={viewing} onClose={() => setViewing(null)} /> : null}
      <ConfirmDialog
        open={confirm === "remove"} title="Remove chat?"
        message="This conversation leaves your inbox. A new message from either side brings it back."
        confirmTitle="Remove" onConfirm={() => void runMenuAction()} onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "block"} title={`Block @${row.otherUsername}?`}
        message="They won't be able to message you, and this conversation leaves your inbox."
        confirmTitle="Block" destructive onConfirm={() => void runMenuAction()} onCancel={() => setConfirm(null)}
      />
      <Toast message={shownToast} kind="error" />
    </div>
  );
}
