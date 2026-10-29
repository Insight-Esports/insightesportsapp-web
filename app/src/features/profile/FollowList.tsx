// FollowList — FollowListView.swift: Followers / Following, reached from the
// counts on a profile. Rows open that user's profile; a trailing "•••" menu
// (or a right-click) offers Report profile / Block @user (Unblock once
// blocked) / (own followers only) Remove Follower. Blocked people are
// hidden, and a block drops the row at once (Moderation.swift). Paginates.
"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { UserX, Users, UserPlus } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { gameLabel, type Json } from "@/lib/types";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { useReveal } from "@/lib/use-reveal";
import { EmptyState, Page, SkeletonLedger, Spinner, Toast } from "@/components/ui";
import { FlairAvatar, FlairName } from "@/components/ui/premium-flair";
import { NavBar } from "@/components/shell/NavBar";
import { normalizeFollowRows, type FollowUser } from "./types";
import { seedFollow, useFollowState } from "./follow-store";
import { ActionMenu, MoreButton, Portal, useActionMenu, type MenuAction, type RowMenuProps } from "@/features/moderation/ActionMenu";
import { BlockConfirm, personActions, unblockQuietly, type ModerationUser } from "@/features/moderation/dialogs";
import { ReportSheet, type ReportTarget } from "@/features/moderation/ReportSheet";
import { useBlockedIds } from "@/features/moderation/use-blocked";

export type FollowListMode = "followers" | "following";
const PAGE = 20;

export function FollowList({ mode, userId }: { mode: FollowListMode; userId: string }) {
  const { user } = useAppState();
  const isOwnList = userId === "me" || (!!user && user.id === userId);
  const targetId = isOwnList ? "me" : userId;

  const [users, setUsers] = useState<FollowUser[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [toBlock, setToBlock] = useState<ModerationUser | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const menu = useActionMenu<FollowUser>();
  const blocked = useBlockedIds();
  const shown = users.filter((u) => !blocked.has(u.id));
  const offsetRef = useRef(0);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

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

  // FollowListViewModel: "First page reveals complete: avatars warmed before publish."
  const revealed = useReveal(!hasLoaded, () => users.map((u) => u.avatarURL));

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
  }, [users.length, reachedEnd, loadingMore, revealed]);

  async function removeFollower(u: FollowUser) {
    const previous = users;
    setUsers((p) => p.filter((x) => x.id !== u.id));
    try { await api.post(endpoints.removeFollower(u.id), {}); } catch { setUsers(previous); }
  }

  const title = mode === "followers" ? "Followers" : "Following";
  const actionsFor = (u: FollowUser): MenuAction[] => {
    if (user && user.id === u.id) return [];
    const who = { id: u.id, username: u.username };
    const list = personActions({
      user: who, blocked: blocked.has(u.id), isOwn: false, reportLabel: "Report profile",
      onReport: () => setReport({ kind: "profile", user: { id: u.id, username: u.username, avatarURL: u.avatarURL, isPremium: u.isPremium, premiumStyle: u.premiumStyle, title: u.title } }),
      onBlock: () => setToBlock(who),
      onUnblock: () => { void unblockQuietly(u.id); },
    });
    if (isOwnList && mode === "followers") list.push({ key: "remove", label: "Remove Follower", icon: <UserX size={15} />, destructive: true, dividerBefore: true, onSelect: () => void removeFollower(u) });
    return list;
  };

  return (
    <Page>
      <NavBar title={title} />

      <div className="px-4 pt-4 max-w-2xl w-full mx-auto">
        {!revealed ? (
          <SkeletonLedger rows={8} avatar={44} />
        ) : shown.length === 0 ? (
          <EmptyState
            className="!mx-0 mt-10"
            icon={mode === "followers" ? <Users /> : <UserPlus />}
            title={mode === "followers" ? "No followers yet" : "Not following anyone yet"}
            subtitle={mode === "followers" ? "When people follow this account, they'll show up here." : "Players and fans they follow will show up here."}
          />
        ) : (
          <div className="ledger">
            {shown.map((u) => (
              <FollowUserRow
                key={u.id}
                user={u}
                isSelf={!!user && user.id === u.id}
                rowProps={menu.rowProps(u)}
                more={actionsFor(u).length ? <MoreButton className="size-8 rounded-lg" {...menu.triggerProps(u)} aria-expanded={menu.target?.id === u.id} /> : null}
              />
            ))}
            {!reachedEnd ? <div ref={sentinel} className="h-px" /> : null}
            {loadingMore ? <div className="flex justify-center py-4"><Spinner /></div> : null}
          </div>
        )}
      </div>

      <ActionMenu anchor={menu.anchor} actions={menu.target ? actionsFor(menu.target) : []} onClose={menu.close} label="Person actions" />
      {/* A block — from the menu or the Report sheet — drops the row (the blocked list hides it). */}
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <BlockConfirm user={toBlock} onCancel={() => setToBlock(null)} onBlocked={() => {}} onFailed={setToast} />
      <Portal><Toast message={toast} kind="error" /></Portal>
    </Page>
  );
}

function FollowUserRow({ user, isSelf, rowProps, more }: { user: FollowUser; isSelf: boolean; rowProps: RowMenuProps; more: ReactNode }) {
  const { following, toggle } = useFollowState("user", user.id);
  return (
    <div {...rowProps} className="ledger-row hover:bg-surface/40 transition-colors [-webkit-touch-callout:none]">
      <Link href={isSelf ? "/profile" : `/profile/${encodeURIComponent(user.id)}`} className="flex items-center gap-3 flex-1 min-w-0">
        {/* A list: the flair holds still. */}
        <FlairAvatar user={user} size={44} />
        <span className="flex flex-col min-w-0">
          <FlairName user={user} className="t-body-md" />
          {user.favoriteGame ? <span className="t-label-sm text-muted">{gameLabel(user.favoriteGame)}</span> : null}
        </span>
      </Link>
      {!isSelf ? (
        <button type="button" onClick={() => void toggle()} aria-pressed={following} className={clsx("px-3.5 py-[7px] rounded-full t-label-md shrink-0 transition-colors", following ? "bg-surface text-secondary hover:text-primary" : "bg-violet-gradient text-white")}>
          {following ? "Following" : "Follow"}
        </button>
      ) : null}
      {more}
    </div>
  );
}
