// api.ts — the browser half of APIClient.swift.
//
// Every screen calls api.get/post/... with a backend path (e.g. "/matches/live").
// Requests go to the Next.js server at /api/backend/<path>, which adds the
// secret api key + JWT and handles token refresh. Errors reproduce the iOS
// APIClientError messages so copy stays identical across platforms.

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiError extends Error {
  status: number;
  code: string | null;
  feature?: string;
  mode?: string;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
  get isUnauthorized() { return this.status === 401; }
  get isForbidden() { return this.status === 403; }
  get isNotFound() { return this.status === 404; }
  get isRateLimited() { return this.status === 429; }
  /** "we couldn't reach the server at all" vs an honest empty state */
  get isConnectionProblem() { return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504; }
}

let cachedIsPremium = false;
/** Mirror of UserDefaults "cachedIsPremium" (used only for 403 copy). */
export function setCachedPremium(v: boolean) { cachedIsPremium = v; }

type Listener = (e: { type: "session-ended" | "maintenance" | "update-required" | "feature-disabled" | "failure" | "success"; payload?: unknown }) => void;
const listeners = new Set<Listener>();
/** AppStatusService hooks (connection health, maintenance hints). */
export function onApiEvent(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }
function emit(type: Parameters<Listener>[0]["type"], payload?: unknown) { listeners.forEach((l) => l({ type, payload })); }

function codeOf(obj: Record<string, unknown> | null): string | null {
  if (!obj) return null;
  if (typeof obj.code === "string") return obj.code;
  const e = obj.error;
  if (e && typeof e === "object" && typeof (e as Record<string, unknown>).code === "string") return (e as Record<string, unknown>).code as string;
  if (typeof e === "string" && /^[A-Z0-9_]+$/.test(e)) return e;
  return null;
}
function messageOf(obj: Record<string, unknown> | null): string | null {
  const e = obj?.error;
  if (typeof e === "string" && e) return e;
  if (typeof obj?.message === "string" && obj.message) return obj.message;
  if (typeof obj?.serverMessage === "string") return obj.serverMessage as string;
  return null;
}

export async function request<T = unknown>(path: string, method: HttpMethod = "GET", body?: unknown, opts: { signal?: AbortSignal; raw?: boolean } = {}): Promise<T> {
  const url = "/api/backend" + (path.startsWith("/") ? path : "/" + path);
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: isForm || body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: opts.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    emit("failure", { offline: typeof navigator !== "undefined" && !navigator.onLine });
    throw new ApiError(0, "Can't reach Insight. Check your connection and try again.", "UNREACHABLE");
  }

  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

  if (res.status < 500) emit("success");

  if (res.ok) return (opts.raw ? text : json) as T;

  const code = codeOf(json);
  const msg = messageOf(json);
  switch (res.status) {
    case 401:
      if (code === "SESSION_ENDED" || code === "NO_SESSION") emit("session-ended");
      throw new ApiError(401, "Please log in again.", code);
    case 403:
      if (code === "DOMAIN_NOT_ALLOWED") { emit("session-ended"); throw new ApiError(403, msg ?? "This account can't use the web version.", code); }
      if (code) throw new ApiError(403, codedMessage(code, msg), code);
      throw new ApiError(403, cachedIsPremium ? "Couldn't verify your Pro access just now — refresh or try again." : "This feature requires Insight Pro.", null);
    case 404:
      if (code === "NO_KEY" || code === "USER_NOT_FOUND") throw new ApiError(404, codedMessage(code, msg), code);
      throw new ApiError(404, msg ?? "Content not found.", code);
    case 426:
      emit("update-required", msg);
      throw new ApiError(426, msg ?? "Update required.", code ?? "UPDATE_REQUIRED");
    case 429:
      throw new ApiError(429, "Too many attempts. Please wait a minute and try again.", "RATE_LIMITED");
    case 503: {
      const m = msg ?? "Temporarily unavailable.";
      if (code === "FEATURE_DISABLED") {
        const err = new ApiError(503, m, code);
        err.feature = typeof json?.feature === "string" ? (json.feature as string) : "unknown";
        err.mode = typeof json?.mode === "string" ? (json.mode as string) : "off";
        emit("feature-disabled", { feature: err.feature, mode: err.mode, message: m });
        throw err;
      }
      if (code === "MAINTENANCE") { emit("maintenance"); throw new ApiError(503, m, code); }
      emit("failure", { offline: false });
      throw new ApiError(503, `Server error (503). Try again later.`, code);
    }
    default:
      if (res.status >= 500) {
        emit("failure", { offline: false });
        throw new ApiError(res.status, msg ?? `Server error (${res.status}). Try again later.`, code);
      }
      throw new ApiError(res.status, msg ?? `Unexpected error (${res.status}).`, code);
  }
}

function codedMessage(code: string, fallback: string | null): string {
  switch (code) {
    case "CANNOT_MESSAGE_USER": return "You can't message this account.";
    case "YOU_BLOCKED_THIS_USER": return "You blocked this account.";
    case "NO_KEY": return "This user can't receive messages yet.";
    case "USER_NOT_FOUND": return "User not found.";
    case "SELF_MESSAGE": return "You can't message yourself.";
    default: return fallback ?? code.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export const api = {
  get: <T = unknown>(path: string, opts?: { signal?: AbortSignal }) => request<T>(path, "GET", undefined, opts),
  post: <T = unknown>(path: string, body: unknown = {}, opts?: { signal?: AbortSignal }) => request<T>(path, "POST", body, opts),
  put: <T = unknown>(path: string, body: unknown = {}) => request<T>(path, "PUT", body),
  patch: <T = unknown>(path: string, body: unknown = {}) => request<T>(path, "PATCH", body),
  delete: <T = unknown>(path: string) => request<T>(path, "DELETE"),
};

export function errorMessage(e: unknown, fallback = "Something went wrong."): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

const q = (v: string) => encodeURIComponent(v);
const p = (v: string) => encodeURIComponent(v);

/** APIEndpoint, one path builder per case. */
export const endpoints = {
  // Auth (web-local routes live under /api/auth; these go through the proxy)
  forgotPassword: "/auth/forgot-password",
  verifyResetCode: "/auth/verify-reset-code",
  setNewPassword: "/auth/set-new-password",
  resendOtp: "/auth/resend",
  verifyOtp: "/auth/verify-otp",
  // Matches
  liveMatches: "/matches/live",
  upcomingMatches: "/matches/upcoming",
  upcomingMatchesRange: (from: string, to: string) => `/matches/upcoming?from=${q(from)}&to=${q(to)}`,
  matchesByTournament: (name: string, limit = 50) => `/matches?tournament=${q(name)}&limit=${limit}`,
  completedMatches: (game: string | null, limit: number, offset: number, team?: string | null) => {
    let s = game ? `/matches/completed?game=${q(game)}&limit=${limit}&offset=${offset}` : `/matches/completed?limit=${limit}&offset=${offset}`;
    if (team) s += `&team=${q(team)}`;
    return s;
  },
  completedMatchesBefore: (game: string | null, limit: number, before: string, beforeId: string, team?: string | null) => {
    let s = `/matches/completed?limit=${limit}&before=${q(before)}&before_id=${q(beforeId)}`;
    if (game) s += `&game=${q(game)}`;
    if (team) s += `&team=${q(team)}`;
    return s;
  },
  completedMatchesRange: (from: string, to: string, game?: string | null, team?: string | null) => {
    let s = `/matches/completed?from=${q(from)}&to=${q(to)}&limit=500`;
    if (game) s += `&game=${q(game)}`;
    if (team) s += `&team=${q(team)}`;
    return s;
  },
  matchDetail: (id: string) => `/matches/${p(id)}`,
  matchStats: (id: string) => `/matches/${p(id)}/stats`,
  matchProgress: (id: string) => `/matches/${p(id)}/progress`,
  matchComments: (id: string) => `/matches/${p(id)}/comments`,
  // Live chat + polls
  chatMessages: (roomId: string) => `/chat/${p(roomId)}/messages`,
  pollsForMatch: (matchId: string) => `/polls/match/${p(matchId)}`,
  votePoll: (pollId: string) => `/polls/${p(pollId)}/vote`,
  // Players
  players: (game: string) => `/players?game=${q(game)}`,
  topPlayers: (game: string, role?: string | null, region?: string | null, query?: string | null, limit = 50, offset = 0) => {
    let s = `/players/top?game=${q(game)}&limit=${limit}&offset=${offset}`;
    if (role) s += `&role=${q(role)}`;
    if (region) s += `&region=${q(region)}`;
    if (query) s += `&q=${q(query)}`;
    return s;
  },
  popularPlayers: (game: string, limit = 10) => `/players/popular?game=${q(game)}&limit=${limit}`,
  playerFilters: (game: string) => `/players/filters?game=${q(game)}`,
  playerDetail: (id: string) => `/players/${p(id)}`,
  playerStats: (id: string) => `/players/${p(id)}/stats`,
  playerMatches: (id: string, limit = 10) => `/players/${p(id)}/matches?limit=${limit}`,
  playerMatchesBefore: (id: string, limit: number, before: string, beforeId: string) => `/players/${p(id)}/matches?limit=${limit}&before=${q(before)}&before_id=${q(beforeId)}`,
  searchPlayers: (game: string, query: string) => `/players/search?game=${q(game)}&q=${q(query)}`,
  playerComments: (id: string) => `/players/${p(id)}/comments`,
  predictionFilters: (playerId: string, game: string) => `/players/${p(playerId)}/prediction-filters?game=${q(game)}`,
  // Comments + moderation
  deleteComment: (id: string) => `/comments/${p(id)}`,
  reportComment: (id: string) => `/comments/${p(id)}/report`,
  blockUser: (id: string) => `/users/${p(id)}/block`,
  unblockUser: (id: string) => `/users/${p(id)}/block`,
  reportUser: (id: string) => `/users/${p(id)}/report`,
  // Follows
  follow: "/follow",
  unfollow: "/unfollow",
  followers: (userId: string, limit: number, offset: number) => `/users/${p(userId)}/followers?limit=${limit}&offset=${offset}`,
  following: (userId: string, limit: number, offset: number, type?: string | null) => `/users/${p(userId)}/following?limit=${limit}&offset=${offset}${type ? `&type=${q(type)}` : ""}`,
  removeFollower: (id: string) => `/users/me/followers/${p(id)}/remove`,
  followPlayer: (id: string) => `/follows/players/${p(id)}`,
  followTeam: (id: string) => `/follows/teams/${p(id)}`,
  // Leaderboard
  leaderboardPeriod: (period: string, limit: number, offset: number) => `/leaderboard/period?period=${q(period)}&limit=${limit}&offset=${offset}`,
  leaderboardMe: (period: string) => `/leaderboard/me?period=${q(period)}`,
  predictionStats: "/users/me/prediction-stats",
  transactions: (limit: number, offset: number) => `/users/me/transactions?limit=${limit}&offset=${offset}`,
  // Notifications
  notifications: (limit: number, offset: number) => `/notifications?limit=${limit}&offset=${offset}&include_read=true&all=true`,
  notificationsUnreadOnly: "/notifications?limit=100&offset=0&unread_only=true",
  notificationsUnreadCount: "/notifications/unread-count",
  notificationsRead: "/notifications/read",
  notificationsReadAll: "/notifications/read-all",
  notificationPreferences: "/users/me/notification-preferences",
  // Reports (premium)
  latestReport: "/reports/latest",
  savedReports: "/reports/saved",
  generateWeeklyReport: "/reports/generate",
  saveReport: (id: string) => `/reports/${p(id)}/save`,
  unsaveReport: (id: string) => `/reports/${p(id)}/unsave`,
  deleteReport: (id: string) => `/reports/${p(id)}`,
  // Payments
  paymentsStatus: "/payments/status",
  paymentsPortal: "/payments/portal",
  paymentsCheckout: "/payments/checkout",
  // Teams
  teams: (game: string, query?: string | null, limit = 50, offset = 0, tier?: number | null) => {
    let s = `/teams?game=${q(game)}&limit=${limit}&offset=${offset}`;
    if (query) s += `&q=${q(query)}`;
    if (tier != null) s += `&tier=${tier}`;
    return s;
  },
  popularTeams: (game: string | null, limit: number) => (game ? `/teams/popular?game=${q(game)}&limit=${limit}` : `/teams/popular?limit=${limit}`),
  teamDetail: (id: string) => `/teams/${p(id)}`,
  teamTitles: (id: string) => `/teams/${p(id)}/titles`,
  teamSides: (id: string, game: string) => `/teams/${p(id)}/sides?game=${q(game)}`,
  teamStats: (id: string, game: string) => `/teams/${p(id)}/stats?game=${q(game)}`,
  teamPlayers: (id: string) => `/teams/${p(id)}/players`,
  teamMapPool: (id: string, game: string) => `/teams/${p(id)}/map-pool?game=${q(game)}`,
  coach: (id: string) => `/coaches/${p(id)}`,
  // News
  news: (game: string) => `/news?game=${q(game)}`,
  // Search
  search: (query: string, game?: string | null) => (game ? `/search?query=${q(query)}&game=${q(game)}` : `/search?query=${q(query)}`),
  // Predictions
  analyzePrediction: "/predictions/analyze",
  playerOverview: (id: string, game: string) => `/predictions/player-overview/${p(id)}?game=${q(game)}`,
  teamOverview: (id: string, game: string) => `/predictions/team-overview/${p(id)}?game=${q(game)}`,
  headToHead: "/predictions/head-to-head",
  teamMapProfile: (id: string, game: string, map: string) => `/predictions/team-map/${p(id)}?game=${q(game)}&map=${q(map)}`,
  livePrediction: "/predictions/live",
  livePlayerPrediction: "/predictions/live-player",
  liveStatPrediction: "/predictions/live-stat",
  liveBreakdown: "/predictions/live-breakdown",
  // User
  userProfile: "/users/me",
  publicProfile: (id: string) => `/users/${p(id)}/profile`,
  updateProfile: "/users/me",
  updateAvatar: "/users/me/avatar",
  changeEmailStart: "/users/me/email/change-start",
  changeEmailVerify: "/users/me/email/change-verify",
  changePassword: "/users/me/password",
  blockedUsers: "/users/me/blocked",
  deleteAccount: "/users/me",
  // DMs
  dmConversations: (before?: string | null) => `/dm/conversations?limit=50${before ? `&before=${q(before)}` : ""}`,
  dmUnreadCount: "/dm/unread-count",
  dmSettings: "/dm/settings",
  dmPublishKey: "/dm/keys",
  dmKey: (userId: string, version?: number | null) => `/dm/keys/${p(userId)}${version != null ? `?version=${version}` : ""}`,
  dmCreateConversation: "/dm/conversations",
  dmMessages: (conversationId: string, before?: string | null, beforeId?: string | null) => {
    let s = `/dm/conversations/${p(conversationId)}/messages?limit=50`;
    if (before) s += `&before=${q(before)}`;
    if (beforeId) s += `&before_id=${q(beforeId)}`;
    return s;
  },
  dmSend: (conversationId: string) => `/dm/conversations/${p(conversationId)}/messages`,
  dmRead: (conversationId: string) => `/dm/conversations/${p(conversationId)}/read`,
  dmRemove: (conversationId: string) => `/dm/conversations/${p(conversationId)}`,
  dmBlock: "/dm/blocks",
  dmUnblock: (userId: string) => `/dm/blocks/${p(userId)}`,
  dmUploadCreate: "/dm/uploads",
  dmUpload: (id: string) => `/dm/uploads/${p(id)}`,
};
