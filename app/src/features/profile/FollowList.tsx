// FollowList — FollowListView.swift: Followers / Following, reached from the
// counts on a profile. Rows open that user's profile; a trailing "•••" menu
// offers Block / Report / (own followers only) Remove Follower. Paginates.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ellipsis, Hand, ShieldAlert, UserX, Users, UserPlus, ChevronLeft } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { gameLabel, type Json } from "@/lib/types";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { ConfirmDialog, EmptyState, InitialAvatar, Page, SkeletonLedger, Spinner } from "@/components/ui";
import { normalizeFollowRows, type FollowUser } from "./types";
import { seedFollow, useFollowState } from "./follow-store";

export type FollowListMode = "followers" | "following";
const PAGE = 20;

export function FollowList({ mode, userId }: { mode: FollowListMode; userId: string }) {
  const router = useRouter();
  const { user } = useAppState();
  const isOwnList = userId === "me" || (!!user && user.id === userId);
  const targetId = isOwnList ? "me" : userId;

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [blockTarget, setBlockTarget] = useState<FollowUser | null>(null);
  const [reportTarget, setReportTarget] = useState<FollowUser | null>(null);
  const offsetRef = useRef(0);

  const fetchPage = useCallback(async (replacing: boolean) => {
    const offset = replacing ? 0 : offsetRef.current;
    try {
      const path = mode === "followers" ? endpoints.followers(targetId, PAGE, offset) : endpoints.following(targetId, PAGE, offset, "user");
      const page = normalizeFollowRows(await api.get<Json>(path), mode === "following");
      page.forEach((u) => seedFollow("user", u.id, u.isFollowing));
      if (page.length < PAGE) setReachedEnd(true);
      setUsers((prev) => (replacing ? page : [...prev, ...page.filter((p) => !prev.some((x) => x.id === p.id))]));
      offsetRef.current = offset + page.length;
    } catch {
      // Real empty state — no mock.
      if (replacing) setUsers([]);
      setReachedEnd(true);
    } finally {
      setHasLoaded(true);
    }
  }, [mode, targetId]);

  useEffect(() => {
    setUsers([]); setHasLoaded(false); setReachedEnd(false); offsetRef.current = 0;
    void fetchPage(true);
  }, [fetchPage]);

  async function loadMore() {
    if (loadingMore || reachedEnd || users.length === 0) return;
    setLoadingMore(true);
    await fetchPage(false);
    setLoadingMore(false);
  }

  // Pagination trigger on the last row.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) void loadMore(); });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users.length, reachedEnd, loadingMore]);

  async function block(u: FollowUser) {
    const previous = users;
    setUsers((p) => p.filter((x) => x.id !== u.id));
    try { await api.post(endpoints.blockUser(u.id), {}); } catch { setUsers(previous); }
  }
  async function report(u: FollowUser) {
    try { await api.post(endpoints.reportUser(u.id), {}); } catch { /* fire-and-forget; the UI already confirmed */ }
  }
  async function removeFollower(u: FollowUser) {
    const previous = users;
    setUsers((p) => p.filter((x) => x.id !== u.id));
    try { await api.post(endpoints.removeFollower(u.id), {}); } catch { setUsers(previous); }
  }

  const title = mode === "followers" ? "Followers" : "Following";

  return (
    <Page>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 hairline-b">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="grid place-items-center size-8 -ml-2 text-secondary hover:text-primary"><ChevronLeft size={20} /></button>
        <span className="t-headline-sm text-primary flex-1">{title}</span>
      </div>

      <div className="px-4 pt-4 max-w-2xl">
        {!hasLoaded ? (
          <SkeletonLedger rows={8} avatar={44} />
        ) : users.length === 0 ? (
          <EmptyState
            className="!mx-0 mt-10"
            icon={mode === "followers" ? <Users /> : <UserPlus />}
            title={mode === "followers" ? "No followers yet" : "Not following anyone yet"}
            subtitle={mode === "followers" ? "When people follow this account, they'll show up here." : "Players and fans they follow will show up here."}
          />
        ) : (
          <div className="ledger">
            {users.map((u) => (
              <FollowUserRow
                key={u.id}
                user={u}
                isSelf={!!user && user.id === u.id}
                canRemove={isOwnList && mode === "followers"}
                onBlock={() => setBlockTarget(u)}
                onReport={() => setReportTarget(u)}
                onRemove={() => void removeFollower(u)}
              />
            ))}
            {!reachedEnd ? <div ref={sentinel} className="h-px" /> : null}
            {loadingMore ? <div className="flex justify-center py-4"><Spinner /></div> : null}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!blockTarget}
        title={`Block @${blockTarget?.username ?? ""}?`}
        message="They won't be able to follow you or interact with you, and you won't see their content."
        confirmTitle="Block" destructive
        onConfirm={() => { if (blockTarget) void block(blockTarget); setBlockTarget(null); }}
        onCancel={() => setBlockTarget(null)}
      />
      <ConfirmDialog
        open={!!reportTarget}
        title={`Report @${reportTarget?.username ?? ""}?`}
        message="Our team will review this account. Thanks for helping keep the community safe."
        confirmTitle="Report" destructive
        onConfirm={() => { if (reportTarget) void report(reportTarget); setReportTarget(null); }}
        onCancel={() => setReportTarget(null)}
      />
    </Page>
  );
}

function FollowUserRow({ user, isSelf, canRemove, onBlock, onReport, onRemove }: { user: FollowUser; isSelf: boolean; canRemove: boolean; onBlock: () => void; onReport: () => void; onRemove: () => void }) {
  const { following, toggle } = useFollowState("user", user.id);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", key); };
  }, [menu]);
  return (
    <div className="ledger-row hover:bg-surface/40 transition-colors">
      <Link href={`/profile/${encodeURIComponent(user.id)}`} className="flex items-center gap-3 flex-1 min-w-0">
        <InitialAvatar name={user.username} imageURL={user.avatarURL} size={44} />
        <span className="flex flex-col min-w-0">
          <span className="t-body-md text-primary truncate">{user.username}</span>
          {user.favoriteGame ? <span className="t-label-sm text-muted">{gameLabel(user.favoriteGame)}</span> : null}
        </span>
      </Link>
      {!isSelf ? (
        <button type="button" onClick={() => void toggle()} aria-pressed={following} className={clsx("px-3.5 py-[7px] rounded-full t-label-md shrink-0 transition-colors", following ? "bg-surface text-secondary hover:text-primary" : "bg-violet-gradient text-white")}>
          {following ? "Following" : "Follow"}
        </button>
      ) : null}
      <span className="relative">
        <button type="button" aria-label="More" aria-haspopup="menu" onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }} className="grid place-items-center size-8 rounded-lg text-muted hover:text-primary hover:bg-card"><Ellipsis size={16} /></button>
        {menu ? (
          <div className="absolute right-0 top-9 z-20 min-w-44 ledger py-1" role="menu">
            <button type="button" role="menuitem" onClick={onBlock} className="flex items-center gap-2.5 w-full px-3 py-2.5 t-body-md text-error hover:bg-surface/60 text-left"><Hand size={15} />Block</button>
            <button type="button" role="menuitem" onClick={onReport} className="flex items-center gap-2.5 w-full px-3 py-2.5 t-body-md text-error hover:bg-surface/60 text-left"><ShieldAlert size={15} />Report</button>
            {canRemove ? <button type="button" role="menuitem" onClick={onRemove} className="flex items-center gap-2.5 w-full px-3 py-2.5 t-body-md text-error hover:bg-surface/60 text-left"><UserX size={15} />Remove Follower</button> : null}
          </div>
        ) : null}
      </span>
    </div>
  );
}
