// MatchComments.tsx — MatchCommentsView: the persistent comment thread for
// a match (live or completed). Unlike the live chat (ephemeral) these are
// SAVED and become the past game's discussion. Report, soft-delete own,
// 500-char limit; the server re-verifies ownership on delete.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronRight, MoreHorizontal, Send } from "lucide-react";
import { AssetIcon, ConfirmDialog, InitialAvatar, LoadFailure, SkeletonLedger, Toast } from "@/components/ui";
import { api, endpoints, errorMessage } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { timeAgo } from "@/lib/format";
import { clsx } from "@/lib/format";
import type { Json } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { SectionBox } from "./sections";
import { normalizeCreatedComment, normalizeMatchComments, type MatchComment } from "./types";

function CommentRow({ comment, onDelete, onReport }: { comment: MatchComment; onDelete: () => void; onReport: () => void }) {
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menu]);
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <InitialAvatar name={comment.username} imageURL={comment.avatarURL} size={40} />
      <div className="flex flex-col gap-[3px] min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="t-label-md text-primary truncate">{comment.username}</span>
          <span className="t-label-sm text-muted shrink-0">{timeAgo(comment.createdAt)}</span>
          <span className="flex-1" />
          <div ref={wrap} className="relative">
            <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} className="grid place-items-center w-7 h-6 rounded text-muted hover:text-primary hover:bg-surface/60">
              <MoreHorizontal size={13} />
            </button>
            {menu ? (
              <div role="menu" className="absolute right-0 top-7 z-10 min-w-28 rounded-lg bg-card border border-hairline py-1 shadow-xl">
                {comment.canDelete ? (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onDelete(); }} className="w-full text-left px-3 py-2 t-label-md text-error hover:bg-surface/60">Delete</button>
                ) : (
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onReport(); }} className="w-full text-left px-3 py-2 t-label-md text-error hover:bg-surface/60">Report</button>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <span className="t-body-sm text-secondary whitespace-pre-wrap break-words">{comment.body}</span>
      </div>
    </div>
  );
}

export function MatchCommentsSection({ matchId, className }: { matchId: string; className?: string }) {
  const { user } = useAppState();
  const { data, loading, error, connectionProblem, reload, setData } = useFetch(
    (signal) => api.get<Json>(endpoints.matchComments(matchId), { signal }).then(normalizeMatchComments),
    [matchId],
  );
  const comments = useMemo(() => data ?? [], [data]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<MatchComment | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!sendError && !toast) return;
    const t = setTimeout(() => { setSendError(null); setToast(null); }, 3500);
    return () => clearTimeout(t);
  }, [sendError, toast]);

  const send = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > 500 || sending) return;
    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const optimistic: MatchComment = { id: tempId, username: user?.username ?? "You", avatarURL: user?.avatarURL ?? null, body: trimmed, createdAt: new Date().toISOString(), canDelete: true };
    setData((prev) => [optimistic, ...(prev ?? [])]);
    setDraft("");
    try {
      const created = normalizeCreatedComment(await api.post<Json>(endpoints.matchComments(matchId), { body: trimmed }));
      setData((prev) => (prev ?? []).map((c) => (c.id === tempId ? created : c)));
    } catch (e) {
      setData((prev) => (prev ?? []).filter((c) => c.id !== tempId));
      setDraft(trimmed);
      setSendError(errorMessage(e, "Couldn't post your comment. Please try again."));
    } finally {
      setSending(false);
    }
  }, [draft, matchId, sending, setData, user]);

  const remove = useCallback(async (c: MatchComment) => {
    const previous = comments;
    setData((prev) => (prev ?? []).filter((x) => x.id !== c.id));
    try { await api.delete(endpoints.deleteComment(c.id)); } catch { setData(previous); }
  }, [comments, setData]);

  const report = useCallback(async (c: MatchComment) => {
    try { await api.post(endpoints.reportComment(c.id), {}); } catch { /* fire-and-forget */ }
    setToast("Thanks — our team will review this comment.");
  }, []);

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
      <form onSubmit={onSubmit} className="flex items-end gap-2.5 px-3.5 pb-3">
        <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 500))} onKeyDown={onKey} placeholder="Add a comment..." rows={1} aria-label="Add a comment" className="flex-1 min-w-0 resize-none px-2.5 py-2.5 rounded-[10px] bg-surface border border-border-subtle text-white t-body-md outline-none focus:border-border-strong placeholder:text-muted max-h-28" />
        <button type="submit" aria-label="Post comment" disabled={!draft.trim() || sending} className="grid place-items-center size-10 rounded-[10px] bg-violet text-white hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed">
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
                <CommentRow comment={c} onDelete={() => void remove(c)} onReport={() => setReportTarget(c)} />
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
      <ConfirmDialog open={!!reportTarget} title="Report comment?" message="Our team will review this comment. Thanks for helping keep the community safe." confirmTitle="Report" destructive onConfirm={() => { if (reportTarget) void report(reportTarget); setReportTarget(null); }} onCancel={() => setReportTarget(null)} />
      <Toast message={sendError ?? toast} kind={sendError ? "error" : "success"} />
    </SectionBox>
  );
}
