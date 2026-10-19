// MessageThread — MessageThreadView.swift: the person plainly in the
// header, messages as a quiet timeline (day chapters, runs, a "Seen"
// receipt under the last message of mine, typing dots), keyset paging
// upward, and the composer (photo / video attach when the server lists
// dm_media / dm_video, Enter sends, Shift+Enter breaks a line).
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronLeft, Ellipsis, Hand, ImagePlus, Play, Trash2, X } from "lucide-react";
import { useHideTabBar } from "@/components/shell/tab-bar";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { ConfirmDialog, EmptyState, InitialAvatar, SkeletonBar, Spinner, Toast } from "@/components/ui";
import { SkeletonBubbles, SkeletonCircle } from "@/components/ui/skeletons";
import { blockUser, conversation as fetchConversation, removeConversation, sendTyping } from "./service";
import { DMMediaError, prepareImage, prepareVideo, type PreparedMedia } from "./media";
import { emitRemovedLocal, forgetRow, knownRow, queueInboxToast, rememberRow } from "./dm-local";
import { dmsReadOnly, useMediaFeatures, useNow, usePageVisible } from "./hooks";
import { chapterStamp, durationClock } from "./format-dm";
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
  // The conversation's own silhouette while its row resolves: header person + bubbles.
  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-2 hairline-b shrink-0">
        <span className="size-8 md:hidden" />
        <SkeletonCircle size={30} />
        <SkeletonBar width={120} height={14} />
      </div>
      <div className="flex-1 min-h-0 px-4"><SkeletonBubbles /></div>
    </div>
  );
}

function ThreadView({ row }: { row: DMConversationRow }) {
  const router = useRouter();
  // MessageThreadView: `.toolbar(.hidden, for: .tabBar)` — the thread owns
  // the whole phone screen and the composer sits on the bottom edge.
  useHideTabBar();
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
  const { messages, loaded, canLoadMore, isLoadingMore, blockedState, sendError, clearSendError, otherIsTyping, receiptMessageId, seenLabel, loadMore, send, sendMedia, retry, unblock, startsRun, endsRun, showsTimeStamp, uploadStateFor, retryUpload } = vm;

  const [draft, setDraft] = useState("");
  // The picked photo/video, staged in the composer until Send (MessageThreadView.attachment).
  const [attachment, setAttachment] = useState<PreparedMedia | null>(null);
  const [preparing, setPreparing] = useState(false);
  const prepareGen = useRef(0);
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
  //    paging upward keeps the viewport where it was. Their message while
  //    you're reading older ones stays below the fold (Instagram) behind a
  //    "New messages" chip; yours always pins. ──────────────────────────────
  const list = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);
  const prepend = useRef<{ height: number; top: number } | null>(null);
  const atBottom = useRef(true);
  const [newBelow, setNewBelow] = useState(false);
  const measureAtBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const el = list.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottom.current = true;
    setNewBelow(false);
  }, []);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const count = messages.length;
    if (prepend.current) {
      el.scrollTop = el.scrollHeight - prepend.current.height + prepend.current.top;
      prepend.current = null;
    } else if (count !== prevCount.current) {
      const append = count > prevCount.current && prevCount.current > 0;
      const newestIsMine = messages[count - 1]?.isMine === true;
      if (append && !atBottom.current && !newestIsMine) setNewBelow(true);
      else scrollToBottom(append ? "smooth" : "auto");
    }
    prevCount.current = count;
  }, [messages, scrollToBottom]);
  useEffect(() => {
    if (!otherIsTyping || !atBottom.current) return;
    scrollToBottom("smooth");
  }, [otherIsTyping, scrollToBottom]);
  // The viewport shrinking (the attachment strip, the composer growing a
  // line) re-pins the newest message only when the bottom was in view.
  useEffect(() => {
    const el = list.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastH = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      if (h < lastH && atBottom.current) el.scrollTo({ top: el.scrollHeight });
      lastH = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const loadEarlier = useCallback(() => {
    const el = list.current;
    if (!el || isLoadingMore || !canLoadMore) return;
    prepend.current = { height: el.scrollHeight, top: el.scrollTop };
    void loadMore().finally(() => { if (prepend.current) prepend.current = null; });
  }, [canLoadMore, isLoadingMore, loadMore]);
  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    atBottom.current = measureAtBottom(el);
    if (atBottom.current && newBelow) setNewBelow(false);
    if (el.scrollTop < 40 && canLoadMore && !isLoadingMore) loadEarlier();
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
    const media = attachment;
    if (!text && !media) return;
    setDraft("");
    setAttachment(null);
    requestAnimationFrame(grow);
    // The picture first, the words under it — one task so they land in that order.
    void (async () => {
      if (media) await sendMedia(media);
      if (text) await send(text);
    })();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };
  /** A picked photo or video: prepared, then staged in the composer. Nothing leaves until Send. */
  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    if (isVideo && !features.video) { setToast("Couldn't send — Videos aren't available yet."); return; }
    const gen = ++prepareGen.current;
    setPreparing(true);
    setAttachment(null);
    try {
      const prepared = isVideo ? await prepareVideo(file) : await prepareImage(file);
      if (gen !== prepareGen.current) return;      // X'd while preparing
      setAttachment(prepared);
      textarea.current?.focus();
    } catch (err) {
      if (gen !== prepareGen.current) return;
      setToast(`Couldn't send — ${err instanceof DMMediaError ? err.message : "That file couldn't be sent."}`);
    } finally {
      if (gen === prepareGen.current) setPreparing(false);
    }
  };
  const discardAttachment = () => { prepareGen.current += 1; setPreparing(false); setAttachment(null); };

  const runMenuAction = async () => {
    const which = confirm;
    setConfirm(null);
    if (!which) return;
    emitRemovedLocal(row.id);
    forgetRow(row.id);
    if (which === "remove") await removeConversation(row.id); else await blockUser(row.otherId);
    router.replace("/messages");
  };

  const canSend = draft.trim().length > 0 || attachment !== null;
  const profileHref = `/profile/${encodeURIComponent(row.otherId)}`;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-bg">
      {/* Header: back · avatar · name — the person, plainly */}
      <div className="flex items-center gap-2.5 px-3 pt-1.5 pb-2 hairline-b shrink-0">
        <Link href="/messages" aria-label="Back" className="grid place-items-center size-8 text-primary hover:text-violet md:hidden"><ChevronLeft size={20} strokeWidth={2.5} /></Link>
        <Link href={profileHref} className="flex items-center gap-2.5 min-w-0 hover:opacity-80">
          <InitialAvatar name={row.otherUsername} imageURL={row.otherAvatarURL} size={30} />
          <span className="text-[17px] font-bold tracking-[-0.3px] text-primary truncate">{row.otherUsername}</span>
        </Link>
        <span className="flex-1" />
        <span className="relative hidden md:block">
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
          <SkeletonBubbles />
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
                    uploadState={m.media?.kind === "video" ? uploadStateFor(m.media.blobId) : null}
                    onRetryUpload={retryUpload}
                  />
                </div>
              );
            })}
            {otherIsTyping ? <div className="pt-1.5"><TypingBubble avatarURL={row.otherAvatarURL} initialsName={row.otherUsername} /></div> : null}
            <div className="h-1.5" />
          </div>
        )}
      </div>

      {/* Their message landed while you were reading older ones */}
      {newBelow ? (
        <div className="relative h-0 shrink-0">
          <button
            type="button" onClick={() => scrollToBottom("smooth")}
            className="absolute left-1/2 -translate-x-1/2 -top-11 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-violet text-white t-label-sm shadow-lg hover:brightness-110"
          >
            New messages<ArrowDown size={12} strokeWidth={2.5} />
          </button>
        </div>
      ) : null}

      {/* Blocked state, read-only switch, or composer */}
      <div className="shrink-0 hairline-t bg-bg pb-[max(8px,env(safe-area-inset-bottom))] md:pb-2">
        {readOnly.readOnly ? (
          <div className="px-4 py-3 text-center t-body-sm text-muted">{readOnly.message ?? "Messaging is temporarily read-only."}</div>
        ) : blockedState ? (
          <div className="flex flex-col items-center gap-2 px-4 py-3">
            <span className="t-body-sm text-muted text-center">{blockedState.text}</span>
            {blockedState.offersUnblock ? <button type="button" onClick={() => void unblock()} className="t-label-md text-violet hover:underline">Unblock</button> : null}
          </div>
        ) : (
          <div className="px-4 pt-2.5">
            {preparing || attachment ? (
              // The picked photo/video in the composer: a thumbnail with an X, the video's length on it.
              <div className="flex items-start pb-2.5 max-w-[860px]">
                <div className="relative size-[84px] shrink-0">
                  <div className="size-[84px] rounded-[12px] overflow-hidden border border-border-subtle bg-surface">
                    {attachment ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={attachment.previewURL} alt="" className="w-full h-full object-cover" draggable={false} />
                    ) : (
                      <span className="block w-full h-full animate-pulse bg-surface" />
                    )}
                  </div>
                  {preparing ? (
                    <span className="absolute inset-0 grid place-items-center"><Spinner size={18} className="border-white/40 border-t-white" /></span>
                  ) : attachment?.kind === "video" ? (
                    <span className="absolute left-[5px] bottom-[5px] flex items-center gap-[3px] px-1.5 py-[3px] rounded-full bg-black/60 text-white">
                      <Play size={8} className="fill-white" strokeWidth={3} />
                      <span className="t-mono-sm !text-[10px] !font-semibold">{durationClock(attachment.duration ?? 0)}</span>
                    </span>
                  ) : null}
                  <button
                    type="button" onClick={discardAttachment} aria-label="Remove attachment" title="Remove"
                    className="absolute -top-1.5 -right-1.5 grid place-items-center size-[22px] rounded-full bg-black/70 text-white border border-white/35 hover:bg-black"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                </div>
              </div>
            ) : null}
            <div className={clsx("flex items-end gap-2 rounded-[22px] bg-surface border border-border-subtle py-[5px] pr-[5px] max-w-[860px]", features.media ? "pl-[5px]" : "pl-4")}>
              {features.media ? (
                <>
                  <input ref={fileInput} type="file" accept={features.video ? "image/*,video/mp4,video/quicktime" : "image/*"} className="hidden" onChange={(e) => void onPick(e)} />
                  <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach a photo" title="Attach a photo" className="grid place-items-center size-[34px] shrink-0 text-violet hover:text-violet-light"><ImagePlus size={18} /></button>
                </>
              ) : null}
              <textarea
                ref={textarea}
                value={draft}
                onChange={onDraft}
                onKeyDown={onKey}
                placeholder="Message…"
                rows={1}
                className="flex-1 min-w-0 resize-none bg-transparent outline-none t-body-md text-white placeholder:text-muted py-[7px] min-h-[34px] max-h-[120px] leading-[20px]"
              />
              <button type="button" onClick={submit} aria-label="Send" title="Send" disabled={!canSend} className={clsx("grid place-items-center size-[34px] shrink-0 rounded-full bg-violet text-white transition-opacity duration-150", canSend ? "opacity-100 hover:brightness-110" : "opacity-0 pointer-events-none")}>
                <ArrowUp size={15} strokeWidth={3} />
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
