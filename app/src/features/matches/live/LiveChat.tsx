// LiveChat.tsx — LiveChatSection + FullChatView + ChatMessageRow
// (LiveMatchSections.swift, LiveMatchView.swift; parity Oct 28 §2–4).
//
// Phones keep the app's grammar: a preview box (last 3 messages) that
// opens the full chat in a sheet. In the desktop rail the full chat is
// inline with its composer (Enter sends).
//
// Rows: the sender's 28px avatar in its ring box (35.5), 7px, then the name
// line (13px semibold, white unless they chose shine, diamond, ORACLE) over
// the message (13px). 4px between rows. In the full chat the photo or name
// opens the profile (Back returns to the chat); in the preview card a click
// still opens the full chat.
//
// Every message has a menu (hover "⋯", right-click, long press): Copy; Edit
// and Delete on your own once /status lists chat_edit (Edit for 15 minutes);
// Report and Block on others below a divider. Blocked people are hidden.
"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Check, Copy, Maximize2, Pencil, Send, Trash2, X } from "lucide-react";
import { AssetIcon, ConfirmDialog, LiveBadge, Sheet, TeamMark, Toast } from "@/components/ui";
import { clsx } from "@/lib/format";
import { errorMessage } from "@/lib/api";
import { FlairAvatar, FlairName } from "@/components/ui/premium-flair";
import { team1Color, team2Color, type Match } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { featureOn } from "@/features/messages/hooks";
import { ActionMenu, MoreButton, Portal, useActionMenu, type MenuAction, type RowMenuProps } from "@/features/moderation/ActionMenu";
import { BlockConfirm, personActions, unblockQuietly, type ModerationUser } from "@/features/moderation/dialogs";
import { ReportSheet, type ReportTarget } from "@/features/moderation/ReportSheet";
import { useBlockedIds } from "@/features/moderation/use-blocked";
import { noteBan, useBanLine } from "@/features/moderation/ban";
import { deleteChatMessage, editChatMessage } from "@/features/moderation/chat-actions";
import { SectionBox, abbr } from "./sections";
import { CHAT_EDIT_WINDOW_MS, type LiveChatMessage } from "./types";

// ── Back from a profile opened in the phone's chat sheet → the sheet again ──
const REOPEN_KEY = "insight.liveChat.reopen";
function rememberReopen(matchId: string) {
  try { sessionStorage.setItem(REOPEN_KEY, JSON.stringify({ id: matchId, at: Date.now() })); } catch { /* private window */ }
}
function takeReopen(matchId: string): boolean {
  try {
    const raw = sessionStorage.getItem(REOPEN_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(REOPEN_KEY);
    const v = JSON.parse(raw) as { id?: string; at?: number };
    return v.id === matchId && Date.now() - (v.at ?? 0) < 10 * 60_000;
  } catch { return false; }
}

type MenuTarget = { m: LiveChatMessage; preview: boolean };
const canStillEdit = (m: LiveChatMessage) => !!m.timestamp && Date.now() - Date.parse(m.timestamp) < CHAT_EDIT_WINDOW_MS;

// ── Row ───────────────────────────────────────────────────────────────────
export function ChatMessageRow({ message, linked = false, rowProps, more }: {
  message: LiveChatMessage;
  /** Full chat: the photo and name open the profile. */
  linked?: boolean;
  /** Right-click / long press / Shift+F10 wiring from useActionMenu. */
  rowProps?: RowMenuProps;
  /** The hover "⋯" (full chat and preview alike). */
  more?: ReactNode;
}) {
  return (
    <div {...rowProps} tabIndex={rowProps ? -1 : undefined} className="group relative flex items-start gap-[7px] rounded-md outline-none [-webkit-touch-callout:none] focus-visible:bg-surface/40">
      <FlairAvatar user={message.flair} size={28} link={linked} />
      <div className="flex flex-col min-w-0 flex-1 pt-px">
        <FlairName user={message.flair} link={linked} className="text-[13px] font-semibold leading-[17px] self-start" />
        <span className="text-[13px] leading-[17px] text-primary whitespace-pre-wrap break-words">
          {message.message}
          {message.editedAt ? <span className="text-[11px] text-muted"> (edited)</span> : null}
        </span>
      </div>
      {more ? <span className="shrink-0 self-center">{more}</span> : null}
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────
export function ChatComposer({ onSend, disabled, placeholder = "Say something...", maxLength = 500, editing = null, onSaveEdit, onCancelEdit, notice = null, noticeIsBan = false }: {
  onSend: (text: string) => Promise<boolean>;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Your message being edited: "✎ Editing message ✕", a violet border, ✓ to save. */
  editing?: LiveChatMessage | null;
  onSaveEdit?: (message: LiveChatMessage, text: string) => Promise<void>;
  onCancelEdit?: () => void;
  /** The ban line or the last error, above the field. */
  notice?: string | null;
  /** A ban: Send stays disabled while it shows. */
  noticeIsBan?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Whatever you'd typed before an edit comes back after it.
  const stash = useRef<string | null>(null);
  const editingId = editing?.id ?? null;
  useEffect(() => {
    if (editingId) {
      if (stash.current === null) stash.current = draft;
      setDraft(editing?.message ?? "");
      requestAnimationFrame(() => { input.current?.focus(); const n = input.current?.value.length ?? 0; input.current?.setSelectionRange(n, n); });
    } else if (stash.current !== null) {
      setDraft(stash.current);
      stash.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const blocked = disabled || (noticeIsBan && !!notice);
  const submit = async () => {
    const t = draft.trim();
    if (!t || sending || blocked) return;
    if (editing) {
      setSending(true);
      try { await onSaveEdit?.(editing, t); } finally { setSending(false); }
      return;
    }
    setSending(true);
    setDraft("");
    const ok = await onSend(t);
    if (!ok) setDraft(t); // restore so the user can retry
    setSending(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); }
    else if (e.key === "Escape" && editing) { e.preventDefault(); e.stopPropagation(); onCancelEdit?.(); }
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void submit(); };
  const hint = editing ? "Edit your message" : placeholder;
  return (
    <div className="flex flex-col gap-2">
      {notice ? <span role="alert" className={clsx("t-label-md", noticeIsBan ? "text-secondary" : "text-error")}>{notice}</span> : null}
      {editing ? (
        <div className="flex items-center gap-1.5 t-label-md text-violet-light">
          <Pencil size={12} />
          <span>Editing message</span>
          <span className="flex-1" />
          <button type="button" onClick={onCancelEdit} aria-label="Cancel editing" className="grid place-items-center size-6 rounded text-muted hover:text-primary"><X size={14} /></button>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="flex items-center gap-2.5">
        <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value.slice(0, maxLength))} onKeyDown={onKey} placeholder={hint} disabled={blocked} autoComplete="off" spellCheck={false} aria-label={hint} className={clsx("flex-1 min-w-0 px-3 py-2.5 rounded-[10px] bg-surface border text-white t-body-md outline-none placeholder:text-muted disabled:opacity-50", editing ? "border-violet" : "border-border-subtle focus:border-border-strong")} />
        <button type="submit" aria-label={editing ? "Save edit" : "Send"} disabled={!draft.trim() || sending || blocked} className="grid place-items-center size-10 rounded-[10px] bg-violet text-white hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed transition-[filter]">
          {editing ? <Check size={17} strokeWidth={2.75} /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}

// ── Full chat ─────────────────────────────────────────────────────────────
/** The expanded chat (FullChatView): header strip, the list, the composer. Scrolls only when a NEW message arrives. */
export function FullChat({ match, team1Score, team2Score, messages, renderRow, composer, isComplete, header = true, className, myId = null }: {
  match: Match;
  team1Score: number;
  team2Score: number;
  messages: LiveChatMessage[];
  renderRow: (m: LiveChatMessage) => ReactNode;
  composer: ReactNode;
  isComplete?: boolean;
  header?: boolean;
  className?: string;
  myId?: string | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const seen = useRef<Set<string> | null>(null);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const first = seen.current === null;
    const known = seen.current ?? new Set<string>();
    const last = messages[messages.length - 1];
    const lastIsNew = !!last && !known.has(last.id);
    for (const m of messages) known.add(m.id);
    seen.current = known;
    // An edit, a delete or a message put back mid-list never moves it.
    if (first || (lastIsNew && (pinned.current || (!!myId && last.userId === myId)))) el.scrollTop = el.scrollHeight;
  }, [messages, myId]);
  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  return (
    <div className={clsx("flex flex-col min-h-0", className)}>
      {header ? (
        <div className="flex items-center gap-2 px-4 py-3 bg-card hairline-b">
          <TeamMark name={match.team1Name} logoURL={match.team1LogoURL} color={team1Color(match)} size={22} />
          <span className="t-label-md" style={{ color: team1Color(match) }}>{abbr(match.team1Name)}</span>
          <span className="t-mono-md text-primary">{team1Score}</span>
          <span className="t-mono-md text-muted">–</span>
          <span className="t-mono-md text-primary">{team2Score}</span>
          <span className="t-label-md" style={{ color: team2Color(match) }}>{abbr(match.team2Name)}</span>
          <TeamMark name={match.team2Name} logoURL={match.team2LogoURL} color={team2Color(match)} size={22} />
          <span className="flex-1" />
          {isComplete ? <span className="t-label-md text-secondary">Final</span> : <LiveBadge />}
        </div>
      ) : null}
      <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-1" role="log" aria-live="polite">
        {messages.length === 0 ? <span className="t-body-sm text-muted">Be the first to say something</span> : messages.map((m) => <div key={m.id}>{renderRow(m)}</div>)}
      </div>
      <div className="px-4 py-2.5 bg-card hairline-t">{composer}</div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────
export function LiveChatSection({ match, team1Score, team2Score, messages, onSend, isComplete, sendDisabled, variant = "compact" }: { match: Match; team1Score: number; team2Score: number; messages: LiveChatMessage[]; onSend: (text: string) => Promise<boolean>; isComplete?: boolean; sendDisabled?: boolean; variant?: "compact" | "panel" }) {
  const { user, status } = useAppState();
  const myId = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const blocked = useBlockedIds();
  const shown = messages.filter((m) => !m.userId || !blocked.has(m.userId));
  const canEdit = featureOn(status, "chat_edit");
  const banLine = useBanLine("comment");

  const menu = useActionMenu<MenuTarget>();
  const [editing, setEditing] = useState<LiveChatMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<LiveChatMessage | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [toBlock, setToBlock] = useState<ModerationUser | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!error) return; const t = setTimeout(() => setError(null), 5000); return () => clearTimeout(t); }, [error]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  // Back from a profile opened in the phone sheet: the sheet again.
  useEffect(() => {
    if (variant !== "compact" || typeof window === "undefined") return;
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    if (takeReopen(match.id)) setOpen(true);
  }, [match.id, variant]);

  const fail = (e: unknown, fallback: string) => {
    if (noteBan(e)) return;
    setError(errorMessage(e, fallback));
  };
  const saveEdit = async (m: LiveChatMessage, text: string) => {
    setEditing(null);
    if (text === m.message) return;
    try { await editChatMessage(match.id, m, text); } catch (e) { fail(e, "Couldn't edit your message."); }
  };
  const confirmDelete = async () => {
    const m = toDelete;
    setToDelete(null);
    if (!m) return;
    if (editing?.id === m.id) setEditing(null);
    try { await deleteChatMessage(match.id, m); } catch (e) { fail(e, "Couldn't delete your message."); }
  };

  const actionsFor = (m: LiveChatMessage, fromPreview: boolean): MenuAction[] => {
    const own = !!myId && m.userId === myId;
    const list: MenuAction[] = [
      { key: "copy", label: "Copy", icon: <Copy size={15} />, onSelect: () => { void navigator.clipboard?.writeText(m.message).catch(() => {}); } },
    ];
    if (own && canEdit) {
      if (canStillEdit(m)) list.push({ key: "edit", label: "Edit", icon: <Pencil size={15} />, onSelect: () => { setEditing(m); if (fromPreview) setOpen(true); } });
      list.push({ key: "delete", label: "Delete", icon: <Trash2 size={15} />, destructive: true, onSelect: () => setToDelete(m) });
    }
    if (m.userId) {
      const who = { id: m.userId, username: m.username };
      list.push(...personActions({
        user: who, blocked: blocked.has(m.userId), isOwn: own, divider: true,
        onReport: () => setReport({ kind: "chat", roomId: match.id, messageId: m.id, text: m.message, user: { ...m.flair, id: m.userId! } }),
        onBlock: () => setToBlock(who),
        onUnblock: () => { void unblockQuietly(who.id); },
      }));
    }
    return list;
  };

  // Full chat rows: links to profiles; in the phone sheet a profile visit comes back to the sheet.
  const fullRow = (m: LiveChatMessage) => (
    <div onClickCapture={variant === "compact" ? (e: MouseEvent) => { if ((e.target as HTMLElement).closest("a[href]")) rememberReopen(match.id); } : undefined}>
      <ChatMessageRow
        message={m}
        linked
        rowProps={menu.rowProps({ m, preview: false })}
        more={<MoreButton hover size={15} className="size-7" {...menu.triggerProps({ m, preview: false })} aria-expanded={menu.target?.m.id === m.id} />}
      />
    </div>
  );
  const composer = (
    <ChatComposer
      onSend={onSend}
      disabled={sendDisabled}
      editing={editing}
      onSaveEdit={saveEdit}
      onCancelEdit={() => setEditing(null)}
      notice={banLine ?? error}
      noticeIsBan={!!banLine}
    />
  );
  const overlays = (
    <>
      <ActionMenu anchor={menu.anchor} actions={menu.target ? actionsFor(menu.target.m, menu.target.preview) : []} onClose={menu.close} label="Message actions" />
      <Portal>
        <ConfirmDialog open={!!toDelete} title="Delete this message?" message="It'll be removed from the chat for everyone." confirmTitle="Delete" destructive onConfirm={() => void confirmDelete()} onCancel={() => setToDelete(null)} />
      </Portal>
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <BlockConfirm user={toBlock} onCancel={() => setToBlock(null)} onBlocked={() => {}} onFailed={setToast} />
      <Portal><Toast message={toast} kind="error" /></Portal>
    </>
  );

  if (variant === "panel") {
    return (
      <SectionBox className="!p-0 flex flex-col overflow-hidden h-[520px]">
        <div className="flex items-center gap-1.5 px-3.5 py-3">
          <AssetIcon name="messages" height={16} />
          <span className="t-headline-sm text-primary">Live Chat</span>
          <span className="flex-1" />
          <span className="t-label-sm text-muted">{shown.length} messages</span>
        </div>
        <FullChat match={match} team1Score={team1Score} team2Score={team2Score} messages={shown} renderRow={fullRow} composer={composer} isComplete={isComplete} header={false} myId={myId} className="flex-1 border-t border-border-subtle" />
        {overlays}
      </SectionBox>
    );
  }

  const preview = shown.slice(-3);
  return (
    <>
      <SectionBox className="flex flex-col gap-3 cursor-pointer hover:bg-surface/40 transition-colors" >
        <div role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); } }} className="flex flex-col gap-3 text-left w-full outline-none" aria-label="Open live chat">
          <span className="flex items-center gap-1.5">
            <AssetIcon name="messages" height={16} />
            <span className="t-headline-sm text-primary">Live Chat</span>
            <span className="flex-1" />
            <span className="inline-flex items-center gap-[3px] t-label-sm text-violet">Open <Maximize2 size={10} /></span>
          </span>
          <span className="flex flex-col gap-1">
            {preview.map((m) => (
              <ChatMessageRow
                key={m.id}
                message={m}
                rowProps={menu.rowProps({ m, preview: true })}
                more={<MoreButton hover size={15} className="size-7" {...menu.triggerProps({ m, preview: true })} aria-expanded={menu.target?.m.id === m.id} />}
              />
            ))}
            {shown.length === 0 ? <span className="t-body-sm text-muted">Be the first to say something</span> : null}
          </span>
          <span className="t-label-sm text-muted">Tap to open live chat</span>
        </div>
      </SectionBox>
      <Sheet open={open} onClose={() => { setOpen(false); setEditing(null); }} title="Live Chat" size="lg">
        <div className="-m-4 h-[70vh]">
          <FullChat match={match} team1Score={team1Score} team2Score={team2Score} messages={shown} renderRow={fullRow} composer={composer} isComplete={isComplete} myId={myId} className="h-full" />
        </div>
      </Sheet>
      {overlays}
    </>
  );
}
