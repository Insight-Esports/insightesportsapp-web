// PlayerComments — PlayerCommentsView.swift as a section of the player page.
//
// A moderated comment section (required for user-generated content), with
// a 500-char cap on new comments (matches backend). The can_delete flag is
// a UI hint only; the server re-checks ownership on every request.
//
// Oct 28 (Moderation.swift / UserIdentity.swift): each author shows their
// real photo in its ring box and links to their profile; the "⋯" (or a
// right-click) offers Delete on your own, Report and Block @user on anyone
// else's. Report opens the Report sheet; blocked people's comments
// disappear. A comment ban (403 COMMENT_BANNED) shows its line above the
// composer and keeps Send disabled.
"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MessagesSquare, Send, Trash2 } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { type Player, type PlayerComment } from "@/lib/types";
import { ConfirmDialog, EmptyState, Ledger, SectionHeader, SkeletonBar, Spinner, Toast } from "@/components/ui";
import { FlairAvatar, FlairName, type FlairUser } from "@/components/ui/premium-flair";
import { useAppState } from "@/store/app-state";
import { ActionMenu, MoreButton, Portal, useActionMenu, type MenuAction, type RowMenuProps } from "@/features/moderation/ActionMenu";
import { BlockConfirm, personActions, unblockQuietly, type ModerationUser } from "@/features/moderation/dialogs";
import { ReportSheet, type ReportTarget } from "@/features/moderation/ReportSheet";
import { useBlockedIds } from "@/features/moderation/use-blocked";
import { noteBan, useBanLine } from "@/features/moderation/ban";
import { useLoadMore } from "./useLoadMore";
import { normalizeCommentsPage, normalizeCreatedComment } from "./types";

const PAGE_SIZE = 20;
const MAX_CHARS = 500;

const authorOf = (c: PlayerComment): FlairUser => ({ id: c.userId || null, username: c.username, avatarURL: c.avatarURL, isPremium: c.isPremium, premiumStyle: c.premiumStyle, title: c.title });

export function PlayerComments({ player }: { player: Player }) {
  const { user } = useAppState();
  const [comments, setComments] = useState<PlayerComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [toDelete, setToDelete] = useState<PlayerComment | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [toBlock, setToBlock] = useState<ModerationUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const menu = useActionMenu<PlayerComment>();
  const blocked = useBlockedIds();
  const banLine = useBanLine("comment");
  const shown = comments.filter((c) => !c.userId || !blocked.has(c.userId));

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
  const canSend = trimmed.length > 0 && trimmed.length <= MAX_CHARS && !posting && !banLine;

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
    } catch (e) {
      if (!noteBan(e)) setError("Couldn't post your comment. Please try again.");
    } finally {
      setPosting(false);
    }
  }

  async function confirmDelete() {
    const c = toDelete;
    setToDelete(null);
    if (!c) return;
    try {
      await api.delete(endpoints.deleteComment(c.id));
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      setError("Couldn't delete your comment. Please try again.");
    }
  }

  const actionsFor = (c: PlayerComment): MenuAction[] => {
    const own = c.canDelete && (!user || !c.userId || c.userId === user.id);
    if (own) return [{ key: "delete", label: "Delete", icon: <Trash2 size={15} />, destructive: true, onSelect: () => setToDelete(c) }];
    if (!c.userId) return [];
    const who = { id: c.userId, username: c.username };
    return personActions({
      user: who, blocked: blocked.has(c.userId), isOwn: false,
      onReport: () => setReport({ kind: "comment", commentId: c.id, text: c.body, user: { ...authorOf(c), id: c.userId } }),
      onBlock: () => setToBlock(who),
      onUnblock: () => { void unblockQuietly(who.id); },
    });
  };

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
        ) : shown.length === 0 ? (
          <EmptyState icon={<MessagesSquare />} title="No comments yet" subtitle={`Be the first to share your take on ${player.name}`} className="!mx-0" />
        ) : (
          <>
            <Ledger striped={false}>
              {shown.map((c) => (
                <CommentRow
                  key={c.id}
                  comment={c}
                  rowProps={menu.rowProps(c)}
                  more={actionsFor(c).length ? <MoreButton className="w-[30px] h-6" {...menu.triggerProps(c)} aria-expanded={menu.target?.id === c.id} /> : null}
                />
              ))}
              {loadingMore ? <div className="flex justify-center py-3"><Spinner size={16} /></div> : null}
            </Ledger>
            <div ref={sentinel} className="h-px" />
          </>
        )}

        {/* Compose */}
        {banLine ? <span role="alert" className="t-label-md text-secondary pt-1">{banLine}</span> : null}
        <div className="flex items-end gap-2.5 pt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Add a comment..."
            rows={1}
            maxLength={MAX_CHARS + 50}
            disabled={!!banLine}
            className="flex-1 resize-none rounded-[10px] bg-surface px-3 py-2.5 t-body-md text-white placeholder:text-muted outline-none border border-transparent focus:border-border-strong min-h-[42px] max-h-28 disabled:opacity-50"
          />
          <button type="button" aria-label="Send" disabled={!canSend} onClick={() => void post()} className="grid place-items-center size-[42px] rounded-[10px] bg-violet text-white disabled:opacity-50 hover:brightness-110 transition">
            {posting ? <Spinner size={16} className="border-white/40 border-t-white" /> : <Send size={16} />}
          </button>
        </div>
        {trimmed.length > MAX_CHARS ? <span className="t-label-sm text-error">{trimmed.length}/{MAX_CHARS}</span> : null}
      </div>

      <ActionMenu anchor={menu.anchor} actions={menu.target ? actionsFor(menu.target) : []} onClose={menu.close} label="Comment actions" />
      <Portal>
        <ConfirmDialog
          open={!!toDelete}
          title="Delete your comment?"
          message="This can't be undone."
          confirmTitle="Delete" destructive onConfirm={() => void confirmDelete()} onCancel={() => setToDelete(null)} />
      </Portal>
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <BlockConfirm user={toBlock} onCancel={() => setToBlock(null)} onBlocked={() => {}} onFailed={setError} />
      <Portal><Toast message={error} kind="error" /></Portal>
    </section>
  );
}

function CommentRow({ comment, rowProps, more }: { comment: PlayerComment; rowProps: RowMenuProps; more: ReactNode }) {
  const author = authorOf(comment);
  return (
    <div {...rowProps} tabIndex={-1} className="ledger-row !items-start flex-col gap-2 hairline-b last:border-b-0 outline-none [-webkit-touch-callout:none]">
      <div className="flex items-center gap-2.5 w-full">
        {/* Comments are a list: the flair holds still. Photo and name open the profile. */}
        <FlairAvatar user={author} size={32} link />
        <span className="flex flex-col min-w-0 flex-1">
          <FlairName user={author} link className="t-label-md self-start" />
          <span className="t-label-sm text-muted">{timeAgo(comment.createdAt)}</span>
        </span>
        {more}
      </div>
      <p className="t-body-md text-secondary whitespace-pre-wrap break-words w-full">{comment.body}</p>
    </div>
  );
}
