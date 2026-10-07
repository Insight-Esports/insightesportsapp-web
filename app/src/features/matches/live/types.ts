// features/matches/live/types.ts — a port of LiveMatchModels.swift +
// MatchCommentsView's MatchComment.
//
// Two layers, like the app: tolerant decoders for the backend payloads
// (/matches/:id, /stats, /progress, /chat, /polls) and the UI models the
// sections render. node-postgres serializes NUMERIC columns as strings
// ("268" not 268) and columns drift between migrations, so every numeric
// field goes through num/int (number OR string OR null). One mistyped
// column can never blank the scoreboard.

import { bool, int, iso, num, str, type Json, type Player } from "@/lib/types";

// ── /matches/:id/stats row ─────────────────────────────────────────────────
export interface MatchStatRow {
  playerId: string | null;
  playerName: string | null;
  imageURL: string | null;
  teamId: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  acs: number | null;
  adr: number | null;
  headshots: number | null;
  characterName: string | null;
  isAlive: boolean | null;
  position: string | null;
  csPerMin: number | null;
  goldEarned: number | null;
  visionScore: number | null;
  damageDealt: number | null;
  plusMinus: number | null;
  firstBloods: number | null;
  clutchWins: number | null;
  killsTSide: number | null;
  killsCTSide: number | null;
  kast: number | null;
  rating: number | null;
}

function flexBool(v: Json): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return ["true", "1", "yes"].includes(v.toLowerCase());
  return null;
}

export function normalizeStatRow(raw: Json): MatchStatRow {
  return {
    playerId: str(raw.player_id),
    playerName: str(raw.player_name),
    imageURL: str(raw.image_url),
    teamId: str(raw.team_id),
    kills: int(raw.kills),
    deaths: int(raw.deaths),
    assists: int(raw.assists),
    acs: int(raw.acs),
    adr: num(raw.adr),
    headshots: int(raw.headshots),
    characterName: str(raw.character_name),
    isAlive: flexBool(raw.is_alive),
    position: str(raw.position),
    csPerMin: num(raw.cs_per_min),
    goldEarned: int(raw.gold_earned),
    visionScore: int(raw.vision_score),
    damageDealt: int(raw.damage_dealt),
    plusMinus: int(raw.plus_minus),
    firstBloods: int(raw.first_bloods),
    clutchWins: int(raw.clutch_wins),
    killsTSide: int(raw.kills_t_side),
    killsCTSide: int(raw.kills_ct_side),
    kast: num(raw.kast),
    rating: num(raw.rating),
  };
}
export function normalizeStatRows(raw: Json): MatchStatRow[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.stats) ? raw.stats : Array.isArray(raw?.data) ? raw.data : [];
  return arr.filter((r: Json) => r && typeof r === "object").map(normalizeStatRow);
}

// ── /matches/:id/progress ──────────────────────────────────────────────────
export interface GoldTimelinePoint {
  minute: number;
  goldDiff: number; // team1 gold minus team2 gold
}
export function normalizeGoldTimeline(raw: Json): GoldTimelinePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: GoldTimelinePoint[] = [];
  for (const p of raw) {
    const m = num(p?.minute);
    const d = int(p?.diff ?? p?.gold_diff ?? p?.goldDiff);
    if (m !== null && d !== null) out.push({ minute: m, goldDiff: d });
  }
  return out.sort((a, b) => a.minute - b.minute);
}

export interface MatchProgress {
  matchId: string | null;
  game: string | null;
  status: string | null;
  team1Maps: number | null;
  team2Maps: number | null;
  team1Rounds: number | null;
  team2Rounds: number | null;
  currentRound: number | null;
  gameTimeSeconds: number | null;
  team1Gold: number | null;
  team2Gold: number | null;
  team1InhibitorsUp: number | null;
  team2InhibitorsUp: number | null;
  team1Alive: number | null;
  team2Alive: number | null;
  team1Id: string | null;
  team2Id: string | null;
  roundHistory: number[] | null;
  team1Side: string | null;
  team2Side: string | null;
  goldTimeline: GoldTimelinePoint[] | null;
}

export function normalizeProgress(raw: Json): MatchProgress {
  const score = raw?.score ?? {};
  const alive = raw?.playersAlive ?? raw?.players_alive ?? null;
  const sides = raw?.sides ?? null;
  const history = raw?.round_history ?? raw?.roundHistory;
  const timeline = raw?.gold_timeline ?? raw?.goldTimeline;
  return {
    matchId: str(raw?.matchId ?? raw?.match_id),
    game: str(raw?.game),
    status: str(raw?.status),
    team1Maps: int(score.team1Maps ?? score.team1_maps),
    team2Maps: int(score.team2Maps ?? score.team2_maps),
    team1Rounds: int(score.team1Rounds ?? score.team1_rounds),
    team2Rounds: int(score.team2Rounds ?? score.team2_rounds),
    currentRound: int(raw?.currentRound ?? raw?.current_round),
    gameTimeSeconds: int(raw?.gameTimeSeconds ?? raw?.game_time_seconds),
    team1Gold: int(raw?.team1_gold ?? raw?.team1Gold),
    team2Gold: int(raw?.team2_gold ?? raw?.team2Gold),
    team1InhibitorsUp: int(raw?.team1_inhibitors_up ?? raw?.team1InhibitorsUp),
    team2InhibitorsUp: int(raw?.team2_inhibitors_up ?? raw?.team2InhibitorsUp),
    team1Alive: alive ? int(alive.team1) : null,
    team2Alive: alive ? int(alive.team2) : null,
    team1Id: str(raw?.team1_id ?? raw?.team1Id),
    team2Id: str(raw?.team2_id ?? raw?.team2Id),
    roundHistory: Array.isArray(history) ? history.map((n: Json) => int(n) ?? 0) : null,
    team1Side: str(raw?.team1_side ?? sides?.team1),
    team2Side: str(raw?.team2_side ?? sides?.team2),
    goldTimeline: Array.isArray(timeline) ? normalizeGoldTimeline(timeline) : null,
  };
}

// ── /matches/:id (raw match row, the fields the detail screens use) ─────────
export interface MatchDetail {
  id: string | null;
  game: string | null;
  status: string | null;
  team1Id: string | null;
  team2Id: string | null;
  mapName: string | null;
  bestOf: number | null;
  team1Score: number | null;
  team2Score: number | null;
  team1MapScore: number | null;
  team2MapScore: number | null;
  gameTimeSeconds: number | null;
  team1DragonKills: number | null;
  team2DragonKills: number | null;
  team1BaronKills: number | null;
  team2BaronKills: number | null;
  team1TowerKills: number | null;
  team2TowerKills: number | null;
  team1Gold: number | null;
  team2Gold: number | null;
  team1InhibitorsUp: number | null;
  team2InhibitorsUp: number | null;
  roundHistory: number[] | null;
  goldTimeline: GoldTimelinePoint[] | null;
}
export function normalizeMatchDetail(raw: Json): MatchDetail {
  return {
    id: str(raw?.id),
    game: str(raw?.game),
    status: str(raw?.status),
    team1Id: str(raw?.team1_id),
    team2Id: str(raw?.team2_id),
    mapName: str(raw?.map_name),
    bestOf: int(raw?.best_of),
    team1Score: int(raw?.team1_score),
    team2Score: int(raw?.team2_score),
    team1MapScore: int(raw?.team1_map_score),
    team2MapScore: int(raw?.team2_map_score),
    gameTimeSeconds: int(raw?.game_time_seconds),
    team1DragonKills: int(raw?.team1_dragon_kills),
    team2DragonKills: int(raw?.team2_dragon_kills),
    team1BaronKills: int(raw?.team1_baron_kills),
    team2BaronKills: int(raw?.team2_baron_kills),
    team1TowerKills: int(raw?.team1_tower_kills),
    team2TowerKills: int(raw?.team2_tower_kills),
    team1Gold: int(raw?.team1_gold),
    team2Gold: int(raw?.team2_gold),
    team1InhibitorsUp: int(raw?.team1_inhibitors_up),
    team2InhibitorsUp: int(raw?.team2_inhibitors_up),
    roundHistory: Array.isArray(raw?.round_history) ? raw.round_history.map((n: Json) => int(n) ?? 0) : null,
    goldTimeline: Array.isArray(raw?.gold_timeline) ? normalizeGoldTimeline(raw.gold_timeline) : null,
  };
}

// ── Polls ──────────────────────────────────────────────────────────────────
export interface FanPollOption {
  id: string;
  label: string;
  votes: number;
}
export interface FanPoll {
  id: string;
  question: string;
  options: FanPollOption[];
  hasVoted: boolean;
  isActive: boolean;
  votedOptionId: string | null;
  lockedPayout: number | null;
  finalOdds: Record<string, number> | null;
  winningOptionId: string | null;
}

export function voteCountMap(raw: Json): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    const id = str(e?.optionId ?? e?.option_id);
    const c = int(e?.count);
    if (id && c !== null) out[id] = c;
  }
  return out;
}

function normalizeFinalOdds(raw: Json): Record<string, number> | null {
  if (!raw) return null;
  const out: Record<string, number> = {};
  if (Array.isArray(raw)) {
    for (const e of raw) {
      const id = str(e?.optionId ?? e?.option_id);
      const p = int(e?.percentage);
      if (id && p !== null) out[id] = p;
    }
    return out;
  }
  if (typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const p = int(v);
      if (p !== null) out[k] = p;
    }
    return out;
  }
  return null;
}

export function normalizePoll(dto: Json): FanPoll {
  const counts = voteCountMap(dto.voteCounts ?? dto.vote_counts);
  const options: FanPollOption[] = (Array.isArray(dto.options) ? dto.options : []).map((o: Json) => ({
    id: String(o.id),
    label: str(o.option_text ?? o.optionText) ?? "—",
    votes: counts[String(o.id)] ?? 0,
  }));
  const userVote = dto.userVote ?? dto.user_vote ?? null;
  const votedOptionId = userVote ? str(userVote.option_id ?? userVote.optionId) : null;
  const lockedPayoutRaw = userVote ? num(userVote.locked_payout ?? userVote.lockedPayout) : null;
  return {
    id: String(dto.id),
    question: str(dto.question) ?? "Who wins?",
    options,
    hasVoted: votedOptionId !== null,
    isActive: dto.status === "active",
    votedOptionId,
    lockedPayout: lockedPayoutRaw === null ? null : Math.round(lockedPayoutRaw),
    finalOdds: normalizeFinalOdds(dto.finalOdds ?? dto.final_odds),
    winningOptionId: str(dto.winningOptionId ?? dto.winning_option_id) ?? str(dto.correctOptionId ?? dto.correct_option_id),
  };
}

/** POST /polls/:id/vote — locked payout may arrive top-level or inside `vote`. */
export function resolvedLockedPayout(res: Json): number | null {
  const p = num(res?.lockedPayout ?? res?.locked_payout) ?? num(res?.vote?.lockedPayout ?? res?.vote?.locked_payout);
  return p === null ? null : Math.round(p);
}

// ── Chat ───────────────────────────────────────────────────────────────────
export interface LiveChatMessage {
  id: string;
  username: string;
  message: string;
  isPremium: boolean;
}
let fallbackId = 0;
export function normalizeChatMessage(raw: Json): LiveChatMessage {
  const id = raw?.id != null ? String(raw.id) : `local-${Date.now()}-${fallbackId++}`;
  return {
    id,
    username: str(raw?.username) ?? "user",
    message: str(raw?.text) ?? str(raw?.message) ?? "",
    isPremium: bool(raw?.is_premium ?? raw?.isPremium),
  };
}
export function normalizeChatHistory(raw: Json): LiveChatMessage[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.messages) ? raw.messages : [];
  return arr.filter((r: Json) => r && typeof r === "object").map(normalizeChatMessage);
}

// ── Match comments (persistent discussion) ─────────────────────────────────
export interface MatchComment {
  id: string;
  username: string;
  avatarURL: string | null;
  body: string;
  createdAt: string;
  canDelete: boolean;
}
export function normalizeMatchComment(raw: Json): MatchComment {
  const author = raw?.author && typeof raw.author === "object" ? raw.author : null;
  return {
    id: String(raw.id),
    username: str(author?.username) ?? str(raw.username) ?? "user",
    avatarURL: str(author?.avatar_url) ?? str(raw.avatar_url),
    body: str(raw.body) ?? "",
    createdAt: iso(raw.created_at) ?? new Date().toISOString(),
    canDelete: bool(raw.can_delete, false),
  };
}
export function normalizeMatchComments(raw: Json): MatchComment[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.comments) ? raw.comments : [];
  return arr.filter((r: Json) => r?.id != null).map(normalizeMatchComment);
}
/** POST response: { comment: {...} } or a bare comment. */
export function normalizeCreatedComment(raw: Json): MatchComment {
  return normalizeMatchComment(raw?.comment && typeof raw.comment === "object" ? raw.comment : raw);
}

// ── UI models ──────────────────────────────────────────────────────────────
export interface LiveRound {
  id: number;
  // 0 = not played yet, 1 = team1 won, 2 = team2 won,
  // 3 = played before the viewer joined (winner unknown — rendered neutral)
  winner: number;
  isCurrent: boolean;
}

export interface LeagueObjective {
  icon: "dragon" | "baren" | "tower2" | "inhibitor";
  label: string;
  team1Count: number;
  team2Count: number;
}

export interface LivePlayerStat {
  id: string; // real player UUID → /players/[id] works
  name: string;
  role: string;
  imageURL: string | null;
  isAlive: boolean | null;
  agent: string;
  kills: number;
  deaths: number;
  assists: number;
  plusMinus: number;
  // VALORANT
  acs: number | null;
  adr: number | null;
  headshotPct: number | null;
  firstBloods: number | null;
  clutches: number | null;
  // CS2 extras
  killsT: number | null;
  killsCT: number | null;
  kast: number | null;
  rating: number | null;
  // League
  kda: number | null;
  csPerMin: number | null;
  gold: number | null;
  goldPerMin: number | null;
  damage: number | null;
  damagePercent: number | null;
  vision: number | null;
  killParticipation: number | null;
}

/** Builds a UI stat line from a backend row (LivePlayerStat.from). */
export function statFromRow(row: MatchStatRow, game: string, gameTimeSeconds: number | null, teamKills: number, teamDamage: number): LivePlayerStat {
  const kills = row.kills ?? 0;
  const deaths = row.deaths ?? 0;
  const assists = row.assists ?? 0;

  let hsPct: number | null = null;
  if (row.headshots !== null && kills > 0) hsPct = (row.headshots / kills) * 100;

  let kda: number | null = null;
  let gpm: number | null = null;
  let dmgPct: number | null = null;
  let kp: number | null = null;
  if (game === "League") {
    kda = (kills + assists) / Math.max(deaths, 1);
    if (row.goldEarned !== null && gameTimeSeconds !== null && gameTimeSeconds > 60) gpm = Math.floor(row.goldEarned / (gameTimeSeconds / 60));
    if (row.damageDealt !== null && teamDamage > 0) dmgPct = (row.damageDealt / teamDamage) * 100;
    if (teamKills > 0) kp = ((kills + assists) / teamKills) * 100;
  }

  return {
    id: row.playerId ?? "", // NEVER fabricate — empty hides the comment bubble
    name: row.playerName ?? "—",
    role: row.position ?? "",
    imageURL: row.imageURL,
    isAlive: row.isAlive,
    agent: row.characterName ?? "",
    kills, deaths, assists,
    plusMinus: row.plusMinus ?? 0,
    acs: row.acs,
    adr: row.adr,
    headshotPct: hsPct,
    firstBloods: row.firstBloods,
    clutches: row.clutchWins,
    killsT: row.killsTSide,
    killsCT: row.killsCTSide,
    kast: row.kast,
    rating: row.rating,
    kda,
    csPerMin: row.csPerMin,
    gold: row.goldEarned,
    goldPerMin: gpm,
    damage: row.damageDealt,
    damagePercent: dmgPct,
    vision: row.visionScore,
    killParticipation: kp,
  };
}

/** Pre-game placeholder: a roster player with all stats at 0. */
export function placeholderStat(p: Player): LivePlayerStat {
  return {
    id: p.id, name: p.name, role: p.role ?? "", imageURL: p.imageURL, isAlive: null, agent: "",
    kills: 0, deaths: 0, assists: 0, plusMinus: 0,
    acs: null, adr: null, headshotPct: null, firstBloods: null, clutches: null,
    killsT: null, killsCT: null, kast: null, rating: null,
    kda: null, csPerMin: null, gold: null, goldPerMin: null, damage: null, damagePercent: null, vision: null, killParticipation: null,
  };
}

/** Splits stat rows by team (team1 = exact id matches, team2 = everyone else; halves when ids are unknown). */
export function splitStatRows(rows: MatchStatRow[], team1Id: string | null, team2Id: string | null, strict = false): [MatchStatRow[], MatchStatRow[]] {
  if (team1Id && team2Id) {
    if (strict) return [rows.filter((r) => r.teamId === team1Id), rows.filter((r) => r.teamId === team2Id)];
    return [rows.filter((r) => r.teamId === team1Id), rows.filter((r) => r.teamId !== team1Id)];
  }
  const half = Math.floor(rows.length / 2);
  return [rows.slice(0, half), rows.slice(half)];
}

export function mapTeamRows(rows: MatchStatRow[], game: string, gameTimeSeconds: number | null): LivePlayerStat[] {
  const teamKills = rows.reduce((s, r) => s + (r.kills ?? 0), 0);
  const teamDamage = rows.reduce((s, r) => s + (r.damageDealt ?? 0), 0);
  return rows.map((r) => statFromRow(r, game, gameTimeSeconds, teamKills, teamDamage));
}

export function formatGameTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function isRoundBasedGame(game: string): boolean {
  return game === "VALORANT" || game === "CS2";
}

/** "1.2K" / "832" / "—" (viewer count) */
export function viewerLabel(count: number | null): string {
  if (count === null) return "—";
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
}
