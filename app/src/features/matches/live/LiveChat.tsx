// LiveChat.tsx — LiveChatSection + FullChatView + ChatMessageRow.
//
// Phones keep the app's grammar: a preview box (last 3 messages) that
// opens the full chat in a sheet. In the desktop rail the full chat is
// inline with its composer (Enter sends).
"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Maximize2, Send } from "lucide-react";
import { AssetIcon, LiveBadge, Sheet, TeamMark } from "@/components/ui";
import { clsx } from "@/lib/format";
import { team1Color, team2Color, type Match } from "@/lib/types";
import { SectionBox, abbr } from "./sections";
import type { LiveChatMessage } from "./types";

export function ChatMessageRow({ message }: { message: LiveChatMessage }) {
  return (
    <div className="flex items-start gap-1.5 py-[5px]">
      {message.isPremium ? <AssetIcon name="premium" height={13} className="mt-0.5" /> : null}
      <span className="t-label-md text-violet shrink-0">{message.username}</span>
      <span className="t-body-sm text-primary break-words min-w-0">{message.message}</span>
    </div>
  );
}

export function ChatComposer({ onSend, disabled, placeholder = "Say something...", maxLength = 500 }: { onSend: (text: string) => Promise<boolean>; disabled?: boolean; placeholder?: string; maxLength?: number }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const t = draft.trim();
    if (!t || sending || disabled) return;
    setSending(true);
    setDraft("");
    const ok = await onSend(t);
    if (!ok) setDraft(t); // restore so the user can retry
    setSending(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void submit(); };
  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2.5">
      <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, maxLength))} onKeyDown={onKey} placeholder={placeholder} disabled={disabled} autoComplete="off" spellCheck={false} aria-label={placeholder} className="flex-1 min-w-0 px-3 py-2.5 rounded-[10px] bg-surface border border-border-subtle text-white t-body-md outline-none focus:border-border-strong placeholder:text-muted disabled:opacity-50" />
      <button type="submit" aria-label="Send" disabled={!draft.trim() || sending || disabled} className="grid place-items-center size-10 rounded-[10px] bg-violet text-white hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed transition-[filter]">
        <Send size={16} />
      </button>
    </form>
  );
}

/** The expanded chat (FullChatView): header strip, auto-scrolling list, composer. */
export function FullChat({ match, team1Score, team2Score, messages, onSend, isComplete, sendDisabled, header = true, className }: { match: Match; team1Score: number; team2Score: number; messages: LiveChatMessage[]; onSend: (text: string) => Promise<boolean>; isComplete?: boolean; sendDisabled?: boolean; header?: boolean; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = listRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
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
        {messages.length === 0 ? <span className="t-body-sm text-muted">Be the first to say something</span> : messages.map((m) => <ChatMessageRow key={m.id} message={m} />)}
      </div>
      <div className="px-4 py-2.5 bg-card hairline-t">
        <ChatComposer onSend={onSend} disabled={sendDisabled} />
      </div>
    </div>
  );
}

export function LiveChatSection({ match, team1Score, team2Score, messages, onSend, isComplete, sendDisabled, variant = "compact" }: { match: Match; team1Score: number; team2Score: number; messages: LiveChatMessage[]; onSend: (text: string) => Promise<boolean>; isComplete?: boolean; sendDisabled?: boolean; variant?: "compact" | "panel" }) {
  const [open, setOpen] = useState(false);

  if (variant === "panel") {
    return (
      <SectionBox className="!p-0 flex flex-col overflow-hidden h-[520px]">
        <div className="flex items-center gap-1.5 px-3.5 py-3">
          <AssetIcon name="messages" height={16} />
          <span className="t-headline-sm text-primary">Live Chat</span>
          <span className="flex-1" />
          <span className="t-label-sm text-muted">{messages.length} messages</span>
        </div>
        <FullChat match={match} team1Score={team1Score} team2Score={team2Score} messages={messages} onSend={onSend} isComplete={isComplete} sendDisabled={sendDisabled} header={false} className="flex-1 border-t border-border-subtle" />
      </SectionBox>
    );
  }

  return (
    <>
      <SectionBox className="flex flex-col gap-3 cursor-pointer hover:bg-surface/40 transition-colors" >
        <button type="button" onClick={() => setOpen(true)} className="flex flex-col gap-3 text-left w-full">
          <span className="flex items-center gap-1.5">
            <AssetIcon name="messages" height={16} />
            <span className="t-headline-sm text-primary">Live Chat</span>
            <span className="flex-1" />
            <span className="inline-flex items-center gap-[3px] t-label-sm text-violet">Open <Maximize2 size={10} /></span>
          </span>
          <span className="flex flex-col gap-2">
            {messages.slice(-3).map((m) => <ChatMessageRow key={m.id} message={m} />)}
            {messages.length === 0 ? <span className="t-body-sm text-muted">Be the first to say something</span> : null}
          </span>
          <span className="t-label-sm text-muted">Tap to open live chat</span>
        </button>
      </SectionBox>
      <Sheet open={open} onClose={() => setOpen(false)} title="Live Chat" size="lg">
        <div className="-m-4 h-[70vh]">
          <FullChat match={match} team1Score={team1Score} team2Score={team2Score} messages={messages} onSend={onSend} isComplete={isComplete} sendDisabled={sendDisabled} className="h-full" />
        </div>
      </Sheet>
    </>
  );
}
