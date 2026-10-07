// features/profile/types.ts — the profile wire rows (ProfileView.swift,
// FollowListView.swift, userController.getMyTransactions), decoded the
// same tolerant way as src/lib/types.ts.
import { bool, int, iso, num, str, type Json, type InsightUser } from "@/lib/types";

// ── UserProfile (ProfileView.swift) ───────────────────────────────────────
export interface PredictionStats {
  total: number;
  correct: number;
  streak: number;
}
export function winRateFraction(s: PredictionStats): number {
  return s.total > 0 ? s.correct / s.total : 0;
}
export function winRateLabel(s: PredictionStats): string {
  return s.total > 0 ? `${Math.trunc((s.correct / s.total) * 100)}%` : "—";
}
export function streakLabel(s: PredictionStats): string {
  return s.streak > 0 ? `W${s.streak}` : "—";
}

export interface UserProfile {
  id: string;
  username: string;
  isCurrentUser: boolean;
  isPremium: boolean;
  isFollowing: boolean;
  avatarURL: string | null;
  avatarPending: boolean;
  favoriteGame: string | null;
  favoriteTeam: string | null;
  joinedLabel: string | null;
  primaryGame: string | null;
  favoriteGames: string[];
  rankPercentile: string;
  points: number;
  followerCount: number;
  followingCount: number;
  predictionStats: PredictionStats;
}

/** "4.8k" / "820" (UserProfile.pointsLabel, ProfileHeader.countLabel) */
export function compactLabel(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export function normalizePredictionStats(raw: Json): PredictionStats {
  return { total: int(raw?.total) ?? 0, correct: int(raw?.correct) ?? 0, streak: int(raw?.streak) ?? 0 };
}

/** "Top 12%" from a number, a numeric string, or the server's own wording. */
export function rankPercentileText(raw: Json): string | null {
  const n = num(raw);
  if (n !== null) return n > 0 ? `Top ${Math.round(n)}%` : null;
  const s = str(raw);
  return s && s.trim() ? s : null;
}

/** GET /users/:id/profile (ProfileViewModel.PublicProfileDTO). */
export function normalizePublicProfile(raw: Json): UserProfile {
  return {
    id: String(raw.id),
    username: str(raw.username) ?? "",
    isCurrentUser: bool(raw.is_current_user),
    isPremium: bool(raw.is_premium),
    isFollowing: bool(raw.is_following),
    avatarURL: str(raw.avatar_url),
    avatarPending: false,
    favoriteGame: str(raw.favorite_game),
    favoriteTeam: str(raw.favorite_team),
    joinedLabel: joinedLabel(iso(raw.joined_at)),
    primaryGame: null,
    favoriteGames: [],
    rankPercentile: rankPercentileText(raw.rank_percentile) ?? "",
    points: int(raw.points) ?? 0,
    followerCount: int(raw.follower_count) ?? 0,
    followingCount: int(raw.following_count) ?? 0,
    predictionStats: normalizePredictionStats(raw.prediction_stats),
  };
}

/** ProfileViewModel.from(user, isCurrentUser: true). */
export function profileFromUser(user: InsightUser): UserProfile {
  return {
    id: user.id,
    username: user.username,
    isCurrentUser: true,
    isPremium: user.isPremium,
    isFollowing: false,
    avatarURL: user.avatarURL,
    avatarPending: user.avatarPending,
    favoriteGame: null,
    favoriteTeam: null,
    joinedLabel: joinedLabel(user.createdAt),
    primaryGame: user.primaryGame,
    favoriteGames: user.favoriteGames,
    rankPercentile: "—",
    points: user.tokenBalance,
    followerCount: user.followerCount,
    followingCount: user.followingCount,
    predictionStats: { total: 0, correct: 0, streak: 0 },
  };
}

function joinedLabel(isoDate: string | null): string | null {
  if (!isoDate) return null;
  return new Date(isoDate).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

// ── Follow rows (FollowListView.swift / FollowedEntityRow) ────────────────
export interface FollowUser {
  id: string;
  username: string;
  avatarURL: string | null;
  /** does the CURRENT viewer follow this user */
  isFollowing: boolean;
  favoriteGame: string | null;
}
export function normalizeFollowRow(raw: Json, fallbackFollowing = false): FollowUser | null {
  const id = str(raw?.target_id) ?? str(raw?.id);
  if (!id) return null;
  return {
    id,
    username: str(raw.username) ?? str(raw.name) ?? "—",
    avatarURL: str(raw.avatar_url) ?? str(raw.image_url) ?? str(raw.logo_url),
    isFollowing: typeof raw.is_following === "boolean" ? raw.is_following : fallbackFollowing,
    favoriteGame: str(raw.game),
  };
}
export function normalizeFollowRows(raw: Json, fallbackFollowing = false): FollowUser[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return arr.map((r: Json) => normalizeFollowRow(r, fallbackFollowing)).filter(Boolean) as FollowUser[];
}

/** A followed team or player on the profile (FollowedEntity). */
export interface FollowedEntity {
  id: string;
  name: string;
  game: string | null;
  imageURL: string | null;
}
export function normalizeFollowedEntities(raw: Json): FollowedEntity[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: FollowedEntity[] = [];
  for (const r of arr) {
    const id = str(r?.target_id) ?? str(r?.id);
    if (!id) continue;
    out.push({ id, name: str(r.name) ?? str(r.username) ?? "—", game: str(r.game), imageURL: str(r.avatar_url) ?? str(r.image_url) ?? str(r.logo_url) });
  }
  return out;
}

// ── Points ledger (GET /users/me/transactions) ────────────────────────────
export interface PointTransaction {
  id: string;
  pointsChange: number;
  reason: string | null;
  pollId: string | null;
  pollQuestion: string | null;
  game: string | null;
  createdAt: string;
}
export function normalizeTransactions(raw: Json): PointTransaction[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  const out: PointTransaction[] = [];
  for (const r of arr) {
    if (r?.id == null) continue;
    out.push({
      id: String(r.id),
      pointsChange: int(r.points_change) ?? int(r.amount) ?? 0,
      reason: str(r.reason),
      pollId: str(r.poll_id),
      pollQuestion: str(r.poll_question),
      game: str(r.game),
      createdAt: iso(r.created_at) ?? new Date().toISOString(),
    });
  }
  return out;
}

// ── Recent activity (ProfileViewModel.loadActivity) ───────────────────────
export interface ProfileActivity {
  id: string;
  icon: "check" | "x" | "chart" | "flame" | "arrow-up-right" | "user-plus" | "flag";
  tone: "success" | "error" | "violet" | "gold" | "secondary";
  title: string;
  timeAgo: string;
  value: string | null;
}

const ACTIVITY_TITLES: Record<string, string> = {
  prediction_resolved: "Prediction Results",
  poll_resolved: "Poll Results",
  streak_milestone: "Streak Milestones",
  leaderboard_rank: "Leaderboard Rank Changes",
  new_follower: "New Followers",
  followed_result: "Followed Match Results",
};

/** "+120 pts" / "−40" out of a body line, when present. */
function pointsIn(body: string): string | null {
  const m = body.match(/[+\-−]\s?\d+/);
  return m ? m[0].replace(/\s/g, "") : null;
}
function ago(isoDate: string | null): string {
  if (!isoDate) return "";
  const s = (Date.now() - new Date(isoDate).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(isoDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function activityFromNotifications(raw: Json): ProfileActivity[] {
  const arr = Array.isArray(raw) ? raw : [];
  const items: ProfileActivity[] = [];
  for (const r of arr) {
    const type = str(r?.type);
    if (!type || !(type in ACTIVITY_TITLES) || r?.id == null) continue;
    const text = str(r.title) ?? ACTIVITY_TITLES[type];
    const body = str(r.body) ?? "";
    const when = ago(iso(r.created_at));
    const pts = pointsIn(body);
    const id = String(r.id);
    switch (type) {
      case "prediction_resolved": {
        const won = /correct/i.test(body) || body.includes("+");
        items.push({ id, icon: won ? "check" : "x", tone: won ? "success" : "error", title: text, timeAgo: when, value: pts });
        break;
      }
      case "poll_resolved":
        items.push({ id, icon: "chart", tone: "violet", title: text, timeAgo: when, value: pts });
        break;
      case "streak_milestone":
        items.push({ id, icon: "flame", tone: "gold", title: text, timeAgo: when, value: null });
        break;
      case "leaderboard_rank":
        items.push({ id, icon: "arrow-up-right", tone: "violet", title: text, timeAgo: when, value: null });
        break;
      case "new_follower":
        items.push({ id, icon: "user-plus", tone: "secondary", title: text, timeAgo: when, value: null });
        break;
      case "followed_result":
        items.push({ id, icon: "flag", tone: "secondary", title: text, timeAgo: when, value: null });
        break;
    }
  }
  return items.slice(0, 12);
}
