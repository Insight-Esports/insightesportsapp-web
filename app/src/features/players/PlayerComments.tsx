// PlayerComments — PlayerCommentsView.swift as a section of the player page.
//
// A moderated comment section. Moderation built in (required for
// user-generated content): report a comment, block the author, delete your
// own comment — each behind a confirmation — and a 500-char cap on new
// comments (matches backend). The can_delete flag is a UI hint only; the
// server re-checks ownership on every request.
"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Ban, Flag, MessagesSquare, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { type Player, type PlayerComment } from "@/lib/types";
import { ConfirmDialog, EmptyState, GradientAvatar, Ledger, SectionHeader, SkeletonBar, Spinner, Toast } from "@/components/ui";
import { useLoadMore } from "./useLoadMore";
import { normalizeCommentsPage, normalizeCreatedComment } from "./types";

const PAGE_SIZE = 20;
const MAX_CHARS = 500;

type Pending = { kind: "report" | "block" | "delete"; comment: PlayerComment } | null;

export function PlayerComments({ player }: { player: Player }) {
  const [comments, setComments] = useState<PlayerComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetchPage = useCallback(() => api.get(endpoints.playerComments(player.id)).then(normalizeCommentsPage), [player.id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setComments([]);
    setReachedEnd(false);
    fetchPage()
      .then((fetched) => { if (active) { setComments(fetched); setReachedEnd(fetched.length < PAGE_SIZE); } })
      .catch(() => { if (active) { setComments([]); setReachedEnd(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchPage]);

  // Pagination: the endpoint returns a page at a time; append only genuinely
  // new comments, and stop when nothing new arrives.
  const loadMore = useCallback(() => {
    if (reachedEnd || inFlight.current || loading) return;
    inFlight.current = true;
    setLoadingMore(true);
    fetchPage()
      .then((fetched) => {
        setComments((prev) => {
          const known = new Set(prev.map((c) => c.id));
          const fresh = fetched.filter((c) => !known.has(c.id));
          if (fresh.length === 0) setReachedEnd(true);
          return fresh.length ? prev.concat(fresh) : prev;
        });
      })
      .catch(() => setReachedEnd(true))
      .finally(() => { inFlight.current = false; setLoadingMore(false); });
  }, [reachedEnd, loading, fetchPage]);
  const sentinel = useLoadMore(loadMore, !loading && !reachedEnd && !loadingMore);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3500);
    return () => clearTimeout(id);
  }, [error]);

  const trimmed = draft.trim();
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_CHARS && !posting;

  async function post() {
    if (!canSend) return;
    setPosting(true);
    try {
      const raw = await api.post(endpoints.playerComments(player.id), { body: trimmed });
      const created = normalizeCreatedComment(raw);
      if (created) {
        setComments((prev) => [created, ...prev]);
      } else {
        // The POST reached the server but the response shape didn't match —
        // the comment was almost certainly created. Reload to show it.
        const fetched = await fetchPage().catch(() => null);
        if (fetched) setComments(fetched);
      }
      setDraft("");
    } catch {
      setError("Couldn't post your comment. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  async function confirmPending() {
    const p = pending;
    setPending(null);
    if (!p) return;
    try {
      if (p.kind === "report") {
        await api.post(endpoints.reportComment(p.comment.id), {});
      } else if (p.kind === "block") {
        await api.post(endpoints.blockUser(p.comment.userId), {});
        setComments((prev) => prev.filter((c) => c.userId !== p.comment.userId));
      } else {
        await api.delete(endpoints.deleteComment(p.comment.id));
        setComments((prev) => prev.filter((c) => c.id !== p.comment.id));
      }
    } catch {
      setError(p.kind === "report" ? "Couldn't submit the report. Please try again."
        : p.kind === "block" ? "Couldn't block this user. Please try again."
        : "Couldn't delete your comment. Please try again.");
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void post(); }
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Player Comments" />

      <div className="px-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-border-subtle bg-card p-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5"><span className="size-8 rounded-full bg-surface" /><SkeletonBar width={90} height={10} /></div>
                <SkeletonBar width="80%" height={10} />
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <EmptyState icon={<MessagesSquare />} title="No comments yet" subtitle={`Be the first to share your take on ${player.name}`} className="!mx-0" />
        ) : (
          <>
            <Ledger striped={false}>
              {comments.map((c) => (
                <CommentRow key={c.id} comment={c}
                  onReport={() => setPending({ kind: "report", comment: c })}
                  onBlock={() => setPending({ kind: "block", comment: c })}
                  onDelete={() => setPending({ kind: "delete", comment: c })} />
              ))}
              {loadingMore ? <div className="flex justify-center py-3"><Spinner size={16} /></div> : null}
            </Ledger>
            <div ref={sentinel} className="h-px" />
          </>
        )}

        {/* Compose */}
        <div className="flex items-end gap-2.5 pt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Add a comment..."
            rows={1}
            maxLength={MAX_CHARS + 50}
            className="flex-1 resize-none rounded-[10px] bg-surface px-3 py-2.5 t-body-md text-white placeholder:text-muted outline-none border border-transparent focus:border-border-strong min-h-[42px] max-h-28"
          />
          <button type="button" aria-label="Send" disabled={!canSend} onClick={() => void post()} className="grid place-items-center size-[42px] rounded-[10px] bg-violet text-white disabled:opacity-50 hover:brightness-110 transition">
            {posting ? <Spinner size={16} className="border-white/40 border-t-white" /> : <Send size={16} />}
          </button>
        </div>
        {trimmed.length > MAX_CHARS ? <span className="t-label-sm text-error">{trimmed.length}/{MAX_CHARS}</span> : null}
      </div>

      <ConfirmDialog
        open={pending?.kind === "report"}
        title="Report this comment?"
        message="Our team will review this comment. Thanks for helping keep the community safe."
        confirmTitle="Report" destructive onConfirm={confirmPending} onCancel={() => setPending(null)} />
      <ConfirmDialog
        open={pending?.kind === "block"}
        title="Block this user?"
        message="You won't see comments from this user anymore."
        confirmTitle="Block" destructive onConfirm={confirmPending} onCancel={() => setPending(null)} />
      <ConfirmDialog
        open={pending?.kind === "delete"}
        title="Delete your comment?"
        message="This can't be undone."
        confirmTitle="Delete" destructive onConfirm={confirmPending} onCancel={() => setPending(null)} />
      <Toast message={error ? `Something went wrong — ${error}` : null} kind="error" />
    </section>
  );
}

function CommentRow({ comment, onReport, onBlock, onDelete }: { comment: PlayerComment; onReport: () => void; onBlock: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menu]);
  return (
    <div className="ledger-row !items-start flex-col gap-2 hairline-b last:border-b-0">
      <div className="flex items-center gap-2.5 w-full">
        <GradientAvatar name={comment.username} size={32} />
        <span className="flex flex-col min-w-0 flex-1">
          <span className="t-label-md text-primary truncate">{comment.username}</span>
          <span className="t-label-sm text-muted">{timeAgo(comment.createdAt)}</span>
        </span>
        <div ref={wrap} className="relative">
          <button type="button" aria-label="More" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="grid place-items-center w-[30px] h-6 rounded text-muted hover:text-primary">
            <MoreHorizontal size={16} />
          </button>
          {menu ? (
            <div role="menu" className="absolute right-0 top-7 z-20 min-w-40 rounded-xl bg-card border border-hairline py-1 shadow-xl">
              {comment.canDelete ? (
                <MenuItem icon={<Trash2 size={14} />} label="Delete" destructive onClick={() => { setMenu(false); onDelete(); }} />
              ) : (
                <>
                  <MenuItem icon={<Flag size={14} />} label="Report" onClick={() => { setMenu(false); onReport(); }} />
                  <MenuItem icon={<Ban size={14} />} label="Block User" destructive onClick={() => { setMenu(false); onBlock(); }} />
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <p className="t-body-md text-secondary whitespace-pre-wrap break-words w-full">{comment.body}</p>
    </div>
  );
}

function MenuItem({ icon, label, destructive, onClick }: { icon: React.ReactNode; label: string; destructive?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex items-center gap-2.5 w-full px-3 py-2 t-body-sm text-left hover:bg-surface/70 ${destructive ? "text-error" : "text-primary"}`}>
      {icon}{label}
    </button>
  );
}
