// statcard/model.ts — the player stat card's numbers (PlayerStatCard.swift):
// which stats a game shows and how each is written, what the card reads off
// a scoreboard line, the player's "usual" and how this game reads against it.
//
// "Usual" is the player's last 20 games before this one, counted by the
// weekly report's rules (backend services/reportDataService.js): a game
// counts when it has a winner and a combined score of six or more, and under
// three such games there is no usual. The read is about the game's headline
// stat: ACS in VALORANT, ADR in CS2, KDA in League.

import { int, num, str, type Json, type Match } from "@/lib/types";
import { liveSeriesInfo } from "@/features/tournaments/series/series-logic";
import type { LivePlayerStat, MatchStatRow } from "@/features/matches/live/types";

// ── Stats ───────────────────────────────────────────────────────────────────
export type CardStat =
  | "kills" | "deaths" | "assists"
  | "kda" | "acs" | "adr" | "rating" | "kast" | "headshots" | "plusMinus" | "firstBloods" | "clutches"
  | "csPerMin" | "gold" | "damage" | "damageShare" | "killParticipation" | "vision";

const LABELS: Record<CardStat, string> = {
  kills: "Kills", deaths: "Deaths", assists: "Assists", kda: "KDA", acs: "ACS", adr: "ADR", rating: "Rating", kast: "KAST",
  headshots: "HS%", plusMinus: "+/−", firstBloods: "First bloods", clutches: "Clutches", csPerMin: "CS/min", gold: "Gold",
  damage: "Damage", damageShare: "DMG%", killParticipation: "KP%", vision: "Vision score",
};
export const statLabel = (s: CardStat) => LABELS[s];

/** Fewer is the better side. */
export const lowerIsBetter = (s: CardStat) => s === "deaths";

/** A rate: it reads the same halfway through a game as at the end, so a live game can be held against finished ones. */
export const holdsMidGame = (s: CardStat) => s === "kda" || s === "acs" || s === "adr" || s === "rating" || s === "kast" || s === "csPerMin";

/** "+12", "−3", and a plain "0": a real minus sign, and no sign on nothing. */
export function signed(v: number, decimals: number): string {
  const body = Math.abs(v).toFixed(decimals);
  if (Number(body) === 0) return body;
  return (v < 0 ? "−" : "+") + body;
}
/** "12.4k" from a thousand up, as the scoreboard writes gold and damage. */
const thousands = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
/** "78%", cut where the scoreboard cuts it. */
const percent = (v: number) => `${Math.trunc(v)}%`;

/** The number as the scoreboard writes it. */
export function statText(s: CardStat, v: number): string {
  if (!Number.isFinite(v)) return "–";
  switch (s) {
    case "kills": case "deaths": case "assists": case "firstBloods": case "clutches": case "vision": return String(Math.round(v));
    case "acs": case "adr": return v.toFixed(0);
    case "kda": case "csPerMin": return v.toFixed(1);
    case "rating": return v.toFixed(2);
    case "kast": case "headshots": case "damageShare": case "killParticipation": return percent(v);
    case "plusMinus": return signed(v, 0);
    case "gold": case "damage": return thousands(v);
  }
}

/** Their average of it: a count gets one decimal, the rest read as above. */
export function usualText(s: CardStat, v: number): string {
  if (!Number.isFinite(v)) return "–";
  if (s === "kills" || s === "deaths" || s === "assists" || s === "vision") return v.toFixed(1);
  if (s === "plusMinus") return signed(v, 1);
  return statText(s, v);
}

/** The gap to their average, signed, as precise as the average. */
export function deltaText(s: CardStat, d: number): string {
  if (!Number.isFinite(d)) return "–";
  switch (s) {
    case "acs": case "adr": case "kast": return signed(d, 0);
    case "rating": return signed(d, 2);
    case "gold": case "damage":
      if (Math.abs(d) < 1000) return signed(d, 0);
      return (d < 0 ? "−" : "+") + `${(Math.abs(d) / 1000).toFixed(1)}k`;
    default: return signed(d, 1);
  }
}

/** What the card shows for a game, in order. */
export interface CardLayout {
  /** The headline stat, and the one the read is about. */
  marquee: CardStat;
  /** Under the big four. */
  more: CardStat[];
  /** Beside their usual, marquee first. */
  compared: CardStat[];
}
export function layoutOf(game: string): CardLayout {
  switch (game) {
    case "CS2":
      return { marquee: "adr", more: ["rating", "kast", "headshots", "plusMinus", "firstBloods", "clutches"], compared: ["adr", "rating", "kills", "deaths", "assists", "kast", "plusMinus"] };
    case "League":
      return { marquee: "kda", more: ["csPerMin", "gold", "damage", "damageShare", "killParticipation", "vision"], compared: ["kda", "kills", "deaths", "assists", "csPerMin", "gold", "vision"] };
    default:
      return { marquee: "acs", more: ["adr", "kast", "headshots", "plusMinus", "firstBloods", "clutches"], compared: ["acs", "kills", "deaths", "assists", "adr", "kast", "plusMinus"] };
  }
}

export type CardValues = Partial<Record<CardStat, number>>;

/** The line has numbers of its own. A lineup row standing in before the first stats (placeholderStat) has none, and opens the player's page instead of a card. */
export function hasNumbers(s: LivePlayerStat): boolean {
  return s.kills + s.deaths + s.assists > 0 || s.acs !== null || s.adr !== null || s.kda !== null;
}

/** What the card reads off a scoreboard line. A stat the line doesn't carry is left out. */
export function cardValues(s: LivePlayerStat): CardValues {
  const v: CardValues = {
    kills: s.kills, deaths: s.deaths, assists: s.assists,
    kda: (s.kills + s.assists) / Math.max(s.deaths, 1),
    plusMinus: s.plusMinus,
  };
  const put = (k: CardStat, x: number | null) => { if (x !== null && Number.isFinite(x)) v[k] = x; };
  put("acs", s.acs);
  put("adr", s.adr);
  put("rating", s.rating !== null && s.rating > 0 ? s.rating : null);
  put("kast", s.kast !== null && s.kast > 0 ? s.kast : null);
  put("headshots", s.headshotPct);
  put("firstBloods", s.firstBloods);
  put("clutches", s.clutches);
  put("csPerMin", s.csPerMin);
  put("gold", s.gold);
  put("damage", s.damage);
  put("damageShare", s.damagePercent);
  put("killParticipation", s.killParticipation);
  put("vision", s.vision);
  return v;
}

// ── Their usual ─────────────────────────────────────────────────────────────
/** One of the player's earlier games, as GET /players/:id/matches sends it. */
export interface UsualGame {
  matchId: string | null;
  counts: boolean;
  values: CardValues;
}

export function normalizeUsualGame(raw: Json): UsualGame {
  const k = int(raw?.kills) ?? 0, d = int(raw?.deaths) ?? 0, a = int(raw?.assists) ?? 0;
  const values: CardValues = { kills: k, deaths: d, assists: a, kda: (k + a) / Math.max(d, 1) };
  // A stat the game's title doesn't have arrives as zero (or null) and is left out.
  const put = (key: CardStat, x: number | null) => { if (x !== null && x > 0) values[key] = x; };
  put("acs", num(raw?.acs));
  put("adr", num(raw?.adr));
  put("rating", num(raw?.rating));
  put("kast", num(raw?.kast));
  put("gold", num(raw?.gold_earned));
  put("csPerMin", num(raw?.cs_per_min));
  put("vision", num(raw?.vision_score));
  const pm = num(raw?.plus_minus);
  if (pm !== null) values.plusMinus = pm;
  // The report's rule for a game that counts: a winner, and long enough to mean something.
  const counts = str(raw?.winner_id) !== null && (int(raw?.team1_score) ?? 0) + (int(raw?.team2_score) ?? 0) >= 6;
  return { matchId: str(raw?.match_id), counts, values };
}
export function normalizeUsualGames(raw: Json): UsualGame[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.matches) ? raw.matches : Array.isArray(raw?.data) ? raw.data : [];
  return arr.filter((r: Json) => r && typeof r === "object").map(normalizeUsualGame);
}

/** How far back "usual" looks, and under how many games there is none. */
export const USUAL_WINDOW = 20;
export const USUAL_FEWEST = 3;

/** What a player usually does: their recent counted games, stat by stat. */
export interface PlayerUsual {
  samples: Partial<Record<CardStat, number[]>>;
}
export function makeUsual(games: UsualGame[]): PlayerUsual {
  const samples: Partial<Record<CardStat, number[]>> = {};
  for (const g of games) {
    if (!g.counts) continue;
    for (const [k, v] of Object.entries(g.values) as [CardStat, number][]) (samples[k] ??= []).push(v);
  }
  return { samples };
}
function sample(u: PlayerUsual, s: CardStat): number[] | null {
  const n = u.samples[s];
  return n && n.length >= USUAL_FEWEST ? n : null;
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function usualAverage(u: PlayerUsual, s: CardStat): number | null {
  const n = sample(u, s);
  return n ? mean(n) : null;
}
/** How far `value` sits from their average, in typical swings of their own (1 is one swing above). */
export function usualSwings(u: PlayerUsual, s: CardStat, value: number): number | null {
  const n = sample(u, s);
  if (!n) return null;
  const m = mean(n);
  const spread = Math.sqrt(n.reduce((a, x) => a + (x - m) * (x - m), 0) / n.length);
  // Every game the same: any other number is as far as the bar goes.
  if (spread <= 0.000001) return Math.abs(value - m) < 0.000001 ? 0 : value > m ? 2 : -2;
  return (value - m) / spread;
}
/** How many of those games `value` beats, how many it ties, out of how many. */
export function usualStanding(u: PlayerUsual, s: CardStat, value: number): { better: number; level: number; games: number } | null {
  const n = sample(u, s);
  if (!n) return null;
  return { better: n.filter((x) => x < value).length, level: n.filter((x) => x === value).length, games: n.length };
}

export type Verdict = "wellAbove" | "above" | "around" | "below" | "wellBelow";

/** From the share of their recent games this one beats, a tie counting half: 85% and up well above, 65% above, down to 35% around, down to 15% below. In whole numbers, so 17 of 20 is exactly 85%. */
export function verdictOf(better: number, level: number, games: number): Verdict {
  const beaten = (2 * better + level) * 10;   // twenty times the games beaten
  if (beaten >= 17 * games) return "wellAbove";
  if (beaten >= 13 * games) return "above";
  if (beaten > 7 * games) return "around";
  if (beaten > 3 * games) return "below";
  return "wellBelow";
}
export const VERDICT_LABEL: Record<Verdict, string> = {
  wellAbove: "Well above their usual", above: "Above their usual", around: "Right around their usual",
  below: "Below their usual", wellBelow: "Well below their usual",
};
export type Tone = "good" | "plain" | "bad";
export const verdictTone = (v: Verdict): Tone => (v === "wellAbove" || v === "above" ? "good" : v === "around" ? "plain" : "bad");

/** One stat beside its usual. */
export interface UsualRow {
  stat: CardStat;
  value: number;
  usual: number;
  /** −1…1: how far from usual, toward the better side (fewer deaths is better). Two typical swings fill the bar. */
  lean: number;
}
/** Green toward the better side, red toward the worse; within a quarter of a typical swing it stays plain. */
export const rowTone = (r: UsualRow): Tone => (Math.abs(r.lean) < 0.125 ? "plain" : r.lean > 0 ? "good" : "bad");

export interface UsualReading {
  /** The games behind the read. */
  games: number;
  /** How many of them this game beats, on the headline stat. */
  better: number;
  verdict: Verdict;
  rows: UsualRow[];
}

export type UsualState =
  | { kind: "pending" }       // their games are on the way
  | { kind: "unavailable" }   // couldn't be read: nothing is drawn
  | { kind: "notEnough" }     // under three counted games, or no headline stat on this line
  | { kind: "tooEarly" }      // a live game that hasn't run long enough
  | { kind: "ready"; reading: UsualReading };

// ── The card ────────────────────────────────────────────────────────────────
export interface CardCell { stat: CardStat; text: string; marquee: boolean }

export interface CardModel {
  playerId: string;
  name: string;
  photoURL: string | null;
  /** "Sentinels · Duelist · Jett": whatever of the three is known. */
  detail: string;
  teamName: string | null;
  teamLogoURL: string | null;
  match: Match;
  /** 1 or 2: the side of the score the player is on; null when the scoreboard doesn't say. */
  side: 1 | 2 | null;
  /** null until the match itself has answered: a list row's score can be minutes old. */
  score: { team1: number; team2: number } | null;
  /** League: the game clock, or how long the game ran. */
  clock: string | null;
  /** "Ascent · Quarterfinal · Game 2 of 3" (League: the clock in the map's place). */
  context: string;
  headline: CardCell[];
  more: CardCell[];
  /** "Top fragger in the lobby", "#2 in ACS". */
  standing: string[];
  usual: UsualState;
  isLive: boolean;
  isFinal: boolean;
}

/** The block under the numbers has something to draw. */
export const hasRead = (m: CardModel) => (m.usual.kind === "unavailable" ? m.standing.length > 0 : true);

/** The card as a picture shows it: nothing on it still loading. */
export const settled = (m: CardModel): CardModel => (m.usual.kind === "pending" ? { ...m, usual: { kind: "unavailable" } } : m);

/** "TenZ · 26/13/6", for the share sheet. */
export const shareTitle = (m: CardModel) => `${m.name} · ${m.headline.slice(0, 3).map((c) => c.text).join("/")}`;

/** The table of the scoreboard a line sits in, 1 or 2, by the match screens' own rule: a player who has since moved matches neither side — the live scoreboard keeps them in its second table, a finished one leaves them out. */
export function tableOf(row: MatchStatRow, match: Match): 1 | 2 | null {
  if (!match.team1Id || !match.team2Id) return null;
  if (row.teamId === match.team1Id) return 1;
  if (row.teamId === match.team2Id || match.status === "live") return 2;
  return null;
}

/** Where they stand among everyone in the match. */
export function standingLines(stat: LivePlayerStat, lobby: MatchStatRow[], game: string): string[] {
  if (lobby.length <= 1 || stat.kills <= 0) return [];
  const lines: string[] = [];
  const killsRank = lobby.filter((r) => (r.kills ?? 0) > stat.kills).length + 1;
  lines.push(killsRank === 1 ? "Top fragger in the lobby" : `#${killsRank} of ${lobby.length} in kills`);
  if (game === "VALORANT" && stat.acs !== null) {
    const acs = stat.acs;
    lines.push(`#${lobby.filter((r) => (r.acs ?? 0) > acs).length + 1} in ACS`);
  } else if (game === "CS2" && stat.adr !== null) {
    const adr = stat.adr;
    lines.push(`#${lobby.filter((r) => (r.adr ?? 0) > adr).length + 1} in ADR`);
  } else if (game === "League" && stat.damage !== null) {
    const dmg = stat.damage;
    lines.push(`#${lobby.filter((r) => (r.damageDealt ?? 0) > dmg).length + 1} in damage`);
  }
  return lines;
}

/** Far enough into a live game for its rates to mean something: ten minutes on a League clock, else a combined score of six. */
function isFarEnough(match: Match, clockSeconds: number | null): boolean {
  if (match.game === "League" && clockSeconds !== null) return clockSeconds >= 600;
  return match.team1Score + match.team2Score >= 6;
}

/** This game against their usual. */
export function readingOf(layout: CardLayout, values: CardValues, match: Match, usual: PlayerUsual | null, usualFailed: boolean, clockSeconds: number | null): UsualState {
  if (!usual) return usualFailed ? { kind: "unavailable" } : { kind: "pending" };
  const headline = values[layout.marquee];
  const standing = headline === undefined ? null : usualStanding(usual, layout.marquee, headline);
  if (!standing) return { kind: "notEnough" };
  const live = match.status === "live";
  if (live && !isFarEnough(match, clockSeconds)) return { kind: "tooEarly" };

  // Live, only rates are held against finished games; counts wait for the end.
  const stats = live ? layout.compared.filter(holdsMidGame) : layout.compared;
  const rows: UsualRow[] = [];
  for (const s of stats) {
    const value = values[s];
    if (value === undefined) continue;
    const average = usualAverage(usual, s);
    const swings = usualSwings(usual, s, value);
    if (average === null || swings === null) continue;
    const toward = lowerIsBetter(s) ? -swings : swings;
    rows.push({ stat: s, value, usual: average, lean: Math.max(-1, Math.min(1, toward / 2)) });
  }
  return { kind: "ready", reading: { games: standing.games, better: standing.better, verdict: verdictOf(standing.better, standing.level, standing.games), rows } };
}

export interface CardInputs {
  playerId: string;
  match: Match;
  stat: LivePlayerStat;
  side: 1 | 2 | null;
  scoreIsCurrent: boolean;
  clockSeconds: number | null;
  lobby: MatchStatRow[];
  usual: PlayerUsual | null;
  usualFailed: boolean;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Everything the card draws, worked out once per refresh. */
export function buildCard(x: CardInputs): CardModel {
  const { match, stat } = x;
  const layout = layoutOf(match.game);
  const values = cardValues(stat);
  const cell = (s: CardStat, marquee = false): CardCell | null => {
    const v = values[s];
    return v === undefined ? null : { stat: s, text: statText(s, v), marquee };
  };
  const teamName = x.side === 1 ? match.team1Name : x.side === 2 ? match.team2Name : null;
  const teamLogoURL = x.side === 1 ? match.team1LogoURL : x.side === 2 ? match.team2LogoURL : null;
  const clock = match.game === "League" && x.clockSeconds !== null && x.clockSeconds > 0 ? `${pad2(Math.floor(x.clockSeconds / 60))}:${pad2(x.clockSeconds % 60)}` : null;
  const place = match.game === "League" ? clock : match.mapName;
  const event = match.series ? liveSeriesInfo({ ...match.series, gameNumber: match.series.gameNumber === null ? null : Math.min(match.series.gameNumber, match.series.bestOf) }) : match.tournamentName;
  return {
    playerId: x.playerId,
    name: stat.name,
    photoURL: stat.imageURL,
    detail: [teamName ?? "", stat.role, stat.agent].filter((s) => s && s.trim()).join(" · "),
    teamName,
    teamLogoURL,
    match,
    side: x.side,
    score: x.scoreIsCurrent ? { team1: match.team1Score, team2: match.team2Score } : null,
    clock,
    context: [place ?? "", event ?? ""].filter(Boolean).join(" · "),
    headline: [cell("kills"), cell("deaths"), cell("assists"), cell(layout.marquee, true)].filter((c): c is CardCell => !!c),
    more: layout.more.map((s) => cell(s)).filter((c): c is CardCell => !!c),
    standing: standingLines(stat, x.lobby, match.game),
    usual: readingOf(layout, values, match, x.usual, x.usualFailed, x.clockSeconds),
    isLive: match.status === "live",
    isFinal: match.status === "completed",
  };
}

/** Up to four in a row; more split into even rows (5 is 3 and 2, 7 is 4 and 3). */
export function gridRows<T>(cells: T[]): T[][] {
  if (!cells.length) return [];
  const count = Math.ceil(cells.length / 4);
  const base = Math.floor(cells.length / count);
  const extra = cells.length % count;
  const rows: T[][] = [];
  let start = 0;
  for (let i = 0; i < count; i++) {
    const size = base + (i < extra ? 1 : 0);
    rows.push(cells.slice(start, start + size));
    start += size;
  }
  return rows;
}

/** The side that lost a finished game is dimmed, as on the results list. */
export function isDimmed(m: CardModel, side: 1 | 2): boolean {
  if (!m.isFinal || !m.score || m.score.team1 === m.score.team2) return false;
  return (side === 1) === (m.score.team1 < m.score.team2);
}
