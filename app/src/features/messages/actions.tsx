// messages/actions.tsx — what you can do with a message, Instagram's way
// (MessageActions.swift):
//
//   • MessageActionSheet — the dimmed sheet over the thread: a row of
//     reactions (❤️ 😂 😮 😢 😡 👍, then "+" for any emoji), the held bubble,
//     then the actions. It rises out of the bubble that was held and sinks
//     back into it. Opened by a right-click, a long press on touch, the
//     hover "⋯", or Shift+F10; a double-click is ❤️.
//   • ReactionChips — "❤️ 2" on the bubble's inner bottom corner, yours
//     ringed violet; click to toggle. Chips pop in and out, counts roll.
//   • ReplyQuote — over a reply: "You replied" / "Replied to you" (a group
//     names who), then the quoted words on a violet bar; click to jump.
//   • ReplyComposerBar — "Replying to @name" over the composer.
//   • PinnedBar — the pins, one at a time: a click jumps and shows the next.
//   • ForwardPicker — your chats under CHATS and, after two letters, people
//     you haven't messaged under NEW CHAT (the chat is made on Send).
//   • DMReportSheet — the reason; the reporter's decrypted words go with it.
//
// Privacy: replies, forwards and reactions travel inside the ciphertext;
// the server stores who reacted and what's pinned, never what was said.
"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Copy, CornerUpLeft, Forward, MessageSquareWarning, Pencil, Pin, PinOff, Plus, Trash2, Undo2, X } from "lucide-react";
import { api, ApiError, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { type Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { Sheet, Spinner } from "@/components/ui";
import { FlairAvatar, FlairName, type FlairUser } from "@/components/ui/premium-flair";
import { Portal } from "@/features/moderation/ActionMenu";
import { MESSAGE_REASONS, ReportSheet } from "@/features/moderation/ReportSheet";
import { blockUser, BLOCK_FAILED } from "@/features/moderation/blocked";
import { useBlockedIds, useIsBlocked } from "@/features/moderation/use-blocked";
import { conversations, createConversation, DMUserError, forward as forwardOnServer, reportMessage } from "./service";
import { isGroupRow, myReaction, normalizeSearchUser, otherFlair, type DMConversationRow, type DMMessage, type DMQuote, type DMReaction, type SearchUser } from "./types";

/** The six on the bar, then "+" for any other emoji. */
export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"] as const;

/** What the sheet can do with the message it holds. null = not offered. */
export interface MessageActionSet {
  react: ((emoji: string | null) => void) | null;
  reply: () => void;
  forward: (() => void) | null;
  copy: (() => void) | null;
  /** Toggles. */
  pin: (() => void) | null;
  isPinned: boolean;
  edit: (() => void) | null;
  /** Yours: unsend, for everyone. */
  unsend: (() => void) | null;
  /** Delete for you, either side. */
  hide: (() => void) | null;
  report: (() => void) | null;
}

/** "WED 11:33 PM" */
function stamp(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} ${t}`.toUpperCase();
}

// ── Any emoji ─────────────────────────────────────────────────────────────
const MORE_EMOJI = [
  "🔥", "💯", "👏", "🙌", "🤝", "💪", "🎉", "🏆", "👀", "🤯", "🥲", "😭", "😅", "🤣", "😍", "🥰", "😎", "🤔", "🙃", "😬", "🫡", "🤡", "💀", "🙏",
  "👎", "✅", "❌", "⚡", "💥", "🎯", "🎮", "🕹️", "🥶", "🥵", "😤", "😱", "🤩", "😴", "🤷", "🫠", "💜", "💔", "⭐", "🍿", "🐐", "🧠", "👑", "🚀",
];
const isEmoji = (s: string) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  return (
    <div className="ledger p-2.5 w-[300px] max-w-[calc(100vw-32px)] flex flex-col gap-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2">
        <input
          autoFocus value={typed} placeholder="Type or paste any emoji" aria-label="Any emoji"
          onChange={(e) => {
            const v = e.target.value;
            setTyped(v);
            // The first emoji typed comes back (the emoji keyboard's way).
            const seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
            const parts = seg ? Array.from(new seg(undefined, { granularity: "grapheme" }).segment(v), (x) => x.segment) : Array.from(v);
            const hit = parts.find(isEmoji);
            if (hit) onPick(hit);
          }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle t-body-sm text-primary outline-none focus:border-violet"
        />
        <button type="button" onClick={onClose} aria-label="Close" className="grid place-items-center size-7 rounded-md text-muted hover:text-primary"><X size={14} /></button>
      </div>
      <div className="grid grid-cols-8 gap-0.5">
        {MORE_EMOJI.map((e) => (
          <button key={e} type="button" onClick={() => onPick(e)} className="grid place-items-center size-8 rounded-lg text-[20px] hover:bg-surface">{e}</button>
        ))}
      </div>
    </div>
  );
}

// ── The sheet ─────────────────────────────────────────────────────────────
export function MessageActionSheet({ message, originSelector, actions, bubble, onClose }: {
  message: DMMessage;
  /** The held bubble on screen: the sheet rises from its frame. */
  originSelector: string;
  actions: MessageActionSet;
  /** The bubble, drawn again, lifted. */
  bubble: ReactNode;
  onClose: () => void;
}) {
  const mine = message.isMine;
  const column = useRef<HTMLDivElement>(null);
  const bubbleBox = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ top: number; rise: number; x: number } | null>(null);
  const [appeared, setAppeared] = useState(false);
  const [closing, setClosing] = useState(false);
  const [picking, setPicking] = useState(false);
  const current = myReaction(message);

  // Where the column sits: the lifted bubble over the original when it fits, kept on screen.
  useLayoutEffect(() => {
    const col = column.current, b = bubbleBox.current;
    if (!col || !b) return;
    const origin = document.querySelector(originSelector)?.getBoundingClientRect() ?? null;
    const h = col.offsetHeight, vh = window.innerHeight;
    const bubbleTop = b.offsetTop;
    let t = origin ? origin.top - bubbleTop : (vh - h) / 2;
    t = Math.max(12, Math.min(t, vh - h - 12));
    const x = origin ? (mine ? Math.max(16, window.innerWidth - origin.right) : Math.max(16, origin.left)) : 16;
    setLayout({ top: t, rise: origin ? origin.top - (t + bubbleTop) : 0, x });
    const raf = requestAnimationFrame(() => setAppeared(true));
    return () => cancelAnimationFrame(raf);
  }, [mine, originSelector]);

  const close = () => {
    if (closing) return;
    setClosing(true);
    setAppeared(false);
    setTimeout(onClose, 200);
  };
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = prev; };
  }, []);

  /** Every action closes the sheet first, then runs. */
  const run = (fn: () => void) => () => { close(); fn(); };
  const pickReaction = (e: string | null) => { if (actions.react) { actions.react(e); } close(); };

  const item = (key: string, title: string, icon: ReactNode, fn: (() => void) | null, tint = "text-primary") => fn ? (
    <button key={key} type="button" role="menuitem" onClick={run(fn)} className={clsx("flex items-center gap-3.5 w-full px-4 py-3 text-left hover:bg-surface/60 transition-colors", tint)}>
      <span className="w-6 grid place-items-center">{icon}</span>
      <span className="t-body-md">{title}</span>
    </button>
  ) : null;

  const anchorX = layout?.x ?? 16;
  const rise = layout?.rise ?? 0;

  return (
    <Portal>
      <div className="fixed inset-0 z-[75]" role="dialog" aria-modal aria-label="Message actions">
        <div
          className={clsx("absolute inset-0 bg-black/40 backdrop-blur-md transition-opacity duration-200", appeared ? "opacity-100" : "opacity-0")}
          onClick={close}
          onContextMenu={(e) => { e.preventDefault(); close(); }}
        />
        <div
          ref={column}
          className={clsx("absolute flex flex-col gap-2.5 max-w-[calc(100vw-32px)]", mine ? "items-end" : "items-start")}
          style={{
            top: layout?.top ?? -9999, ...(mine ? { right: anchorX } : { left: anchorX }),
            transform: appeared ? "none" : `translateY(${rise}px) scale(0.92)`,
            transformOrigin: mine ? "right center" : "left center",
            opacity: appeared ? 1 : 0,
            transition: appeared ? "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out" : "transform 200ms ease-in, opacity 200ms ease-in",
          }}
        >
          {actions.react ? (
            <div className="relative">
              <div className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-card border border-border-subtle shadow-xl">
                {QUICK_REACTIONS.map((e) => {
                  const on = current === e;
                  return (
                    <button key={e} type="button" aria-label={`React ${e}`} aria-pressed={on} onClick={() => pickReaction(on ? null : e)} className={clsx("relative grid place-items-center size-10 rounded-full text-[26px] leading-none transition-transform hover:scale-110", on && "bg-violet/[0.28]")}>
                      {e}
                      {on ? <span className="absolute bottom-[1px] size-1 rounded-full bg-violet" /> : null}
                    </button>
                  );
                })}
                <button type="button" aria-label="Any emoji" onClick={() => setPicking((p) => !p)} className="grid place-items-center size-10 rounded-full text-primary hover:bg-surface"><Plus size={18} strokeWidth={2.5} /></button>
              </div>
              {picking ? (
                <div className={clsx("absolute top-full mt-2 z-10", mine ? "right-0" : "left-0")}>
                  <EmojiPicker onPick={(e) => pickReaction(e)} onClose={() => setPicking(false)} />
                </div>
              ) : null}
            </div>
          ) : null}
          <div ref={bubbleBox} className={clsx("max-w-[300px] pointer-events-none", mine ? "self-end" : "self-start")}>{bubble}</div>
          <div className="w-[236px] max-w-full rounded-2xl bg-card border border-border-subtle shadow-2xl overflow-hidden pb-1.5" role="menu">
            <div className="px-4 pt-3 pb-0.5 text-[11px] font-semibold tracking-[1px] text-muted">{stamp(message.createdAt)}</div>
            {item("reply", "Reply", <CornerUpLeft size={17} />, actions.reply)}
            {item("forward", "Forward", <Forward size={17} />, actions.forward)}
            {item("copy", "Copy", <Copy size={17} />, actions.copy)}
            {item("pin", actions.isPinned ? "Unpin" : "Pin", actions.isPinned ? <PinOff size={17} /> : <Pin size={17} />, actions.pin)}
            {item("edit", "Edit", <Pencil size={17} />, actions.edit)}
            {item("hide", "Delete for you", <Trash2 size={17} />, actions.hide)}
            {item("unsend", "Unsend", <Undo2 size={17} />, actions.unsend, "text-live")}
            {item("report", "Report", <MessageSquareWarning size={17} />, actions.report, "text-live")}
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ── Under a bubble ────────────────────────────────────────────────────────
/** Everyone's reactions on a message: "❤️" or "❤️ 2". Click one to add yours or take it back; yours is ringed violet. */
export function ReactionChips({ reactions, onTap, align }: { reactions: DMReaction[]; onTap: (emoji: string) => void; align: "left" | "right" }) {
  const order: string[] = [];
  const count = new Map<string, number>();
  const mine = new Set<string>();
  for (const r of reactions) {
    if (!count.has(r.emoji)) order.push(r.emoji);
    count.set(r.emoji, (count.get(r.emoji) ?? 0) + 1);
    if (r.isMine) mine.add(r.emoji);
  }
  if (!order.length) return null;
  return (
    <span className={clsx("absolute -bottom-[11px] z-[1] flex gap-1", align === "left" ? "left-1.5" : "right-1.5")}>
      {order.map((e) => {
        const n = count.get(e) ?? 0;
        return (
          <button
            key={e} type="button" onClick={(ev) => { ev.stopPropagation(); onTap(e); }}
            aria-label={`${e} ${n}${mine.has(e) ? ", yours" : ""}`}
            className={clsx("dm-chip-pop flex items-center gap-[3px] px-[7px] py-[3px] rounded-full bg-card border leading-none", mine.has(e) ? "border-violet" : "border-border-subtle")}
          >
            <span className="text-[13px]">{e}</span>
            {n > 1 ? <span key={n} className="dm-count-roll text-[11px] font-semibold text-secondary tabular-nums">{n}</span> : null}
          </button>
        );
      })}
    </span>
  );
}

/** The message a reply answers, over the reply. Whole sentences, so each reads as one. */
export function replyCaption(quote: DMQuote, isMine: boolean, me: string, replierName: string | null, quotedName: string | null): string {
  const quoteByMe = quote.senderId === me;
  if (isMine) {
    if (quoteByMe) return "You replied to yourself";
    return quotedName ? `You replied to ${quotedName}` : "You replied";
  }
  if (replierName) {
    if (quoteByMe) return `${replierName} replied to you`;
    return quotedName ? `${replierName} replied to ${quotedName}` : `${replierName} replied`;
  }
  return quoteByMe ? "Replied to you" : "Replied to themselves";
}

export function ReplyQuote({ quote, isMine, me, replierName, quotedName, onTap, inset }: { quote: DMQuote; isMine: boolean; me: string; replierName: string | null; quotedName: string | null; onTap: () => void; inset: number }) {
  return (
    <div className={clsx("flex flex-col gap-1 pt-1 max-w-[260px]", isMine ? "items-end self-end" : "items-start")} style={isMine ? undefined : { marginLeft: inset }}>
      <span className="t-label-sm text-muted">{replyCaption(quote, isMine, me, replierName, quotedName)}</span>
      <button type="button" onClick={onTap} className="flex items-stretch max-w-full rounded-xl overflow-hidden bg-surface/60 text-left hover:bg-surface transition-colors">
        <span className="w-[3px] bg-violet shrink-0" />
        <span className="px-2.5 py-[7px] t-body-sm text-secondary line-clamp-2 break-words">{quote.text}</span>
      </button>
    </div>
  );
}

/** "Replying to @name" and the words, with a way out — the edit bar's shape. */
export function ReplyComposerBar({ quote, name, onCancel }: { quote: DMQuote; name: string; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-2.5 pb-2 max-w-[860px]">
      <span className="w-[3px] h-[30px] rounded-full bg-violet shrink-0" />
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="t-label-sm text-secondary">Replying to {name}</span>
        <span className="t-body-sm text-muted truncate">{quote.text}</span>
      </span>
      <button type="button" onClick={onCancel} aria-label="Cancel reply" className="grid place-items-center size-7 rounded text-muted hover:text-primary"><X size={15} /></button>
    </div>
  );
}

// ── Top of the thread ─────────────────────────────────────────────────────
/** The pinned messages, one at a time: a click jumps to it and shows the next. */
export function PinnedBar({ pins, onOpen }: { pins: DMMessage[]; onOpen: (m: DMMessage) => void }) {
  const [index, setIndex] = useState(0);
  if (!pins.length) return null;
  const i = index % pins.length;
  const m = pins[i];
  return (
    <button type="button" onClick={() => { onOpen(m); setIndex(i + 1); }} className="flex items-center gap-2.5 w-full px-4 py-2 bg-surface hairline-b text-left hover:brightness-110 shrink-0">
      <Pin size={12} strokeWidth={2.5} className="text-violet fill-violet shrink-0" />
      <span className="flex flex-col gap-px min-w-0 flex-1">
        <span className="t-label-sm text-violet">{pins.length > 1 ? `Pinned · ${i + 1} of ${pins.length}` : "Pinned"}</span>
        <span className="t-body-sm text-primary truncate">{m.text}</span>
      </span>
    </button>
  );
}

// ── Forward ───────────────────────────────────────────────────────────────
/** Pick a chat to send the message on to, or search for someone you haven't
 *  messaged yet (the chat is made on the spot). Each row sends once; a sent row reads "Sent". */
export function ForwardPicker({ message, fromConversationId, onClose }: { message: DMMessage; fromConversationId: string; onClose: () => void }) {
  const { user } = useAppState();
  const me = user?.id ?? null;
  const [rows, setRows] = useState<DMConversationRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<SearchUser[]>([]);
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const seq = useRef(0);
  const blockedIds = useBlockedIds();
  const term = query.trim().toLowerCase();

  useEffect(() => {
    let active = true;
    void conversations().then((r) => { if (active) { setRows(r); setLoaded(true); } }, () => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  // People, a beat after typing stops (two letters or more).
  useEffect(() => {
    const s = ++seq.current;
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      try {
        const raw = await api.get<{ users?: Json[] }>(endpoints.search(term));
        if (s !== seq.current) return;
        setPeople((Array.isArray(raw?.users) ? raw.users : []).map(normalizeSearchUser).filter((u): u is SearchUser => u !== null && u.id !== me));
      } catch { if (s === seq.current) setPeople([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [me, term]);

  // Direct chats you can seal to (a group has no other person's key: iOS lists chats with one).
  const list = rows.filter((r) => r.id !== fromConversationId && !isGroupRow(r) && r.otherPublicKey && !blockedIds.has(r.otherId));
  const shown = term ? list.filter((r) => r.otherUsername.toLowerCase().includes(term)) : list;
  const known = new Set(rows.map((r) => r.otherId));
  const newPeople = term.length >= 2 ? people.filter((u) => !known.has(u.id) && !blockedIds.has(u.id)) : [];

  const sendTo = async (key: string, run: () => Promise<void>) => {
    if (sending.has(key) || sent.has(key)) return;
    setSending((s) => new Set(s).add(key));
    try {
      await run();
      setSent((s) => new Set(s).add(key));
    } catch (e) {
      setFailed(e instanceof DMUserError ? e.message : e instanceof ApiError ? e.message : "Check your connection and try again.");
    } finally {
      setSending((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const sendButton = (key: string, run: () => Promise<void>) => sent.has(key) ? (
    <span className="w-16 text-center t-label-md text-muted">Sent</span>
  ) : (
    <button type="button" onClick={() => void sendTo(key, run)} className="grid place-items-center w-16 h-8 rounded-full bg-violet text-white t-label-md hover:brightness-110 shrink-0">
      {sending.has(key) ? <Spinner size={14} className="border-white/40 border-t-white" /> : "Send"}
    </button>
  );

  const row = (who: FlairUser, key: string, run: () => Promise<void>) => (
    <div key={key} className="flex items-center gap-3 px-1 py-2">
      <FlairAvatar user={who} size={44} />
      <span className="flex-1 min-w-0"><FlairName user={who} className="t-body-md" /></span>
      {sendButton(key, run)}
    </div>
  );

  return (
    <Portal>
      <Sheet open onClose={onClose} title="Forward" trailing={<button type="button" onClick={onClose} className="t-label-md text-violet hover:underline">Done</button>}>
        <div className="flex flex-col gap-2 min-h-[300px]">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted shrink-0" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="flex-1 min-w-0 bg-transparent outline-none t-body-md text-primary placeholder:text-muted" />
          </div>
          {!loaded ? (
            <div className="grid place-items-center pt-10"><Spinner size={18} /></div>
          ) : shown.length === 0 && newPeople.length === 0 ? (
            <div className="pt-10 px-6 text-center t-body-sm text-muted">{!term ? "No chats yet. Search for someone to start one." : term.length < 2 ? "Keep typing to search people." : "No one by that name."}</div>
          ) : null}
          {shown.length > 0 && newPeople.length > 0 ? <span className="t-label-sm text-muted pt-2">CHATS</span> : null}
          {shown.map((r) => row(otherFlair(r), r.otherId, () => forwardOnServer(message, r)))}
          {newPeople.length ? (
            <>
              <span className="t-label-sm text-muted pt-2">NEW CHAT</span>
              {newPeople.map((u) => row(u.flair ?? { id: u.id, username: u.username, avatarURL: u.avatarURL, isPremium: false, premiumStyle: null }, u.id, async () => {
                const r = await createConversation(u.id);
                await forwardOnServer(message, r);
                setRows((cur) => [...cur, r]);
              }))}
            </>
          ) : null}
        </div>
      </Sheet>
      {failed ? (
        <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="alertdialog" aria-modal>
          <div className="absolute inset-0 bg-black/60" onClick={() => setFailed(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-card border border-hairline p-5 flex flex-col gap-3">
            <span className="t-headline-sm text-primary">Couldn&apos;t send</span>
            <span className="t-body-sm text-secondary">{failed}</span>
            <div className="flex justify-end"><button type="button" onClick={() => setFailed(null)} className="btn-pill !py-2">OK</button></div>
          </div>
        </div>
      ) : null}
    </Portal>
  );
}

// ── Report ────────────────────────────────────────────────────────────────
/** A DM message: this message (its decrypted words go with the reason) or the
 *  person's profile (the shared profile report). POST …/report {reason, text}. */
export function DMReportSheet({ conversationId, message, user, onClose }: { conversationId: string; message: DMMessage; user: FlairUser & { id: string }; onClose: () => void }) {
  const [step, setStep] = useState<"choose" | "reason" | "sent" | "profile">("choose");
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blockState, setBlockState] = useState<"idle" | "blocking" | "blocked" | "failed">("idle");
  const alreadyBlocked = useIsBlocked(user.id);
  const text = message.linkURL ?? (message.media ? (message.media.kind === "image" ? "Photo" : "Video") : message.text);

  if (step === "profile") {
    return <ReportSheet target={{ kind: "profile", user }} onClose={() => onClose()} />;
  }
  const send = async (reason: string) => {
    if (sending) return;
    setSending(reason);
    setError(null);
    try {
      await reportMessage(conversationId, message.id, reason, text);
      setStep("sent");
    } catch {
      setError("Couldn't send the report. Check your connection and try again.");
    } finally {
      setSending(null);
    }
  };
  const block = async () => {
    if (blockState === "blocking") return;
    setBlockState("blocking");
    try { await blockUser(user.id); setBlockState("blocked"); } catch { setBlockState("failed"); }
  };
  const isBlockedNow = blockState === "blocked" || (alreadyBlocked && blockState === "idle");

  return (
    <Portal>
      <Sheet open onClose={onClose} title="Report" leading={step === "reason" ? <button type="button" onClick={() => setStep("choose")} aria-label="Back" className="text-violet"><ChevronRight size={22} className="rotate-180" /></button> : undefined}>
        {step === "choose" ? (
          <div className="flex flex-col gap-3">
            <div className="ledger">
              <button type="button" onClick={() => setStep("reason")} className="ledger-row w-full text-left hover:bg-surface/50 hairline-b">
                <span className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="t-body-md text-primary">This message</span>
                  <span className="t-body-sm text-muted line-clamp-2 break-words">“{text}”</span>
                </span>
                <ChevronRight size={16} className="text-muted shrink-0" />
              </button>
              <button type="button" onClick={() => setStep("profile")} className="ledger-row w-full text-left hover:bg-surface/50">
                <FlairAvatar user={user} size={28} />
                <span className="t-body-md text-primary flex-1 min-w-0 truncate">@{user.username}&apos;s profile</span>
                <ChevronRight size={16} className="text-muted shrink-0" />
              </button>
            </div>
            <span className="t-label-sm text-muted text-center px-4">Reports are anonymous. The person won&apos;t know who reported them.</span>
          </div>
        ) : step === "reason" ? (
          <div className="flex flex-col gap-3">
            <span className="t-headline-sm text-primary px-0.5">Why are you reporting this message?</span>
            <div className="ledger">
              {MESSAGE_REASONS.map((r, i) => (
                <button key={r} type="button" disabled={!!sending} onClick={() => void send(r)} className={clsx("ledger-row w-full text-left hover:bg-surface/50 disabled:cursor-default", i < MESSAGE_REASONS.length - 1 && "hairline-b", sending && sending !== r && "opacity-50")}>
                  <span className="t-body-md text-primary flex-1">{r}</span>
                  {sending === r ? <Spinner size={16} /> : <ChevronRight size={16} className="text-muted shrink-0" />}
                </button>
              ))}
            </div>
            {error ? <span role="alert" className="t-body-sm text-error px-0.5">{error}</span> : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5 pt-2 pb-1">
            <div className="flex flex-col items-center gap-2 text-center px-2">
              <span className="grid place-items-center size-12 rounded-full bg-success/15 text-success"><Check size={24} strokeWidth={2.75} /></span>
              <span className="t-headline-sm text-primary">Thanks for letting us know</span>
              <span className="t-body-sm text-secondary max-w-sm">Our team reviews every report and acts on the ones that break the rules.</span>
            </div>
            <div className="w-full ledger p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <FlairAvatar user={user} size={40} />
                <span className="flex flex-col gap-1 min-w-0">
                  <span className="t-label-lg text-primary truncate">{isBlockedNow ? `@${user.username} is blocked` : `Block @${user.username} too?`}</span>
                  <span className="t-body-sm text-secondary">{isBlockedNow ? "You can unblock them in Settings → Blocked Users." : "You won't see their messages, comments or profile anywhere in the app, and they won't see yours."}</span>
                </span>
              </div>
              {blockState === "failed" ? <span role="alert" className="t-body-sm text-error">{BLOCK_FAILED}</span> : null}
              <div className="flex justify-end gap-2">
                {isBlockedNow ? (
                  <button type="button" onClick={onClose} className="btn-pill !py-2">Done</button>
                ) : (
                  <>
                    <button type="button" onClick={onClose} className="btn-ghost !py-2">Not now</button>
                    <button type="button" onClick={() => void block()} disabled={blockState === "blocking"} className="btn-pill !py-2 !bg-error min-w-[84px] disabled:opacity-70">
                      {blockState === "blocking" ? <Spinner size={14} className="border-white/40 border-t-white" /> : "Block"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </Portal>
  );
}
