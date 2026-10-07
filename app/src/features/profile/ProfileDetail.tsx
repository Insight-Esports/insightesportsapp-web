// ProfileDetail — ProfileDetailView.swift: your own profile (/profile) and a
// public one (/profile/[id]). Header (avatar, PRO, game chips, follower /
// following counts), the RANK · POINTS · WIN % strip, the prediction record,
// followed teams/players, the points ledger and recent activity (own only).
// Public profiles get Follow · Message · a "•••" menu with Block / Report.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SquarePen, Ellipsis, Check, X, BarChart3, Flame, ArrowUpRight, UserPlus, Flag, Hand, ShieldAlert } from "lucide-react";
import { api, endpoints, errorMessage } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { normalizeUser, gameLabel, type Json } from "@/lib/types";
import { clsx, formatDate } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { AssetIcon, ConfirmDialog, EmptyState, GamePill, InitialAvatar, Ledger, LedgerRow, LoadFailure, Page, SkeletonBar, Toast, ToolButton } from "@/components/ui";
import { FollowButton } from "./FollowButton";
import {
  activityFromNotifications, compactLabel, normalizeFollowedEntities, normalizePredictionStats, normalizePublicProfile,
  normalizeTransactions, profileFromUser, rankPercentileText, streakLabel, winRateFraction, winRateLabel,
  type FollowedEntity, type PointTransaction, type ProfileActivity, type UserProfile,
} from "./types";

interface Loaded {
  profile: UserProfile;
  followedTeams: FollowedEntity[];
  followedPlayers: FollowedEntity[];
  activity: ProfileActivity[];
  ledger: PointTransaction[];
}

async function loadProfile(userId: string | null, signal: AbortSignal): Promise<Loaded> {
  if (userId) {
    const raw = await api.get<Json>(endpoints.publicProfile(userId), { signal });
    return { profile: normalizePublicProfile(raw), followedTeams: [], followedPlayers: [], activity: [], ledger: [] };
  }
  const me = normalizeUser(await api.get<Json>(endpoints.userProfile, { signal }));
  const quiet = <T,>(p: Promise<T>) => p.catch(() => null);
  const [stats, rank, teams, players, feed, tx] = await Promise.all([
    quiet(api.get<Json>(endpoints.predictionStats, { signal })),
    quiet(api.get<Json>(endpoints.leaderboardMe("alltime"), { signal })),
    quiet(api.get<Json>(endpoints.following("me", 50, 0, "team"), { signal })),
    quiet(api.get<Json>(endpoints.following("me", 50, 0, "player"), { signal })),
    quiet(api.get<Json>(endpoints.notifications(25, 0), { signal })),
    quiet(api.get<Json>(endpoints.transactions(20, 0), { signal })),
  ]);
  const profile = profileFromUser(me);
  if (stats) profile.predictionStats = normalizePredictionStats(stats);
  const pct = rankPercentileText(rank?.percentile);
  if (pct) profile.rankPercentile = pct;
  return {
    profile,
    followedTeams: teams ? normalizeFollowedEntities(teams) : [],
    followedPlayers: players ? normalizeFollowedEntities(players) : [],
    activity: feed ? activityFromNotifications(feed) : [],
    ledger: tx ? normalizeTransactions(tx) : [],
  };
}

export function ProfileDetail({ userId = null }: { userId?: string | null }) {
  const router = useRouter();
  const { user, isPremium } = useAppState();
  // Viewing your own id through the public route behaves like /profile.
  const ownId = userId !== null && user?.id === userId ? null : userId;
  const { data, loading, error, connectionProblem, reload } = useFetch((signal) => loadProfile(ownId, signal), [ownId, isPremium]);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<"info" | "error" | "success">("info");
  const say = useCallback((m: string, kind: "info" | "error" | "success" = "info") => { setToast(m); setToastKind(kind); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  const isOwn = data?.profile.isCurrentUser ?? ownId === null;
  const title = isOwn ? "Profile" : "Player";

  return (
    <Page>
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 hairline-b">
        <span className="t-headline-sm text-primary flex-1">{title}</span>
        {isOwn ? (
          <ToolButton label="Edit Profile" onClick={() => router.push("/profile/edit")}><SquarePen size={18} /></ToolButton>
        ) : data ? (
          <ProfileMenu profile={data.profile} onDone={say} />
        ) : null}
      </div>

      {loading ? (
        <ProfileSkeleton />
      ) : error || !data ? (
        <div className="pt-6"><LoadFailure error={error ?? "This profile can't be shown right now."} connectionProblem={connectionProblem} onRetry={reload} /></div>
      ) : (
        <div className={clsx("grid gap-6 px-4 pt-4", isOwn && "lg:grid-cols-[minmax(0,1fr)_360px]")}>
          <div className="min-w-0 flex flex-col gap-5">
            <ProfileHeader profile={data.profile} isOwnProfile={isOwn} />

            {!isOwn ? (
              <Link href="/messages" className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-card border border-border-subtle text-primary t-label-md hover:bg-surface/60 transition-colors">
                <AssetIcon name="messages" height={15} />
                Message
              </Link>
            ) : null}

            <ProfileStatStrip profile={data.profile} />
            <PredictionStatsCard profile={data.profile} />

            {isOwn ? (
              <>
                <FollowedEntitySection title="Teams You Follow" targetType="team" items={data.followedTeams} />
                <FollowedEntitySection title="Players You Follow" targetType="player" items={data.followedPlayers} />
              </>
            ) : null}
            {data.profile.joinedLabel ? <span className="t-label-sm text-muted text-center">Joined {data.profile.joinedLabel}</span> : null}
          </div>

          {isOwn ? (
            <div className="min-w-0 flex flex-col gap-6">
              <PointsLedger items={data.ledger} />
              <ActivityFeed items={data.activity} />
            </div>
          ) : null}
        </div>
      )}
      <Toast message={toast} kind={toastKind} />
    </Page>
  );
}

// ── Header ────────────────────────────────────────────────────────────────
function ProfileHeader({ profile, isOwnProfile }: { profile: UserProfile; isOwnProfile: boolean }) {
  const games = profile.primaryGame ? [profile.primaryGame, ...profile.favoriteGames.filter((g) => g !== profile.primaryGame)] : profile.favoriteGames;
  const listBase = profile.isCurrentUser ? "/profile/me" : `/profile/${encodeURIComponent(profile.id)}`;
  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      <span className={clsx("inline-grid place-items-center rounded-full", profile.isPremium && "size-[104px] border-2 border-violet")}>
        <InitialAvatar name={profile.username} imageURL={profile.avatarURL} size={92} />
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[22px] font-bold text-primary">{profile.username}</span>
        {profile.isPremium ? <span className="text-[10px] font-bold tracking-[0.5px] text-gold">PRO</span> : null}
      </span>
      {profile.favoriteGame || profile.favoriteTeam ? (
        <span className="flex items-center gap-2">
          {profile.favoriteGame ? <GamePill game={profile.favoriteGame} /> : null}
          {profile.favoriteTeam ? <span className="px-2.5 py-[5px] rounded-full bg-surface text-secondary t-label-sm">{profile.favoriteTeam}</span> : null}
        </span>
      ) : null}
      <span className="flex items-center gap-6 pt-0.5">
        <Link href={`${listBase}/followers`} className="flex items-center gap-[5px] hover:opacity-80">
          <span className="t-label-lg text-primary">{compactLabel(profile.followerCount)}</span>
          <span className="t-label-md text-muted">Followers</span>
        </Link>
        <Link href={`${listBase}/following`} className="flex items-center gap-[5px] hover:opacity-80">
          <span className="t-label-lg text-primary">{compactLabel(profile.followingCount)}</span>
          <span className="t-label-md text-muted">Following</span>
        </Link>
      </span>
      {profile.isCurrentUser && games.length > 0 ? (
        <Link href="/settings/games" className="flex items-center gap-1.5" title="Favorite Games">
          {games.map((g) => (
            <span key={g} className={clsx("px-2.5 py-[5px] rounded-full t-label-sm", g === profile.primaryGame ? "bg-violet text-white" : "bg-surface text-secondary")}>{gameLabel(g)}</span>
          ))}
        </Link>
      ) : null}
      {!isOwnProfile ? <FollowButton targetType="user" targetId={profile.id} initialFollowing={profile.isFollowing} /> : null}
    </div>
  );
}

// ── RANK · POINTS · WIN % ─────────────────────────────────────────────────
function ProfileStatStrip({ profile }: { profile: UserProfile }) {
  return (
    <div className="ledger">
      <div className="grid grid-cols-3 px-3 py-1.5 bg-surface/40 hairline-b">
        {["RANK", "POINTS", "WIN %"].map((h) => <span key={h} className="t-label-sm text-muted text-center">{h}</span>)}
      </div>
      <div className="grid grid-cols-3 px-3 py-3">
        <span className="t-mono-md text-primary text-center">{profile.rankPercentile || "—"}</span>
        <span className="t-mono-md text-violet text-center">{compactLabel(profile.points)}</span>
        <span className="t-mono-md text-primary text-center">{winRateLabel(profile.predictionStats)}</span>
      </div>
    </div>
  );
}

// ── Prediction record ─────────────────────────────────────────────────────
function PredictionStatsCard({ profile }: { profile: UserProfile }) {
  const s = profile.predictionStats;
  return (
    <div className="flex flex-col gap-2.5">
      <KickerDot>PREDICTION RECORD</KickerDot>
      <div className="ledger">
        <div className="grid grid-cols-4 px-3 py-1.5 bg-surface/40 hairline-b">
          {["MADE", "CORRECT", "WIN %", "STREAK"].map((h) => <span key={h} className="t-label-sm text-muted text-center">{h}</span>)}
        </div>
        <div className="grid grid-cols-4 px-3 py-3">
          <span className="t-mono-md text-primary text-center">{s.total}</span>
          <span className="t-mono-md text-primary text-center">{s.correct}</span>
          <span className="t-mono-md text-violet text-center">{winRateLabel(s)}</span>
          <span className="t-mono-md text-primary text-center">{streakLabel(s)}</span>
        </div>
        <div className="h-[3px] bg-surface"><div className="h-full bg-violet" style={{ width: `${winRateFraction(s) * 100}%` }} /></div>
      </div>
    </div>
  );
}

function KickerDot({ children }: { children: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="size-1.5 rounded-full bg-violet" />
      <span className="t-kicker">{children}</span>
    </span>
  );
}

// ── Followed teams / players ──────────────────────────────────────────────
function FollowedEntitySection({ title, targetType, items }: { title: string; targetType: "team" | "player"; items: FollowedEntity[] }) {
  const [expanded, setExpanded] = useState(false);
  const collapsedCount = 3;
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, collapsedCount);
  return (
    <div className="flex flex-col gap-3">
      <span className="t-headline-sm text-primary">{title}</span>
      <Ledger>
        {visible.map((item) => (
          <div key={item.id} className="ledger-row">
            <Link href={targetType === "team" ? `/teams/${encodeURIComponent(item.id)}` : `/players/${encodeURIComponent(item.id)}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80">
              <InitialAvatar name={item.name} imageURL={item.imageURL} size={36} />
              <span className="flex flex-col min-w-0">
                <span className="t-body-md text-primary truncate">{item.name}</span>
                {item.game ? <span className="t-label-sm text-muted">{gameLabel(item.game)}</span> : null}
              </span>
            </Link>
            <FollowButton targetType={targetType} targetId={item.id} compact initialFollowing />
          </div>
        ))}
      </Ledger>
      {items.length > collapsedCount ? (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="self-start t-label-md text-violet hover:underline">
          {expanded ? "Show less" : `Show all (${items.length})`}
        </button>
      ) : null}
    </div>
  );
}

// ── Points ledger (GET /users/me/transactions) ────────────────────────────
function PointsLedger({ items }: { items: PointTransaction[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <KickerDot>POINTS LEDGER</KickerDot>
      {items.length === 0 ? (
        <span className="t-body-sm text-muted text-center py-5">No points activity yet</span>
      ) : (
        <Ledger>
          {items.map((t) => (
            <LedgerRow key={t.id}>
              <span className="flex flex-col flex-1 min-w-0">
                <span className="t-body-sm text-primary truncate">{t.reason ?? t.pollQuestion ?? "Points"}</span>
                <span className="t-label-sm text-muted truncate">
                  {[t.game ? gameLabel(t.game) : null, t.pollQuestion && t.reason ? t.pollQuestion : null, formatDate(t.createdAt)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className={clsx("t-mono-sm", t.pointsChange > 0 ? "text-success" : t.pointsChange < 0 ? "text-error" : "text-muted")}>
                {t.pointsChange > 0 ? `+${t.pointsChange}` : String(t.pointsChange)}
              </span>
            </LedgerRow>
          ))}
        </Ledger>
      )}
    </div>
  );
}

// ── Recent activity (timeline) ────────────────────────────────────────────
const TONE: Record<ProfileActivity["tone"], string> = {
  success: "text-success border-success", error: "text-error border-error", violet: "text-violet border-violet", gold: "text-gold border-gold", secondary: "text-secondary border-secondary",
};
function ActivityIcon({ icon }: { icon: ProfileActivity["icon"] }) {
  const p = { size: 13, strokeWidth: 2.4 };
  switch (icon) {
    case "check": return <Check {...p} />;
    case "x": return <X {...p} />;
    case "chart": return <BarChart3 {...p} />;
    case "flame": return <Flame {...p} />;
    case "arrow-up-right": return <ArrowUpRight {...p} />;
    case "user-plus": return <UserPlus {...p} />;
    case "flag": return <Flag {...p} />;
  }
}
function ActivityFeed({ items }: { items: ProfileActivity[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <KickerDot>RECENT ACTIVITY</KickerDot>
      {items.length === 0 ? (
        <span className="t-body-sm text-muted text-center py-5">No recent activity</span>
      ) : (
        <div className="flex flex-col">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-start py-1.5">
              <span className="relative w-6 self-stretch shrink-0">
                {i < items.length - 1 ? <span className="absolute left-[3.5px] top-3.5 bottom-[-12px] w-px bg-border-subtle" /> : null}
                <span className={clsx("absolute left-0 top-2 size-2 rounded-full bg-bg border-[1.2px]", TONE[item.tone].split(" ")[1])} />
              </span>
              <span className={clsx("grid place-items-center size-7 rounded-lg bg-surface mr-2.5 shrink-0", TONE[item.tone].split(" ")[0])}><ActivityIcon icon={item.icon} /></span>
              <span className="flex flex-col flex-1 min-w-0 gap-0.5">
                <span className="flex items-baseline gap-2">
                  <span className="t-body-sm text-primary line-clamp-2 flex-1">{item.title}</span>
                  {item.value ? <span className={clsx("t-mono-sm shrink-0", TONE[item.tone].split(" ")[0])}>{item.value}</span> : null}
                </span>
                <span className="t-label-sm text-muted">{item.timeAgo}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Block / Report menu on a public profile ───────────────────────────────
function ProfileMenu({ profile, onDone }: { profile: UserProfile; onDone: (m: string, kind?: "info" | "error" | "success") => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<"block" | "report" | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  async function run() {
    const which = confirm;
    setConfirm(null);
    if (!which) return;
    try {
      if (which === "block") {
        await api.post(endpoints.blockUser(profile.id), {});
        onDone(`Blocked @${profile.username}`, "success");
      } else {
        await api.post(endpoints.reportUser(profile.id), {});
        onDone("Thanks — our team will review this account.", "success");
      }
    } catch (e) {
      onDone(errorMessage(e), "error");
    }
  }

  return (
    <span className="relative">
      <ToolButton label="More" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}><Ellipsis size={18} /></ToolButton>
      {open ? (
        <div className="absolute right-0 top-9 z-20 min-w-40 ledger py-1" role="menu">
          <button type="button" role="menuitem" onClick={() => setConfirm("block")} className="flex items-center gap-2.5 w-full px-3 py-2.5 t-body-md text-error hover:bg-surface/60 text-left"><Hand size={15} />Block</button>
          <button type="button" role="menuitem" onClick={() => setConfirm("report")} className="flex items-center gap-2.5 w-full px-3 py-2.5 t-body-md text-error hover:bg-surface/60 text-left"><ShieldAlert size={15} />Report</button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm === "block"}
        title={`Block @${profile.username}?`}
        message="They won't be able to follow you or interact with you, and you won't see their content."
        confirmTitle="Block" destructive onConfirm={run} onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "report"}
        title={`Report @${profile.username}?`}
        message="Our team will review this account. Thanks for helping keep the community safe."
        confirmTitle="Report" destructive onConfirm={run} onCancel={() => setConfirm(null)}
      />
    </span>
  );
}

// ── Skeleton (ProfileLoadingState) ────────────────────────────────────────
function ProfileSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-14">
      <span className="size-[92px] rounded-full bg-surface" />
      <SkeletonBar width={140} height={20} />
      <span className="w-full h-[70px] rounded-xl bg-surface/70" />
      <span className="w-full h-[120px] rounded-xl bg-surface/70" />
    </div>
  );
}

export function ProfileNotFound() {
  return <div className="pt-10"><EmptyState title="This profile can't be shown" subtitle="It may have been removed, or it isn't available right now." /></div>;
}
