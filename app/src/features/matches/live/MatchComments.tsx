// MatchComments.tsx — MatchCommentsView: the persistent comment thread for
// a match (live or completed). Unlike the live chat (ephemeral) these are
// SAVED and become the past game's discussion. 500-char limit; the server
// re-verifies ownership on delete.
//
// Moderation (parity Oct 28 §2): the "⋯" (or a right-click) on a comment
// offers Delete on your own, Report and Block @user on anyone else's.
// Report opens the Report sheet; blocked people's comments disappear. A
// comment ban (403 COMMENT_BANNED) shows its line above the composer and
// keeps Send disabled.
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight, Send, Trash2 } from "lucide-react";
import { AssetIcon, ConfirmDialog, LoadFailure, SkeletonLedger, Toast } from "@/components/ui";
import { api, endpoints, errorMessage } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { timeAgo } from "@/lib/format";
import { clsx } from "@/lib/format";
import type { Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { FlairAvatar, FlairName, flairUserFrom, type FlairUser } from "@/components/ui/premium-flair";
import { ActionMenu, MoreButton, Portal, useActionMenu, type MenuAction, type RowMenuProps } from "@/features/moderation/ActionMenu";
import { BlockConfirm, personActions, unblockQuietly, type ModerationUser } from "@/features/moderation/dialogs";
import { ReportSheet, type ReportTarget } from "@/features/moderation/ReportSheet";
import { useBlockedIds } from "@/features/moderation/use-blocked";
import { noteBan, useBanLine } from "@/features/moderation/ban";
import { SectionBox } from "./sections";
import { normalizeMatchComment, type MatchComment } from "./types";

// A comment plus its author's flair inputs (author.{id, is_premium,
// premium_style, title}) — decoded here so the shared MatchComment model
// stays as it is.
type FlairComment = MatchComment & { author: FlairUser };
function decodeComment(raw: Json): FlairComment {
  const c = normalizeMatchComment(raw);
  // Flat rows carry the author as user_id (never the comment's own id).
  const a = raw?.author && typeof raw.author === "object" ? raw.author : { ...raw, id: raw?.user_id ?? null };
  return { ...c, author: { ...flairUserFrom(a), id: c.userId, username: c.username, avatarURL: c.avatarURL } };
}
function decodeComments(raw: Json): FlairComment[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.comments) ? raw.comments : [];
  return arr.filter((r: Json) => r?.id != null).map(decodeComment);
}
/** POST response: { comment: {...} } or a bare comment. */
function decodeCreated(raw: Json): FlairComment {
  return decodeComment(raw?.comment && typeof raw.comment === "object" ? raw.comment : raw);
}

function CommentRow({ comment, rowProps, more }: { comment: FlairComment; rowProps: RowMenuProps; more: ReactNode }) {
  return (
    <div {...rowProps} tabIndex={-1} className="flex items-start gap-3 px-4 py-2.5 outline-none [-webkit-touch-callout:none]">
      {/* Comments are a list: the flair holds still. Photo and name open the profile. */}
      <FlairAvatar user={comment.author} size={40} link />
      <div className="flex flex-col gap-[3px] min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <FlairName user={comment.author} link className="t-label-md" />
          <span className="t-label-sm text-muted shrink-0">{timeAgo(comment.createdAt)}</span>
          <span className="flex-1" />
          {more}
        </div>
        <span className="t-body-sm text-secondary whitespace-pre-wrap break-words">{comment.body}</span>
      </div>
    </div>
  );
}

export function MatchCommentsSection({ matchId, className }: { matchId: string; className?: string }) {
  const { user } = useAppState();
  const { data, loading, error, connectionProblem, reload, setData } = useFetch(
    (signal) => api.get<Json>(endpoints.matchComments(matchId), { signal }).then(decodeComments),
    [matchId],
  );
  const blocked = useBlockedIds();
  const comments = useMemo(() => (data ?? []).filter((c) => !c.userId || !blocked.has(c.userId)), [data, blocked]);
  const banLine = useBanLine("comment");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const menu = useActionMenu<FlairComment>();
  const [toDelete, setToDelete] = useState<FlairComment | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [toBlock, setToBlock] = useState<ModerationUser | null>(null);

  useEffect(() => {
    if (!sendError && !toast) return;
    const t = setTimeout(() => { setSendError(null); setToast(null); }, 3500);
    return () => clearTimeout(t);
  }, [sendError, toast]);

  const send = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > 500 || sending || banLine) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const author: FlairUser = { id: user?.id ?? null, username: user?.username ?? "You", avatarURL: user?.avatarURL ?? null, isPremium: !!user?.isPremium, premiumStyle: user?.premiumStyle ?? null, title: user?.title };
    const optimistic: FlairComment = { id: tempId, userId: user?.id ?? null, username: author.username, avatarURL: author.avatarURL ?? null, body: trimmed, createdAt: new Date().toISOString(), canDelete: true, author };
    setData((prev) => [optimistic, ...(prev ?? [])]);
    setDraft("");
    try {
      const created = decodeCreated(await api.post<Json>(endpoints.matchComments(matchId), { body: trimmed }));
      setData((prev) => (prev ?? []).map((c) => (c.id === tempId ? created : c)));
    } catch (e) {
      setData((prev) => (prev ?? []).filter((c) => c.id !== tempId));
      setDraft(trimmed);
      if (!noteBan(e)) setSendError(errorMessage(e, "Couldn't post your comment. Please try again."));
    } finally {
      setSending(false);
    }
  }, [banLine, draft, matchId, sending, setData, user]);

  const remove = useCallback(async (c: FlairComment) => {
    const previous = data;
    setData((prev) => (prev ?? []).filter((x) => x.id !== c.id));
    try { await api.delete(endpoints.deleteComment(c.id)); } catch { setData(previous); setSendError("Couldn't delete your comment. Please try again."); }
  }, [data, setData]);

  const actionsFor = (c: FlairComment): MenuAction[] => {
    const own = c.canDelete || (!!user && c.userId === user.id);
    if (own) return [{ key: "delete", label: "Delete", icon: <Trash2 size={15} />, destructive: true, onSelect: () => setToDelete(c) }];
    if (!c.userId) return [];
    const who = { id: c.userId, username: c.username };
    return personActions({
      user: who, blocked: blocked.has(c.userId), isOwn: false,
      onReport: () => setReport({ kind: "comment", commentId: c.id, text: c.body, user: { ...c.author, id: c.userId! } }),
      onBlock: () => setToBlock(who),
      onUnblock: () => { void unblockQuietly(who.id); },
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(); };
  const visible = expanded ? comments : comments.slice(0, 5);

  return (
    <SectionBox className={clsx("!p-0 overflow-hidden", className)} >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <AssetIcon name="messages" height={17} />
        <span className="flex flex-col gap-0.5">
          <span className="t-body-md text-primary">Match Discussion</span>
          <span className="t-label-sm text-muted">{comments.length > 0 ? `${comments.length} comments` : "Be the first to comment"}</span>
        </span>
      </div>
      {banLine ? <span role="alert" className="block px-3.5 pb-2 t-label-md text-secondary">{banLine}</span> : null}
      <form onSubmit={onSubmit} className="flex items-end gap-2.5 px-3.5 pb-3">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 500))} onKeyDown={onKey} placeholder="Add a comment..." rows={1} aria-label="Add a comment" disabled={!!banLine} className="flex-1 min-w-0 resize-none px-2.5 py-2.5 rounded-[10px] bg-surface border border-border-subtle text-white t-body-md outline-none focus:border-border-strong placeholder:text-muted max-h-28 disabled:opacity-50" />
        <button type="submit" aria-label="Post comment" disabled={!draft.trim() || sending || !!banLine} className="grid place-items-center size-10 rounded-[10px] bg-violet text-white hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed">
          <Send size={16} />
        </button>
      </form>
      <div className="hairline-t">
        {loading && comments.length === 0 ? (
          <div className="p-3.5"><SkeletonLedger rows={3} avatar={40} /></div>
        ) : error && comments.length === 0 ? (
          <LoadFailure error={error} connectionProblem={connectionProblem} onRetry={reload} />
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AssetIcon name="messages" height={42} className="opacity-50" />
            <span className="t-headline-sm text-primary">No comments yet</span>
            <span className="t-body-sm text-muted">Share your take on this match.</span>
          </div>
        ) : (
          <div className="flex flex-col">
            {visible.map((c, i) => (
              <div key={c.id} className={clsx(i > 0 && "relative before:absolute before:top-0 before:left-16 before:right-0 before:h-px before:bg-border-subtle")}>
                <CommentRow
                  comment={c}
                  rowProps={menu.rowProps(c)}
                  more={actionsFor(c).length ? <MoreButton size={13} className="w-7 h-6" {...menu.triggerProps(c)} aria-expanded={menu.target?.id === c.id} /> : null}
                />
              </div>
            ))}
            {comments.length > 5 ? (
              <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center justify-center gap-1 py-2.5 t-label-md text-violet hover:bg-surface/40 hairline-t">
                {expanded ? "Show less" : `Show all ${comments.length} comments`} <ChevronRight size={12} className={clsx("transition-transform", expanded ? "-rotate-90" : "rotate-90")} />
              </button>
            ) : null}
          </div>
        )}
      </div>
      <ActionMenu anchor={menu.anchor} actions={menu.target ? actionsFor(menu.target) : []} onClose={menu.close} label="Comment actions" />
      <Portal>
        <ConfirmDialog open={!!toDelete} title="Delete your comment?" message="This can't be undone." confirmTitle="Delete" destructive onConfirm={() => { if (toDelete) void remove(toDelete); setToDelete(null); }} onCancel={() => setToDelete(null)} />
      </Portal>
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <BlockConfirm user={toBlock} onCancel={() => setToBlock(null)} onBlocked={() => {}} onFailed={setToast} />
      <Portal><Toast message={sendError ?? toast} kind="error" /></Portal>
    </SectionBox>
  );
}
