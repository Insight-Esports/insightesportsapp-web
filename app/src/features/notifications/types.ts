// features/notifications/types.ts — InsightNotificationType (NotificationManager.swift)
// and the inbox row (NotificationsView.swift), decoded tolerantly.
import { iso, str, type Json } from "@/lib/types";

export type NotificationTypeId =
  | "prediction_resolved" | "poll_resolved" | "weekly_report" | "mid_match" | "prediction_window" | "streak_milestone"
  | "followed_live" | "followed_result" | "followed_starting_soon" | "followed_news" | "leaderboard_rank" | "leaderboard_reset"
  | "new_follower" | "direct_message" | "featured_match" | "final_score" | "featured_news" | "pre_game" | "followed_player_highlight" | "unknown";

export type NotificationTint = "violet" | "blue" | "gold" | "muted";

export interface NotificationTypeInfo {
  id: NotificationTypeId;
  title: string;
  subtitle: string;
  /** lucide icon name or a Karlo asset (weeklyreport / streakmilestone / messages) */
  icon: string;
  tint: NotificationTint;
  defaultEnabled: boolean;
}

const T = (id: NotificationTypeId, title: string, subtitle: string, icon: string, tint: NotificationTint, defaultEnabled = true): NotificationTypeInfo => ({ id, title, subtitle, icon, tint, defaultEnabled });

export const NOTIFICATION_TYPES: Record<NotificationTypeId, NotificationTypeInfo> = {
  prediction_resolved: T("prediction_resolved", "Prediction Results", "When your predictions hit or miss", "badge-check", "violet"),
  poll_resolved: T("poll_resolved", "Poll Results", "When a poll you voted in resolves", "bar-chart", "violet"),
  weekly_report: T("weekly_report", "Weekly Report", "When your weekly report is ready", "weeklyreport", "violet"),
  mid_match: T("mid_match", "Mid-Match Report", "A quick check-in partway through a match", "clock", "blue", false),
  prediction_window: T("prediction_window", "Prediction Reminders", "When predictions are about to close", "clock-alert", "muted", false),
  streak_milestone: T("streak_milestone", "Streak Milestones", "When you hit a win streak", "streakmilestone", "violet"),
  followed_live: T("followed_live", "Followed Team Live", "When a followed team goes live", "radio", "blue"),
  followed_result: T("followed_result", "Followed Match Results", "Final scores for followed matches", "trophy", "blue"),
  followed_starting_soon: T("followed_starting_soon", "Match Starting Soon", "When a followed match is about to start", "calendar-clock", "blue"),
  followed_news: T("followed_news", "Followed Player & Team News", "News about players & teams you follow", "newspaper", "muted"),
  leaderboard_rank: T("leaderboard_rank", "Leaderboard Rank Changes", "When your leaderboard rank changes", "trending-up", "gold"),
  leaderboard_reset: T("leaderboard_reset", "Monthly Reset Reminders", "Before the monthly leaderboard resets", "gift", "gold"),
  new_follower: T("new_follower", "New Followers", "When someone follows you", "user-plus", "muted", false),
  direct_message: T("direct_message", "Direct Messages", "When someone messages you", "messages", "muted"),
  featured_match: T("featured_match", "Big Matches", "Finals, playoffs, and marquee matchups", "star", "muted"),
  final_score: T("final_score", "Final Scores", "When a match in your games finishes", "flag", "blue"),
  featured_news: T("featured_news", "Big News", "Major stories across your games", "newspaper", "muted"),
  pre_game: T("pre_game", "Upcoming Matches", "A heads-up before any match in your games", "clock", "blue"),
  followed_player_highlight: T("followed_player_highlight", "Player Highlights", "When a player you follow has a standout game", "zap", "blue"),
  unknown: T("unknown", "Notification", "", "bell", "muted"),
};

export function notificationType(raw: string | null | undefined): NotificationTypeInfo {
  return raw && raw in NOTIFICATION_TYPES ? NOTIFICATION_TYPES[raw as NotificationTypeId] : NOTIFICATION_TYPES.unknown;
}

/** Rows the bell keeps as history. Heads-ups are push-only. */
export const BELL_ELIGIBLE = new Set<NotificationTypeId>([
  "followed_result", "final_score", "followed_player_highlight",
  "prediction_resolved", "poll_resolved", "streak_milestone",
  "leaderboard_rank", "leaderboard_reset", "new_follower",
  "weekly_report", "followed_news", "featured_news", "unknown",
]);

export const LEADERBOARD_TYPES: NotificationTypeId[] = ["leaderboard_rank", "leaderboard_reset"];

// ── Inbox row ─────────────────────────────────────────────────────────────
export interface NotificationItem {
  id: string;
  type: NotificationTypeInfo;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
  payloadId: string | null;
  refType: string | null;
}

export function normalizeNotification(raw: Json): NotificationItem | null {
  if (raw?.id == null) return null;
  const type = notificationType(str(raw.type));
  if (!BELL_ELIGIBLE.has(type.id)) return null;   // DMs live in Messages
  const readRaw = raw.is_read ?? raw.read;
  return {
    id: String(raw.id),
    type,
    title: str(raw.title) ?? type.title,
    body: str(raw.body) ?? "",
    createdAt: iso(raw.created_at) ?? new Date().toISOString(),
    isRead: readRaw === true || readRaw === "true" || readRaw === 1,
    payloadId: str(raw.ref_id),
    refType: str(raw.ref_type),
  };
}
export function normalizeNotifications(raw: Json): NotificationItem[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.notifications) ? raw.notifications : Array.isArray(raw?.data) ? raw.data : [];
  return arr.map(normalizeNotification).filter(Boolean) as NotificationItem[];
}

// ── Preferences (GET/PATCH /users/me/notification-preferences) ────────────
export interface NotificationPreferences {
  enabled: boolean;
  scope: "followed" | "all";
  types: Record<string, boolean>;
  quietHoursEnabled: boolean;
  quietStart: string; // HH:mm
  quietEnd: string;
  timezone: string | null;
  morningDigest: boolean;
}
export function normalizePreferences(raw: Json): NotificationPreferences {
  const types: Record<string, boolean> = {};
  if (raw?.types && typeof raw.types === "object") for (const [k, v] of Object.entries(raw.types)) types[k] = v === true || v === "true";
  return {
    enabled: raw?.enabled ?? true,
    scope: raw?.scope === "all" ? "all" : "followed",
    types,
    quietHoursEnabled: raw?.quiet_hours_enabled ?? raw?.quietHoursEnabled ?? false,
    quietStart: String(raw?.quiet_start ?? raw?.quietStart ?? "22:00:00").slice(0, 5),
    quietEnd: String(raw?.quiet_end ?? raw?.quietEnd ?? "08:00:00").slice(0, 5),
    timezone: str(raw?.timezone),
    morningDigest: raw?.morning_digest ?? raw?.morningDigest ?? true,
  };
}
