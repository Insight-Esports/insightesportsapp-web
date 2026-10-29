// ProfileDetail — ProfileDetailView.swift: your own profile (/profile) and a
// public one (/profile/[id]). Header (avatar + Premium flair, game chips,
// follower / following counts), the RANK · POINTS · WIN % strip, the
// prediction record, followed teams/players, the points ledger and recent
// activity (own only). Public profiles get Follow · Message · a "•••" menu
// with Block / Report; your own gets a full-width Edit Profile button in
// the Message slot (ProfileView.swift, Oct 24).
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, BarChart3, Flame, ArrowUpRight, UserPlus, Flag } from "lucide-react";
import { api, ApiError, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { useReveal } from "@/lib/use-reveal";
import { normalizeUser, gameLabel, type Json } from "@/lib/types";
import { clsx, formatDate } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { AssetIcon, EmptyState, GamePill, InitialAvatar, Ledger, LedgerRow, LoadFailure, Page, Spinner, Toast } from "@/components/ui";
import { FlairAvatar, FlairName } from "@/components/ui/premium-flair";
import { SkeletonProfile } from "@/components/ui/skeletons";
import { NavBar, useGoBack } from "@/components/shell/NavBar";
import { ActionMenu, MoreButton, useActionMenu } from "@/features/moderation/ActionMenu";
import { BlockConfirm, personActions, unblockQuietly, type ModerationUser } from "@/features/moderation/dialogs";
import { ReportSheet, type ReportTarget } from "@/features/moderation/ReportSheet";
import { useIsBlocked } from "@/features/moderation/use-blocked";
import { startConversation, startConversationMessage } from "@/features/messages/start-conversation";
import { FollowButton } from "./FollowButton";
import {
  activityFromNotifications, compactLabel, normalizeFollowedEntities, normalizePredictionStats, normalizePublicProfile,
  normalizeTransactions, profileFromUser, rankPercentileText, streakLabel, winRateFraction, winRateLabel,
  type FollowedEntity, type PointTransaction, type ProfileActivity, type UserProfile,
} from "./types";

interface Loaded {
  /** 403: blocked either way (or otherwise hidden) — "This profile isn't available". */
  unavailable?: boolean;
  profile: UserProfile;
  followedTeams: FollowedEntity[];
  followedPlayers: FollowedEntity[];
  activity: ProfileActivity[];
  ledger: PointTransaction[];
}

async function loadProfile(userId: string | null, signal: AbortSignal): Promise<Loaded> {
  if (userId) {
    let raw: Json;
    try {
      raw = await api.get<Json>(endpoints.publicProfile(userId), { signal });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return { unavailable: true, profile: normalizePublicProfile({ id: userId }), followedTeams: [], followedPlayers: [], activity: [], ledger: [] };
      throw e;
    }
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
  const { user, isPremium } = useAppState();
  // Viewing your own id through the public route behaves like /profile.
  const ownId = userId !== null && user?.id === userId ? null : userId;
  const { data, loading, error, connectionProblem, reload } = useFetch((signal) => loadProfile(ownId, signal), [ownId, isPremium]);
  const [toast, setToast] = useState<string | null>(null);
  const [toastKind, setToastKind] = useState<"info" | "error" | "success">("info");
  const say = useCallback((m: string, kind: "info" | "error" | "success" = "info") => { setToast(m); setToastKind(kind); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  const isOwn = data?.profile.isCurrentUser ?? ownId === null;
  // "Player" only means pro players now; anyone's profile is "Profile".
  const title = "Profile";
  const unavailable = !!data?.unavailable;

  // ProfileLoadingState stays up until every profile request has answered
  // and the avatar + followed crests are warm; then the page appears whole.
  const revealed = useReveal(loading, () => [data?.profile.avatarURL, ...(data?.followedTeams ?? []).map((t) => t.imageURL), ...(data?.followedPlayers ?? []).map((p) => p.imageURL)]);

  return (
    <Page>
      <NavBar
        title={title}
        trailing={!isOwn && data && revealed && !unavailable ? (
          <ProfileMenu profile={data.profile} onFailed={(m) => say(m, "error")} />
        ) : null}
      />

      {!revealed && !error ? (
        <SkeletonProfile />
      ) : unavailable ? (
        <div className="pt-10"><EmptyState title="This profile isn't available" /></div>
      ) : error || !data ? (
        <div className="pt-6"><LoadFailure error={error ?? "This profile can't be shown right now."} connectionProblem={connectionProblem} onRetry={reload} /></div>
      ) : (
        <div className={clsx("grid grid-cols-[minmax(0,1fr)] gap-6 px-4 pt-4", isOwn && "lg:grid-cols-[minmax(0,1fr)_360px]")}>
          <div className="min-w-0 flex flex-col gap-5">
            <ProfileHeader profile={data.profile} isOwnProfile={isOwn} />

            {isOwn ? <EditProfileButton /> : <MessageButton userId={data.profile.id} onError={(m) => say(m, "error")} />}

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
      {/* The person is the subject here: the flair moves. */}
      <FlairAvatar user={profile} size={92} moving pad />
      <FlairName user={profile} moving className="text-[22px] font-bold max-w-full" nameClassName="text-primary" />
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

// ── Edit Profile (own profile, in the slot Message takes elsewhere) ───────
const SLOT_BUTTON = "flex items-center justify-center gap-2 py-2.5 rounded-xl bg-card border border-border-subtle text-primary t-label-md hover:bg-surface/60 transition-colors";
function EditProfileButton() {
  return (
    <Link href="/profile/edit" className={SLOT_BUTTON}>
      <Pencil size={14} className="text-violet" />
      Edit Profile
    </Link>
  );
}

// ── Message (POST /dm/conversations → the thread) ─────────────────────────
function MessageButton({ userId, onError }: { userId: string; onError: (message: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const row = await startConversation(userId);
      router.push(`/messages/${encodeURIComponent(row.id)}`);
    } catch (e) {
      onError(startConversationMessage(e));
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={() => void go()} disabled={busy} className={clsx(SLOT_BUTTON, "disabled:opacity-60")}>
      {busy ? <Spinner size={14} /> : <AssetIcon name="messages" height={15} />}
      Message
    </button>
  );
}

// ── "⋯" on someone else's profile: Report profile · Block / Unblock ──────
// (Moderation.swift). A block — from the menu or from the Report sheet —
// closes the profile.
function ProfileMenu({ profile, onFailed }: { profile: UserProfile; onFailed: (message: string) => void }) {
  const goBack = useGoBack();
  const menu = useActionMenu<"profile">();
  const blocked = useIsBlocked(profile.id);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [toBlock, setToBlock] = useState<ModerationUser | null>(null);
  const who = { id: profile.id, username: profile.username };
  const actions = personActions({
    user: who, blocked, isOwn: false, reportLabel: "Report profile",
    onReport: () => setReport({ kind: "profile", user: { id: profile.id, username: profile.username, avatarURL: profile.avatarURL, isPremium: profile.isPremium, premiumStyle: profile.premiumStyle, title: profile.title } }),
    onBlock: () => setToBlock(who),
    onUnblock: () => { void unblockQuietly(profile.id).then((ok) => { if (!ok) onFailed("Couldn't unblock. Check your connection and try again."); }); },
  });
  return (
    <span className="relative">
      <MoreButton label="More" size={18} className="size-8 rounded-lg text-secondary hover:text-primary hover:bg-card" {...menu.triggerProps("profile")} aria-expanded={!!menu.target} />
      <ActionMenu anchor={menu.anchor} actions={menu.target ? actions : []} onClose={menu.close} label="Profile actions" />
      <ReportSheet target={report} onClose={({ blocked: didBlock }) => { setReport(null); if (didBlock) goBack(); }} />
      <BlockConfirm user={toBlock} onCancel={() => setToBlock(null)} onBlocked={() => goBack()} onFailed={onFailed} />
    </span>
  );
}

export function ProfileNotFound() {
  return <div className="pt-10"><EmptyState title="This profile can't be shown" subtitle="It may have been removed, or it isn't available right now." /></div>;
}
