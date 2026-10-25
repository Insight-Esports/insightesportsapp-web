// features/search/app-destinations.ts — AppDestinations.swift.
//
// Search finds the app itself: every tab, feature and settings page, matched
// locally and instantly against this catalogue.
//
//   Matching: at least 2 characters; the query and every title / keyword are
//   normalized (lowercase, accents stripped, punctuation → spaces); every typed
//   word must be the start of a word in the title or in a keyword.
//   Ranking:  +100 title equals the query, +50 title starts with the query,
//   +25 every typed word starts a title word. Ties keep catalogue order; at
//   most 6 are shown.
//
// Web-only notes: "Link Web" is iOS-only and skipped. "Badges" is left out
// until the web has a badge gallery route.
import {
  Bell, BellRing, CalendarDays, CalendarRange, ChartColumn, CircleHelp, CircleUser, Crown, FileChartColumn, FileText,
  Gamepad2, Hand, History, Lock, Mail, MessageCircle, Newspaper, Pencil, Radio, Settings, ShieldCheck, Sparkles,
  Swords, Target, Trophy, User, UserCheck, Users, UsersRound, type LucideIcon,
} from "lucide-react";
import { flowHref } from "@/features/predictions/flow";

/** tab → switches tab (→), screen → pushes a screen (›), web → opens the site in a new tab (↗). */
export type AppDestinationKind = "tab" | "screen" | "web";

export interface AppDestinationContext {
  /** The search screen's game filter when one is picked, otherwise the user's main game. */
  game: string;
  /** The signed-in user's id, for the followers / following lists. */
  meId: string | null;
}

export interface AppDestination {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  icon: LucideIcon;
  kind: AppDestinationKind;
  href: string | ((ctx: AppDestinationContext) => string);
}

const SITE = "https://insightesportsapp.com";
const me = (ctx: AppDestinationContext, list: "followers" | "following") =>
  ctx.meId ? `/profile/${encodeURIComponent(ctx.meId)}/${list}` : "/profile";

export const APP_DESTINATIONS: AppDestination[] = [
  { id: "live", title: "Live", subtitle: "Matches happening right now", icon: Radio, kind: "tab", href: "/",
    keywords: ["live matches", "now", "scores", "home", "stream", "watch", "chat", "win probability", "live predictor"] },
  { id: "schedule", title: "Schedule", subtitle: "Upcoming matches by day", icon: CalendarDays, kind: "tab", href: "/schedule",
    keywords: ["upcoming", "matches", "fixtures", "today", "tomorrow", "games"] },
  { id: "results", title: "Results", subtitle: "Finished matches, scores and VODs", icon: History, kind: "tab", href: "/results",
    keywords: ["past", "finished", "completed", "scores", "history", "watch back", "vod", "highlights"] },
  { id: "calendar", title: "Calendar", subtitle: "Browse matches by date", icon: CalendarRange, kind: "screen", href: "/schedule?view=calendar",
    keywords: ["dates", "days", "month", "schedule"] },
  { id: "players", title: "Players", subtitle: "Top players, ratings and roles", icon: User, kind: "tab", href: "/players",
    keywords: ["top players", "rankings", "ratings", "roles", "pros"] },
  { id: "teams", title: "Teams", subtitle: "Team rankings, regions and rosters", icon: Users, kind: "tab", href: "/teams",
    keywords: ["rankings", "tiers", "regions", "rosters"] },
  { id: "news", title: "News", subtitle: "Latest headlines and roster moves", icon: Newspaper, kind: "tab", href: "/news",
    keywords: ["articles", "stories", "roster moves", "transfers", "headlines"] },
  { id: "predictions", title: "Predictions", subtitle: "Build a stat prediction", icon: Target, kind: "tab", href: "/premium",
    keywords: ["premium", "predict", "prediction", "predictor", "stat predictor", "probability", "over under", "analyze", "pro"] },
  { id: "player-breakdown", title: "Player Breakdown", subtitle: "Career averages, map & agent splits, recent form", icon: ChartColumn, kind: "screen",
    href: (ctx) => flowHref.select(ctx.game, "player", true),
    keywords: ["stats", "averages", "career", "splits", "agents", "champions", "maps", "form", "analysis", "premium"] },
  { id: "team-breakdown", title: "Team Breakdown", subtitle: "Records, map profiles, head-to-head form", icon: Swords, kind: "screen",
    href: (ctx) => flowHref.select(ctx.game, "team", true),
    keywords: ["stats", "records", "maps", "head to head", "h2h", "form", "analysis", "premium"] },
  { id: "weekly-report", title: "Weekly Report", subtitle: "Your week, recapped", icon: FileChartColumn, kind: "screen", href: "/weekly-report",
    keywords: ["recap", "report", "summary", "week", "premium"] },
  { id: "premium", title: "Premium", subtitle: "Plans, perks and your subscription", icon: Crown, kind: "screen", href: "/premium/upgrade",
    keywords: ["pro", "upgrade", "subscribe", "subscription", "plans", "price", "perks", "manage", "cancel", "restore"] },
  { id: "profile", title: "Your Profile", subtitle: "Your stats, activity and points", icon: CircleUser, kind: "screen", href: "/profile",
    keywords: ["me", "my profile", "account", "stats", "activity", "points"] },
  { id: "edit-profile", title: "Edit Profile", subtitle: "Change your username and photo", icon: Pencil, kind: "screen", href: "/profile/edit",
    keywords: ["username", "name", "photo", "picture", "avatar", "change name"] },
  { id: "premium-style", title: "Premium Style", subtitle: "Customize your profile flair", icon: Sparkles, kind: "screen", href: "/profile/edit#premium-style",
    keywords: ["flair", "aura", "ring", "shine", "glow", "diamond", "gold", "silver", "bronze", "customize", "style"] },
  { id: "leaderboard", title: "Leaderboard", subtitle: "Monthly and all-time rankings", icon: Trophy, kind: "screen", href: "/leaderboard",
    keywords: ["rankings", "rank", "standings", "oracle", "points", "monthly", "all time", "prizes", "top"] },
  { id: "messages", title: "Messages", subtitle: "Your direct messages", icon: MessageCircle, kind: "screen", href: "/messages",
    keywords: ["dm", "dms", "direct messages", "chat", "inbox", "conversations", "text"] },
  { id: "notifications", title: "Notifications", subtitle: "Alerts and updates", icon: Bell, kind: "screen", href: "/notifications",
    keywords: ["alerts", "bell", "inbox", "updates"] },
  { id: "followers", title: "Followers", subtitle: "People who follow you", icon: UsersRound, kind: "screen", href: (ctx) => me(ctx, "followers"),
    keywords: ["fans", "friends", "people"] },
  { id: "following", title: "Following", subtitle: "People you follow", icon: UserCheck, kind: "screen", href: (ctx) => me(ctx, "following"),
    keywords: ["friends", "people", "follows"] },
  { id: "favorite-games", title: "Favorite Games", subtitle: "Your main game and favorites", icon: Gamepad2, kind: "screen", href: "/settings/games",
    keywords: ["games", "main game", "primary", "valorant", "cs2", "counter strike", "league", "lol", "preferences"] },
  { id: "settings", title: "Settings", subtitle: "Account, privacy and preferences", icon: Settings, kind: "screen", href: "/settings",
    keywords: ["account", "preferences", "privacy", "show activity", "following list", "who can message", "log out", "logout", "sign out", "delete account", "version"] },
  { id: "notification-settings", title: "Notification Settings", subtitle: "Push alerts and quiet hours", icon: BellRing, kind: "screen", href: "/settings/notifications",
    keywords: ["push", "alerts", "quiet hours", "do not disturb", "notification preferences"] },
  { id: "change-email", title: "Change Email", subtitle: "Update the email you sign in with", icon: Mail, kind: "screen", href: "/settings?panel=email",
    keywords: ["email", "login", "account"] },
  { id: "change-password", title: "Change Password", subtitle: "Update your password", icon: Lock, kind: "screen", href: "/settings?panel=password",
    keywords: ["password", "security", "login"] },
  { id: "blocked-users", title: "Blocked Users", subtitle: "Manage who you've blocked", icon: Hand, kind: "screen", href: "/settings/blocked",
    keywords: ["block", "blocked", "unblock", "privacy"] },
  { id: "support", title: "Support", subtitle: "Get help or report a problem", icon: CircleHelp, kind: "web", href: `${SITE}/support`,
    keywords: ["help", "contact", "bug", "problem", "faq", "feedback"] },
  { id: "terms", title: "Terms of Service", subtitle: "The rules for using Insight", icon: FileText, kind: "web", href: `${SITE}/terms`,
    keywords: ["tos", "legal", "terms"] },
  { id: "privacy", title: "Privacy Policy", subtitle: "How your data is handled", icon: ShieldCheck, kind: "web", href: `${SITE}/privacy`,
    keywords: ["privacy", "data", "legal"] },
];

export const MIN_APP_QUERY = 2;
export const MAX_APP_RESULTS = 6;

/** Lowercase, strip accents, punctuation (anything not a letter or digit) → spaces, collapse. */
export function normalizeAppQuery(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function words(s: string): string[] {
  const n = normalizeAppQuery(s);
  return n ? n.split(" ") : [];
}

interface Indexed { dest: AppDestination; title: string; titleWords: string[]; allWords: string[] }
let index: Indexed[] | null = null;
function indexed(): Indexed[] {
  if (!index) {
    index = APP_DESTINATIONS.map((dest) => {
      const titleWords = words(dest.title);
      return { dest, title: titleWords.join(" "), titleWords, allWords: [...titleWords, ...dest.keywords.flatMap(words)] };
    });
  }
  return index;
}

/** The ranked catalogue matches for a query: [] under 2 characters, at most 6. */
export function matchAppDestinations(query: string, limit = MAX_APP_RESULTS): AppDestination[] {
  const q = normalizeAppQuery(query);
  if (q.length < MIN_APP_QUERY) return [];
  const typed = q.split(" ");
  const scored: { dest: AppDestination; score: number; order: number }[] = [];
  indexed().forEach((entry, order) => {
    if (!typed.every((w) => entry.allWords.some((x) => x.startsWith(w)))) return;
    let score = 0;
    if (entry.title === q) score += 100;
    if (entry.title.startsWith(q)) score += 50;
    if (typed.every((w) => entry.titleWords.some((x) => x.startsWith(w)))) score += 25;
    scored.push({ dest: entry.dest, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map((s) => s.dest);
}

export function appDestinationHref(dest: AppDestination, ctx: AppDestinationContext): string {
  return typeof dest.href === "function" ? dest.href(ctx) : dest.href;
}
