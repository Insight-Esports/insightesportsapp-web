// predictions/types.ts — the Codable models + catalogs from PredictionsView.swift,
// PredictionBreakdownView.swift and PredictionTeamViews.swift, decoded as
// tolerantly as the app does (NUMERIC columns arrive as strings, live
// responses vary in shape, one odd field never fails the whole decode).

import { bool, int, num, str, type Json } from "@/lib/types";

export type PredictionTargetType = "player" | "team";
export type PredictionDirection = "over" | "under";

export function directionLabel(d: PredictionDirection): string {
  return d === "under" ? "Under" : "Over";
}

// ── Stat whitelists — MUST match the backend exactly (predictionService.js) ──
export const PredictionStatCatalog = {
  playerStats(game: string): string[] {
    switch (game) {
      case "VALORANT": return ["kills", "deaths", "assists", "acs", "adr", "headshots", "plus_minus"];
      case "CS2": return ["kills", "deaths", "assists", "adr", "headshots", "plus_minus"];
      case "League": return ["kills", "deaths", "assists", "cs_per_min", "gold_earned", "vision_score", "plus_minus"];
      default: return [];
    }
  },
  teamStats(game: string): string[] {
    switch (game) {
      case "VALORANT": case "CS2": case "League": return ["kills", "plus_minus"];
      default: return [];
    }
  },
  label(stat: string): string {
    switch (stat) {
      case "kills": return "Kills";
      case "deaths": return "Deaths";
      case "assists": return "Assists";
      case "acs": return "ACS";
      case "adr": return "ADR";
      case "headshots": return "Headshots";
      case "plus_minus": return "+/−";
      case "cs_per_min": return "CS/min";
      case "gold_earned": return "Gold";
      case "vision_score": return "Vision Score";
      // Overview-only stat columns (player-overview endpoint)
      case "first_bloods": return "First Bloods";
      case "clutch_wins": return "Clutch Wins";
      case "kills_t_side": return "T-Side Kills";
      case "kills_ct_side": return "CT-Side Kills";
      case "damage_dealt": return "Damage";
      case "gold_diff_at_15": return "GD@15";
      default: return stat.charAt(0).toUpperCase() + stat.slice(1);
    }
  },
};

/** Friendlier display names for overview-only columns (PredictionBreakdownViewModel.displayLabel). */
export function overviewLabel(key: string): string {
  switch (key) {
    case "plusMinus": return "+/−";
    case "gold_diff_at_15": return "Gold Diff (15 min)";
    case "damage_dealt": return "Damage Dealt";
    case "first_bloods": return "First Bloods";
    case "clutch_wins": return "Clutch Wins";
    case "kills_t_side": return "T-Side Kills";
    case "cs": case "csPerMin": return "CS / min";
    case "gold": case "goldEarned": return "Gold";
    case "visionScore": return "Vision Score";
    case "kills_ct_side": return "CT-Side Kills";
    default: return PredictionStatCatalog.label(key);
  }
}

// Stats that only ever go up during a game (live line validation).
export const CUMULATIVE_STATS = new Set([
  "kills", "deaths", "assists", "first_bloods", "clutch_wins",
  "gold_earned", "damage_dealt", "vision_score", "kills_t_side", "kills_ct_side",
]);

// ── Map / agent / champion catalogs ───────────────────────────────────────
/** Current competitive pools (GameMaps — H2H + map profile; League has no map picker). */
export function gameMaps(game: string): string[] {
  switch (game) {
    case "VALORANT": return ["Ascent", "Bind", "Haven", "Split", "Lotus", "Sunset", "Icebox"];
    case "CS2": return ["Mirage", "Inferno", "Nuke", "Overpass", "Ancient", "Anubis", "Vertigo"];
    default: return [];
  }
}
/** Static fallback map filter list (PredictionStatPickerView.mapOptions). */
export function filterMaps(game: string): string[] {
  switch (game) {
    case "VALORANT": return ["Ascent", "Bind", "Haven", "Split", "Icebox", "Breeze", "Fracture", "Pearl", "Lotus", "Sunset", "Abyss"];
    case "CS2": return ["Mirage", "Inferno", "Nuke", "Overpass", "Vertigo", "Ancient", "Anubis", "Dust2"];
    default: return [];
  }
}
export const CHAMPION_OPTIONS: string[] = [
  "Aatrox","Ahri","Akali","Akshan","Alistar","Ambessa","Amumu","Anivia","Annie","Aphelios",
  "Ashe","Aurelion Sol","Aurora","Azir","Bard","Bel'Veth","Blitzcrank","Brand","Braum","Briar",
  "Caitlyn","Camille","Cassiopeia","Cho'Gath","Corki","Darius","Diana","Dr. Mundo","Draven","Ekko",
  "Elise","Evelynn","Ezreal","Fiddlesticks","Fiora","Fizz","Galio","Gangplank","Garen","Gnar",
  "Gragas","Graves","Gwen","Hecarim","Heimerdinger","Hwei","Illaoi","Irelia","Ivern","Janna",
  "Jarvan IV","Jax","Jayce","Jhin","Jinx","K'Sante","Kai'Sa","Kalista","Karma","Karthus",
  "Kassadin","Katarina","Kayle","Kayn","Kennen","Kha'Zix","Kindred","Kled","Kog'Maw","LeBlanc",
  "Lee Sin","Leona","Lillia","Lissandra","Lucian","Lulu","Lux","Malphite","Malzahar","Maokai",
  "Master Yi","Mel","Milio","Miss Fortune","Mordekaiser","Morgana","Naafiri","Nami","Nasus","Nautilus",
  "Neeko","Nidalee","Nilah","Nocturne","Nunu & Willump","Olaf","Orianna","Ornn","Pantheon","Poppy",
  "Pyke","Qiyana","Quinn","Rakan","Rammus","Rek'Sai","Rell","Renata Glasc","Renekton","Rengar",
  "Riven","Rumble","Ryze","Samira","Sejuani","Senna","Seraphine","Sett","Shaco","Shen",
  "Shyvana","Singed","Sion","Sivir","Skarner","Smolder","Sona","Soraka","Swain","Sylas",
  "Syndra","Tahm Kench","Taliyah","Talon","Taric","Teemo","Thresh","Tristana","Trundle","Tryndamere",
  "Twisted Fate","Twitch","Udyr","Urgot","Varus","Vayne","Veigar","Vel'Koz","Vex","Vi",
  "Viego","Viktor","Vladimir","Volibear","Warwick","Wukong","Xayah","Xerath","Xin Zhao","Yasuo",
  "Yone","Yorick","Yuumi","Zac","Zed","Zeri","Ziggs","Zilean","Zoe","Zyra",
];
export function filterAgents(game: string): string[] {
  switch (game) {
    case "VALORANT":
      return ["Jett", "Raze", "Reyna", "Phoenix", "Neon", "Yoru", "Iso",
        "Omen", "Brimstone", "Viper", "Astra", "Harbor", "Clove",
        "Sova", "Skye", "Breach", "KAY/O", "Fade", "Gekko",
        "Killjoy", "Cypher", "Sage", "Chamber", "Deadlock", "Vyse"];
    case "League": return CHAMPION_OPTIONS;
    default: return [];
  }
}

// ── Shared formatting (PredictionFormat) ──────────────────────────────────
export const PredictionFormat = {
  /** Big numbers drop decimals, whole numbers drop ".0", else one decimal. */
  stat(v: number): string {
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    if (Math.round(v) === v) return v.toFixed(0);
    return v.toFixed(1);
  },
  /** Compact value labels for tight chart spaces (14200 → "14.2k"). */
  compact(v: number): string {
    if (Math.abs(v) >= 1000) {
      const k = v / 1000;
      return Math.round(k) === k ? `${k.toFixed(0)}k` : `${k.toFixed(1)}k`;
    }
    return PredictionFormat.stat(v);
  },
  /** "Over 17.5 Kills" / "Under 8 CS/min". */
  line(direction: string | null | undefined, baseline: number, stat: string | null | undefined): string {
    const dir = direction === "under" ? "Under" : "Over";
    const label = stat ? PredictionStatCatalog.label(stat) : "";
    return `${dir} ${PredictionFormat.stat(baseline)} ${label}`;
  },
  /** Tiered probability: ≥1% whole, 0.1–1% one decimal, below "<0.1%"; never 100%. */
  percent(exact: number | null | undefined, confidence: number | null | undefined): string {
    if (exact != null) {
      if (exact > 99) return ">99%";
      if (exact >= 1) return `${Math.round(exact)}%`;
      if (exact >= 0.1) return `${exact.toFixed(1)}%`;
      return "<0.1%";
    }
    if (confidence != null) {
      if (confidence >= 100) return ">99%";
      return `${confidence}%`;
    }
    return "—";
  },
};

// ── /analyze · /live-player · /live-stat response ─────────────────────────
export interface PredictionGame {
  statValue: number;
  matchDate: string | null;
  mapName: string | null;
  agent: string | null;
  matchup: string | null;
  result: string | null;
}
export interface OutlierItem { name: string | null; avgStat: number | null; gamesPlayed: number | null; percentAbove: number | null; percentBelow: number | null }
export interface OutlierPair { positiveOutliers: OutlierItem[]; negativeOutliers: OutlierItem[] }
export interface PredictionOutliers { maps: OutlierPair | null; agents: OutlierPair | null }
export interface PredictionWinRate { last10Wins: number | null; last10Losses: number | null; last10WinRate: string | null; last10Summary: string | null; overallWinRate: string | null; recentWinRate: string | null }
export interface TeamStrength { score: number | null; totalGames: number | null; overallWinRate: number | null; recentWinRate: number | null; avgPlusMinus: number | null; opponentQuality: number | null }
export interface PredictionProjection { kind: string | null; value: number | null }
export function projectionLabel(p: PredictionProjection): string {
  switch ((p.kind ?? "").toLowerCase()) {
    case "total": return "Projected total";
    case "average": return "Projected avg";
    default: return "Projected";
  }
}

export interface PredictionResponse {
  targetType: string | null;
  player: string | null;
  team: string | null;
  game: string | null;
  stat: string | null;
  careerAverage: number | null;
  totalGamesAnalyzed: number | null;
  last10Games: PredictionGame[] | null;
  accuracyWarning: string | null;
  outliers: PredictionOutliers | null;
  statAggregation: string | null;
  winRate: PredictionWinRate | null;
  teamStrength: TeamStrength | null;
  baseline: number | null;
  direction: string | null;
  prediction: string | null;
  confidence: number | null;
  probabilityExact: number | null;
  probabilityDisplay: string | null;
  probabilityText: string | null;
  summary: string | null;
  trend: string | null;
  trendReason: string | null;
  last10Summary: string | null;
  last10Average: number | null;
  last10Hits: number | null;
  last10HitRate: number | null;
  lowHistory: boolean | null;
  historyWarning: string | null;
  liveCurrentValue: number | null;
  projection: PredictionProjection | null;
  opponentName: string | null;
  vsOpponentGames: PredictionGame[] | null;
  vsOpponentAverage: number | null;
  vsOpponentSummary: string | null;
  disclaimer: string | null;
}

function normalizeGame(raw: Json): PredictionGame {
  return {
    statValue: num(raw?.statValue) ?? 0,
    matchDate: str(raw?.matchDate), mapName: str(raw?.mapName), agent: str(raw?.agent),
    matchup: str(raw?.matchup), result: str(raw?.result),
  };
}
function normalizeGames(raw: Json): PredictionGame[] | null {
  return Array.isArray(raw) ? raw.filter((g) => g && typeof g === "object").map(normalizeGame) : null;
}
function normalizeOutlierItem(raw: Json): OutlierItem {
  return { name: str(raw?.name), avgStat: num(raw?.avgStat), gamesPlayed: int(raw?.gamesPlayed), percentAbove: int(raw?.percentAbove), percentBelow: int(raw?.percentBelow) };
}
function normalizeOutlierPair(raw: Json): OutlierPair | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    positiveOutliers: Array.isArray(raw.positiveOutliers) ? raw.positiveOutliers.map(normalizeOutlierItem) : [],
    negativeOutliers: Array.isArray(raw.negativeOutliers) ? raw.negativeOutliers.map(normalizeOutlierItem) : [],
  };
}
export function normalizeTeamStrength(raw: Json): TeamStrength | null {
  if (!raw || typeof raw !== "object") return null;
  return { score: num(raw.score), totalGames: int(raw.totalGames), overallWinRate: int(raw.overallWinRate), recentWinRate: int(raw.recentWinRate), avgPlusMinus: num(raw.avgPlusMinus), opponentQuality: int(raw.opponentQuality) };
}
const optBool = (v: Json): boolean | null => (typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : null);

export function normalizePrediction(raw: Json): PredictionResponse {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    targetType: str(r.targetType), player: str(r.player), team: str(r.team), game: str(r.game), stat: str(r.stat),
    careerAverage: num(r.careerAverage), totalGamesAnalyzed: int(r.totalGamesAnalyzed),
    last10Games: normalizeGames(r.last10Games), accuracyWarning: str(r.accuracyWarning),
    outliers: r.outliers && typeof r.outliers === "object" ? { maps: normalizeOutlierPair(r.outliers.maps), agents: normalizeOutlierPair(r.outliers.agents) } : null,
    statAggregation: str(r.statAggregation),
    winRate: r.winRate && typeof r.winRate === "object" ? { last10Wins: int(r.winRate.last10Wins), last10Losses: int(r.winRate.last10Losses), last10WinRate: str(r.winRate.last10WinRate), last10Summary: str(r.winRate.last10Summary), overallWinRate: str(r.winRate.overallWinRate), recentWinRate: str(r.winRate.recentWinRate) } : null,
    teamStrength: normalizeTeamStrength(r.teamStrength),
    baseline: num(r.baseline), direction: str(r.direction), prediction: str(r.prediction), confidence: int(r.confidence),
    probabilityExact: num(r.probabilityExact), probabilityDisplay: str(r.probabilityDisplay), probabilityText: str(r.probabilityText),
    summary: str(r.summary), trend: str(r.trend), trendReason: str(r.trendReason), last10Summary: str(r.last10Summary),
    last10Average: num(r.last10Average), last10Hits: int(r.last10Hits), last10HitRate: int(r.last10HitRate),
    lowHistory: optBool(r.lowHistory), historyWarning: str(r.historyWarning), liveCurrentValue: num(r.liveCurrentValue),
    projection: r.projection && typeof r.projection === "object" ? { kind: str(r.projection.kind), value: num(r.projection.value) } : null,
    opponentName: str(r.opponentName), vsOpponentGames: normalizeGames(r.vsOpponentGames), vsOpponentAverage: num(r.vsOpponentAverage),
    vsOpponentSummary: str(r.vsOpponentSummary), disclaimer: str(r.disclaimer),
  };
}

// ── Overview (/player-overview, /team-overview) ───────────────────────────
export type BreakdownPeriodKey = "last10" | "season" | "allTime";
export const BREAKDOWN_PERIODS: { key: BreakdownPeriodKey; label: string }[] = [
  { key: "last10", label: "Last 10" }, { key: "season", label: "Season" }, { key: "allTime", label: "All Time" },
];

export interface BestGame { opponent: string | null; date: string | null; mapName: string | null; result: string | null; stats: Record<string, number | null> | null }
export interface OverviewPeriod {
  label: string | null; gamesPlayed: number | null; wins: number | null; losses: number | null;
  winRate: string | null; record: string | null; avgStats: Record<string, number | null> | null;
  recentForm: string | null; bestGame: BestGame | null;
}
export interface NamedHighlight { name: string | null; games: number | null; winRate: string | null; avg: number | null }
export interface AgentBreakdownItem { agent: string | null; avgStat: number | null; gamesPlayed: number | null; wins: number | null; winRate: number | null; avgKDA: number | null; avgACS: number | null; avgRating: number | null; avgKills: number | null }
export interface PlayerMapBreakdownItem { mapName: string | null; avgStat: number | null; gamesPlayed: number | null }
export interface TeamMapBreakdownItem { mapName: string | null; gamesPlayed: number | null; wins: number | null; losses: number | null; winRate: number | null; avgPlusMinus: number | null }
export interface MapHighlight { mapName: string | null; winRate: string | null; gamesPlayed: number | null }
export interface SideStats { games: number | null; wins: number | null; losses: number | null; winRate: string | null }
export interface SideBreakdown { blue: SideStats | null; red: SideStats | null }

export interface PlayerOverview {
  player: string | null; team: string | null; role: string | null; region: string | null; game: string;
  statColumns: string[] | null; currentSeason: string | null;
  last10: OverviewPeriod | null; season: OverviewPeriod | null; allTime: OverviewPeriod | null;
  careerHighs: Record<string, number | null> | null; careerLows: Record<string, number | null> | null;
  seasonHighs: Record<string, number | null> | null; seasonLows: Record<string, number | null> | null;
  bestAgent: NamedHighlight | null; worstAgent: NamedHighlight | null; bestMap: NamedHighlight | null; worstMap: NamedHighlight | null;
  agentBreakdown: AgentBreakdownItem[]; mapBreakdown: PlayerMapBreakdownItem[]; disclaimer: string | null;
}
export interface TeamOverview {
  team: string | null; game: string; currentSeason: string | null;
  last10: OverviewPeriod | null; season: OverviewPeriod | null; allTime: OverviewPeriod | null;
  mapBreakdown: TeamMapBreakdownItem[]; bestMap: MapHighlight | null; worstMap: MapHighlight | null;
  sideBreakdown: SideBreakdown | null; disclaimer: string | null;
}

function numMap(raw: Json): Record<string, number | null> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number | null> = {};
  for (const k of Object.keys(raw)) out[k] = num(raw[k]);
  return out;
}
/** "62%", 62 or 0.62 → 0–100 (FlexPercent). */
export function flexPercent(v: Json): number | null {
  if (typeof v === "number") return v <= 1 ? v * 100 : v;
  if (typeof v === "string") {
    const cleaned = v.replace("%", "").trim();
    const d = Number(cleaned);
    if (!Number.isFinite(d) || cleaned === "") return null;
    return d <= 1 && !v.includes("%") ? d * 100 : d;
  }
  return null;
}
export function pctDisplay(v: number | null): string | null { return v == null ? null : `${Math.round(v)}%`; }

function normalizePeriod(raw: Json): OverviewPeriod | null {
  if (!raw || typeof raw !== "object") return null;
  const bg = raw.bestGame && typeof raw.bestGame === "object" ? raw.bestGame : null;
  return {
    label: str(raw.label), gamesPlayed: int(raw.gamesPlayed), wins: int(raw.wins), losses: int(raw.losses),
    winRate: str(raw.winRate), record: str(raw.record), avgStats: numMap(raw.avgStats), recentForm: str(raw.recentForm),
    bestGame: bg ? { opponent: str(bg.opponent), date: str(bg.date), mapName: str(bg.mapName), result: str(bg.result), stats: numMap(bg.stats) } : null,
  };
}
function normalizeHighlight(raw: Json): NamedHighlight | null {
  if (raw == null) return null;
  if (typeof raw === "string") return { name: raw, games: null, winRate: null, avg: null };
  if (typeof raw !== "object") return null;
  return { name: str(raw.name) ?? str(raw.agent) ?? str(raw.map) ?? str(raw.champion), games: int(raw.games), winRate: str(raw.winRate), avg: num(raw.avg) };
}
function normalizeSide(raw: Json): SideStats | null {
  if (!raw || typeof raw !== "object") return null;
  return { games: int(raw.games), wins: int(raw.wins), losses: int(raw.losses), winRate: str(raw.winRate) };
}
export function normalizeSideBreakdown(raw: Json): SideBreakdown | null {
  if (!raw || typeof raw !== "object") return null;
  return { blue: normalizeSide(raw.blue), red: normalizeSide(raw.red) };
}
export function normalizePlayerOverview(raw: Json): PlayerOverview {
  const r = raw ?? {};
  return {
    player: str(r.player), team: str(r.team), role: str(r.role), region: str(r.region), game: str(r.game) ?? "",
    statColumns: Array.isArray(r.statColumns) ? r.statColumns.map(String) : null, currentSeason: str(r.currentSeason),
    last10: normalizePeriod(r.last10), season: normalizePeriod(r.season), allTime: normalizePeriod(r.allTime),
    careerHighs: numMap(r.careerHighs), careerLows: numMap(r.careerLows), seasonHighs: numMap(r.seasonHighs), seasonLows: numMap(r.seasonLows),
    bestAgent: normalizeHighlight(r.bestAgent), worstAgent: normalizeHighlight(r.worstAgent), bestMap: normalizeHighlight(r.bestMap), worstMap: normalizeHighlight(r.worstMap),
    agentBreakdown: Array.isArray(r.agentBreakdown) ? r.agentBreakdown.map((a: Json) => ({
      agent: str(a.agent) ?? str(a.champion) ?? str(a.name), avgStat: num(a.avgStat) ?? num(a.avg_stat),
      gamesPlayed: int(a.gamesPlayed) ?? int(a.games_played) ?? int(a.games), wins: int(a.wins),
      winRate: flexPercent(a.winRate ?? a.win_rate), avgKDA: num(a.avgKDA) ?? num(a.avgKda) ?? num(a.avg_kda),
      avgACS: num(a.avgACS) ?? num(a.avgAcs) ?? num(a.avg_acs), avgRating: num(a.avgRating) ?? num(a.avg_rating), avgKills: num(a.avgKills) ?? num(a.avg_kills),
    })) : [],
    mapBreakdown: Array.isArray(r.mapBreakdown) ? r.mapBreakdown.map((m: Json) => ({ mapName: str(m.mapName), avgStat: num(m.avgStat), gamesPlayed: int(m.gamesPlayed) })) : [],
    disclaimer: str(r.disclaimer),
  };
}
export function normalizeTeamOverview(raw: Json): TeamOverview {
  const r = raw ?? {};
  const hl = (h: Json): MapHighlight | null => (h && typeof h === "object" ? { mapName: str(h.mapName), winRate: str(h.winRate), gamesPlayed: int(h.gamesPlayed) } : null);
  return {
    team: str(r.team), game: str(r.game) ?? "", currentSeason: str(r.currentSeason),
    last10: normalizePeriod(r.last10), season: normalizePeriod(r.season), allTime: normalizePeriod(r.allTime),
    mapBreakdown: Array.isArray(r.mapBreakdown) ? r.mapBreakdown.map((m: Json) => ({ mapName: str(m.mapName), gamesPlayed: int(m.gamesPlayed), wins: int(m.wins), losses: int(m.losses), winRate: flexPercent(m.winRate), avgPlusMinus: num(m.avgPlusMinus) })) : [],
    bestMap: hl(r.bestMap), worstMap: hl(r.worstMap), sideBreakdown: normalizeSideBreakdown(r.sideBreakdown), disclaimer: str(r.disclaimer),
  };
}

// ── Head-to-head · team map profile ───────────────────────────────────────
export interface H2HTeam { name: string | null; winProbability: number | null; color: string | null; probabilityDisplay: string | null; strength: TeamStrength | null; sides: SideBreakdown | null }
export interface H2HRecord { meetings: number | null; team1Wins: number | null; team2Wins: number | null; usedInPrediction: boolean }
export interface H2HMapBreakdown { map: string | null; team1Record: string | null; team2Record: string | null; usedInPrediction: boolean }
export interface HeadToHeadResponse {
  matchType: string | null; game: string | null; map: string | null;
  team1: H2HTeam | null; team2: H2HTeam | null; headToHead: H2HRecord | null; mapBreakdown: H2HMapBreakdown | null;
  summary: string | null; accuracyWarning: string | null; disclaimer: string | null;
}
function normalizeH2HTeam(raw: Json): H2HTeam | null {
  if (!raw || typeof raw !== "object") return null;
  return { name: str(raw.name), winProbability: int(raw.winProbability), color: str(raw.color), probabilityDisplay: str(raw.probabilityDisplay), strength: normalizeTeamStrength(raw.strength), sides: normalizeSideBreakdown(raw.sides) };
}
export function normalizeHeadToHead(raw: Json): HeadToHeadResponse {
  const r = raw ?? {};
  return {
    matchType: str(r.matchType), game: str(r.game), map: str(r.map),
    team1: normalizeH2HTeam(r.team1), team2: normalizeH2HTeam(r.team2),
    headToHead: r.headToHead && typeof r.headToHead === "object" ? { meetings: int(r.headToHead.meetings), team1Wins: int(r.headToHead.team1Wins), team2Wins: int(r.headToHead.team2Wins), usedInPrediction: bool(r.headToHead.usedInPrediction) } : null,
    mapBreakdown: r.mapBreakdown && typeof r.mapBreakdown === "object" ? { map: str(r.mapBreakdown.map), team1Record: str(r.mapBreakdown.team1Record), team2Record: str(r.mapBreakdown.team2Record), usedInPrediction: bool(r.mapBreakdown.usedInPrediction) } : null,
    summary: str(r.summary), accuracyWarning: str(r.accuracyWarning), disclaimer: str(r.disclaimer),
  };
}

export interface TeamMapProfile {
  team: string | null; game: string | null; map: string | null; gamesPlayed: number | null; record: string | null;
  wins: number | null; losses: number | null; winRate: string | null; winRateValue: number | null;
  avgStats: Record<string, number | null> | null; message: string | null; accuracyWarning: string | null; disclaimer: string | null;
}
export function normalizeTeamMapProfile(raw: Json): TeamMapProfile {
  const r = raw ?? {};
  return {
    team: str(r.team), game: str(r.game), map: str(r.map), gamesPlayed: int(r.gamesPlayed), record: str(r.record),
    wins: int(r.wins), losses: int(r.losses), winRate: str(r.winRate), winRateValue: num(r.winRateValue),
    avgStats: numMap(r.avgStats), message: str(r.message), accuracyWarning: str(r.accuracyWarning), disclaimer: str(r.disclaimer),
  };
}

// ── Prediction filters (played-only maps / agents / opponents) ────────────
export interface PredictionFilters { maps: string[]; agents: string[]; opponents: string[] }
export function normalizePredictionFilters(raw: Json): PredictionFilters {
  const names = (arr: Json): string[] => (Array.isArray(arr) ? arr.map((e) => (typeof e === "string" ? e : str(e?.name))).filter((n): n is string => !!n) : []);
  return { maps: names(raw?.maps), agents: names(raw?.agents), opponents: names(raw?.opponents) };
}

// ── Live match stat row (GET /matches/:id/stats — MatchStatRowDTO) ────────
export interface MatchStatRow {
  playerId: string | null; playerName: string | null; imageURL: string | null; teamId: string | null;
  kills: number | null; deaths: number | null; assists: number | null; acs: number | null; adr: number | null; headshots: number | null;
  characterName: string | null; position: string | null; csPerMin: number | null; goldEarned: number | null; visionScore: number | null;
  damageDealt: number | null; plusMinus: number | null; firstBloods: number | null; clutchWins: number | null; killsTSide: number | null; killsCTSide: number | null;
  kast: number | null; rating: number | null;
}
export function normalizeStatRow(raw: Json): MatchStatRow {
  return {
    playerId: str(raw.player_id), playerName: str(raw.player_name), imageURL: str(raw.image_url), teamId: str(raw.team_id),
    kills: int(raw.kills), deaths: int(raw.deaths), assists: int(raw.assists), acs: num(raw.acs), adr: num(raw.adr), headshots: int(raw.headshots),
    characterName: str(raw.character_name), position: str(raw.position), csPerMin: num(raw.cs_per_min), goldEarned: int(raw.gold_earned),
    visionScore: int(raw.vision_score), damageDealt: int(raw.damage_dealt), plusMinus: int(raw.plus_minus), firstBloods: int(raw.first_bloods),
    clutchWins: int(raw.clutch_wins), killsTSide: int(raw.kills_t_side), killsCTSide: int(raw.kills_ct_side), kast: num(raw.kast), rating: num(raw.rating),
  };
}
export function normalizeStatRows(raw: Json): MatchStatRow[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.stats) ? raw.stats : Array.isArray(raw?.data) ? raw.data : [];
  return arr.filter((r: Json) => r && typeof r === "object").map(normalizeStatRow);
}
/** The player's current value of a cumulative stat from a live row. */
export function liveStatValue(stat: string, row: MatchStatRow): number | null {
  switch (stat) {
    case "kills": return row.kills; case "deaths": return row.deaths; case "assists": return row.assists;
    case "first_bloods": return row.firstBloods; case "clutch_wins": return row.clutchWins; case "gold_earned": return row.goldEarned;
    case "damage_dealt": return row.damageDealt; case "vision_score": return row.visionScore;
    case "kills_t_side": return row.killsTSide; case "kills_ct_side": return row.killsCTSide;
    default: return null;
  }
}

// ── Live breakdown (/predictions/live-breakdown) ──────────────────────────
export interface LiveBreakdownResponse { text: string | null; lowHistory: boolean | null; historyWarning: string | null; disclaimer: string | null }
export function normalizeLiveBreakdown(raw: Json): LiveBreakdownResponse {
  const r = raw ?? {};
  const text = [str(r.summary), str(r.analysis), str(r.insight)].find((t) => !!t) ?? null;
  return { text, lowHistory: optBool(r.lowHistory), historyWarning: str(r.historyWarning), disclaimer: str(r.disclaimer) };
}

// ── The selected target carried through the flow (PredictionTargetItem) ──
export interface PredictionTargetItem {
  id: string; name: string; subtitle: string | null;
  isLive?: boolean; liveInfo?: string | null; liveKills?: number; matchId?: string | null; imageURL?: string | null;
}
