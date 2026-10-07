// types.ts — a port of ios/Models.swift.
//
// Backend JSON is snake_case and loosely typed (scores arrive as numbers,
// numeric strings or null; completed rows use start_time instead of
// scheduled_at). The iOS app decodes tolerantly so one odd row never
// empties a list; the normalize* helpers below do the same here.

// ── Game ──────────────────────────────────────────────────────────────────
export type GameId = "all" | "VALORANT" | "CS2" | "League";

export const GAMES: { id: GameId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "VALORANT", label: "VALORANT" },
  { id: "CS2", label: "CS2" },
  { id: "League", label: "LoL" },
];
/** Games a user can actually act on (everything except "All"). */
export const SELECTABLE_GAMES = GAMES.filter((g) => g.id !== "all");

export function gameLabel(game: string): string {
  return GAMES.find((g) => g.id === game)?.label ?? game;
}
/** Short pill label (GamePill): VAL · CS2 · LoL */
export function gamePillLabel(game: string): string {
  switch (game) {
    case "VALORANT": return "VAL";
    case "CS2": return "CS2";
    case "League": return "LoL";
    default: return game;
  }
}
/** One hue per game (GameTag.tint): VALORANT red, CS2 orange, League gold. */
export function gameTint(game: string): string {
  switch (game) {
    case "VALORANT": return "var(--live)";
    case "CS2": return "var(--team2)";
    case "League": return "var(--gold)";
    default: return "var(--violet)";
  }
}

// ── Match ─────────────────────────────────────────────────────────────────
export type MatchStatus = "live" | "upcoming" | "completed";

export interface Match {
  id: string;
  team1Name: string;
  team2Name: string;
  team1Score: number;
  team2Score: number;
  team1LogoURL: string | null;
  team2LogoURL: string | null;
  tournamentName: string | null;
  stage: string | null;
  game: string;
  status: MatchStatus;
  /** ISO string */
  scheduledAt: string;
  /** ISO string — when the game ENDED (results group by this). */
  completedAt: string | null;
  mapName: string | null;
  roundNumber: number | null;
  bestOf: number;
  viewerCount: number | null;
  team1ColorHex: string | null;
  team2ColorHex: string | null;
  team1Id: string | null;
  team2Id: string | null;
  team1InhibitorsUp: number | null;
  team2InhibitorsUp: number | null;
  team1WinProbability: number | null;
  team2WinProbability: number | null;
}

/** Results show/group by completion time, upcoming by start. */
export function matchResultTime(m: Match): string {
  return m.completedAt ?? m.scheduledAt;
}
/** "#"-tolerant team color with the legacy blue/orange fallback. */
export function team1Color(m: Pick<Match, "team1ColorHex">): string {
  return m.team1ColorHex ? "#" + m.team1ColorHex.replace("#", "") : "var(--team1)";
}
export function team2Color(m: Pick<Match, "team2ColorHex">): string {
  return m.team2ColorHex ? "#" + m.team2ColorHex.replace("#", "") : "var(--team2)";
}

// ── Tolerant primitives ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export function num(v: Json): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}
export function int(v: Json): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}
export function str(v: Json): string | null {
  return typeof v === "string" ? v : v == null ? null : String(v);
}
export function bool(v: Json, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}
export function iso(v: Json): string | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function normalizeMatch(raw: Json): Match {
  const statusRaw = String(raw?.status ?? "").toLowerCase();
  const status: MatchStatus =
    statusRaw === "live" || statusRaw === "upcoming" || statusRaw === "completed" ? statusRaw : "completed";
  return {
    id: String(raw.id),
    game: str(raw.game) ?? "VALORANT",
    team1Name: str(raw.team1_name) ?? "Team 1",
    team2Name: str(raw.team2_name) ?? "Team 2",
    team1Score: int(raw.team1_score) ?? 0,
    team2Score: int(raw.team2_score) ?? 0,
    team1LogoURL: str(raw.team1_logo_url),
    team2LogoURL: str(raw.team2_logo_url),
    tournamentName: str(raw.tournament_name),
    stage: str(raw.stage),
    status,
    scheduledAt: iso(raw.scheduled_at) ?? iso(raw.start_time) ?? new Date().toISOString(),
    completedAt: iso(raw.completed_at),
    mapName: str(raw.map_name),
    roundNumber: int(raw.round_number),
    bestOf: int(raw.best_of) ?? 3,
    viewerCount: int(raw.viewer_count),
    team1ColorHex: str(raw.team1_color),
    team2ColorHex: str(raw.team2_color),
    team1Id: str(raw.team1_id),
    team2Id: str(raw.team2_id),
    team1InhibitorsUp: int(raw.team1_inhibitors_up),
    team2InhibitorsUp: int(raw.team2_inhibitors_up),
    team1WinProbability: num(raw.team1_win_probability),
    team2WinProbability: num(raw.team2_win_probability),
  };
}
export function normalizeMatches(raw: Json): Match[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.matches) ? raw.matches : Array.isArray(raw?.data) ? raw.data : [];
  const out: Match[] = [];
  for (const r of arr) {
    try { if (r?.id != null) out.push(normalizeMatch(r)); } catch { /* skip bad row */ }
  }
  return out;
}

// ── Player ────────────────────────────────────────────────────────────────
export interface PlayerCareerStats {
  gamesPlayed: number | null;
  avgKills: number | null;
  avgDeaths: number | null;
  avgAssists: number | null;
  avgACS: number | null;
  avgRating: number | null;
  avgKDA: number | null;
  bestACS: number | null;
  bestRating: number | null;
  bestKDA: number | null;
  maxKills: number | null;
}
export function normalizeCareerStats(raw: Json): PlayerCareerStats | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    gamesPlayed: int(raw.games_played),
    avgKills: num(raw.avg_kills),
    avgDeaths: num(raw.avg_deaths),
    avgAssists: num(raw.avg_assists),
    avgACS: num(raw.avg_acs),
    avgRating: num(raw.avg_rating),
    avgKDA: num(raw.avg_kda),
    bestACS: num(raw.best_acs),
    bestRating: num(raw.best_rating),
    bestKDA: num(raw.best_kda),
    maxKills: int(raw.max_kills),
  };
}

export interface Player {
  id: string;
  name: string;
  realName: string | null;
  teamName: string | null;
  teamId: string | null;
  role: string | null;
  game: string;
  nationality: string | null;
  rating: number | null;
  imageURL: string | null;
  /** 'starter' / 'substitute' / 'inactive' — null = starter */
  rosterStatus: string | null;
  teamLogoURL: string | null;
  careerStats: PlayerCareerStats | null;
  totalGames: number | null;
}
export function normalizePlayer(raw: Json): Player {
  return {
    id: String(raw.id),
    name: str(raw.name) ?? "",
    realName: str(raw.real_name),
    teamName: str(raw.team_name),
    teamId: str(raw.team_id),
    role: str(raw.role),
    game: str(raw.game) ?? "",
    nationality: str(raw.nationality),
    rating: num(raw.rating),
    imageURL: str(raw.image_url),
    rosterStatus: str(raw.roster_status),
    teamLogoURL: str(raw.team_logo_url),
    careerStats: normalizeCareerStats(raw.career_stats),
    totalGames: int(raw.total_games),
  };
}
export function normalizePlayers(raw: Json): Player[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.players) ? raw.players : Array.isArray(raw?.data) ? raw.data : [];
  return arr.filter((r: Json) => r?.id != null).map(normalizePlayer);
}

// ── Coach ─────────────────────────────────────────────────────────────────
export interface TeamCoach {
  id: string | null;
  name: string | null;
  role: string | null;
  imageURL: string | null;
  since: string | null;
  nationality: string | null;
}
export function normalizeCoach(raw: Json): TeamCoach | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: str(raw.id), name: str(raw.name), role: str(raw.role),
    imageURL: str(raw.image_url), since: str(raw.since), nationality: str(raw.nationality),
  };
}
export interface CoachHistoryEntry {
  teamName: string | null;
  teamLogoURL: string | null;
  role: string | null;
  from: string | null;
  to: string | null;
}

// ── Team ──────────────────────────────────────────────────────────────────
export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  game: string;
  region: string | null;
  tier: number;
  wins: number;
  losses: number;
  winRate: number;
  logoURL: string | null;
  rating: number | null;
  ranking: number | null;
  coach: TeamCoach | null;
  seasonWins: number | null;
  seasonLosses: number | null;
}
export function teamRecord(t: Team): string {
  return `${t.wins}-${t.losses}`;
}
export function normalizeTeam(raw: Json): Team {
  const name = str(raw.name) ?? "";
  return {
    id: String(raw.id ?? name),
    name,
    abbreviation: str(raw.abbreviation) ?? name.slice(0, 3).toUpperCase(),
    game: str(raw.game) ?? "",
    region: str(raw.region),
    tier: int(raw.tier) ?? 3,
    wins: int(raw.wins) ?? 0,
    losses: int(raw.losses) ?? 0,
    winRate: num(raw.win_rate) ?? 0,
    logoURL: str(raw.logo_url),
    rating: num(raw.rating),
    ranking: int(raw.ranking),
    coach: normalizeCoach(raw.coach),
    seasonWins: int(raw.season_wins),
    seasonLosses: int(raw.season_losses),
  };
}
export function normalizeTeams(raw: Json): Team[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.teams) ? raw.teams : Array.isArray(raw?.data) ? raw.data : [];
  return arr.filter((r: Json) => r?.id != null || r?.name).map(normalizeTeam);
}
/** Minimal navigation handle from a match card (Team(name:game:logoURL:id:)). */
export function teamStub(name: string, game = "", logoURL: string | null = null, id: string | null = null): Team {
  return {
    id: id ?? name, name, abbreviation: name.slice(0, 3).toUpperCase(), game, region: null,
    tier: 3, wins: 0, losses: 0, winRate: 0, logoURL, rating: null, ranking: null,
    coach: null, seasonWins: null, seasonLosses: null,
  };
}

// ── Player stats ──────────────────────────────────────────────────────────
export interface PlayerStats {
  id: string;
  playerId: string;
  playerName: string;
  matchId: string;
  kills: number;
  deaths: number;
  assists: number;
  acs: number | null;
  adr: number | null;
  headshotPct: number | null;
  rating: number | null;
  kda: number | null;
  csPerMin: number | null;
  agent: string | null;
  mapName: string | null;
  plusMinus: number | null;
}
export function normalizePlayerStats(raw: Json): PlayerStats {
  return {
    id: String(raw.id),
    playerId: str(raw.player_id) ?? "",
    playerName: str(raw.player_name) ?? "",
    matchId: str(raw.match_id) ?? "",
    kills: int(raw.kills) ?? 0,
    deaths: int(raw.deaths) ?? 0,
    assists: int(raw.assists) ?? 0,
    acs: num(raw.acs),
    adr: num(raw.adr),
    headshotPct: num(raw.headshot_pct),
    rating: num(raw.rating),
    kda: num(raw.kda),
    csPerMin: num(raw.cs_per_min),
    agent: str(raw.agent),
    mapName: str(raw.map_name),
    plusMinus: int(raw.plus_minus),
  };
}

// ── News ──────────────────────────────────────────────────────────────────
export interface NewsArticle {
  id: string;
  title: string;
  description: string | null;
  url: string;
  imageURL: string | null;
  source: string;
  game: string | null;
  publishedAt: string;
  isPremium: boolean;
}
export function normalizeArticle(raw: Json): NewsArticle {
  return {
    id: String(raw.id ?? raw.url),
    title: str(raw.title) ?? "",
    description: str(raw.description),
    url: str(raw.url) ?? "",
    imageURL: str(raw.image_url),
    source: str(raw.source) ?? "",
    game: str(raw.game),
    publishedAt: iso(raw.published_at) ?? new Date().toISOString(),
    isPremium: bool(raw.is_premium),
  };
}

// ── Comments ──────────────────────────────────────────────────────────────
export interface PlayerComment {
  id: string;
  playerId: string;
  userId: string;
  username: string;
  avatarURL: string | null;
  body: string;
  createdAt: string;
  canDelete: boolean;
}
export function normalizeComment(raw: Json): PlayerComment {
  const author = raw.author && typeof raw.author === "object" ? raw.author : null;
  return {
    id: String(raw.id),
    body: str(raw.body) ?? "",
    playerId: str(raw.player_id) ?? "",
    userId: str(author?.id) ?? str(raw.user_id) ?? "",
    username: str(author?.username) ?? str(raw.username) ?? "user",
    avatarURL: str(author?.avatar_url) ?? str(raw.avatar_url),
    createdAt: iso(raw.created_at) ?? new Date().toISOString(),
    canDelete: bool(raw.can_delete, true),
  };
}

// ── Prediction ────────────────────────────────────────────────────────────
export interface Prediction {
  id: string;
  playerId: string;
  playerName: string;
  stat: string;
  baseline: number;
  probability: number;
  direction: string;
  reasoning: string;
  last10Average: number;
  careerAverage: number;
}

// ── User ──────────────────────────────────────────────────────────────────
export interface InsightUser {
  id: string;
  username: string;
  email: string;
  isPremium: boolean;
  /** points_balance (ledger) with legacy `points` fallback */
  tokenBalance: number;
  createdAt: string;
  avatarURL: string | null;
  avatarPending: boolean;
  followerCount: number;
  followingCount: number;
  primaryGame: string | null;
  favoriteGames: string[];
}
export function normalizeUser(raw: Json): InsightUser {
  return {
    id: String(raw.id),
    username: str(raw.username) ?? "",
    email: str(raw.email) ?? "",
    isPremium: bool(raw.is_premium ?? raw.isPremium),
    tokenBalance: int(raw.points_balance) ?? int(raw.points) ?? 0,
    createdAt: iso(raw.created_at) ?? new Date().toISOString(),
    avatarURL: str(raw.avatar_url) ?? str(raw.profilePictureUrl) ?? null,
    avatarPending: bool(raw.avatar_pending),
    followerCount: int(raw.follower_count) ?? 0,
    followingCount: int(raw.following_count) ?? 0,
    primaryGame: str(raw.primary_game),
    favoriteGames: Array.isArray(raw.favorite_games) ? raw.favorite_games.map(String) : ["VALORANT", "CS2", "League"],
  };
}

export interface AuthResponse {
  token: string;
  refreshToken: string | null;
  user: InsightUser;
}

// ── App status (/status, outside /api) ────────────────────────────────────
export interface AppStatus {
  version: number;
  maintenance: { active: boolean; message: string | null; eta: string | null };
  update: { min_version: string; latest_version: string | null; message: string | null };
  banner: { message: string; level?: string } | string | null;
  features: Record<string, { mode?: string; message?: string } | string | boolean>;
}
