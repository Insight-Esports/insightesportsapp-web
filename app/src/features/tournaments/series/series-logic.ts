// series-logic.ts — the rules every tournament game shares (parity
// 2026-10-29 §2): the game's tag (DECIDER / IF NECESSARY), the one-game-ahead
// lock, and the copy built from a match row's `series`. The Upcoming card,
// the match preview, the live header and the series page all read these.

import { signedPoints } from "@/features/tournaments/format";
import type { Match, MatchSeries } from "@/lib/types";

/** The series fields the rules need (a match row's `series`, or one built from the series payload). */
export type SeriesState = Pick<MatchSeries, "bestOf" | "gameNumber" | "ifNecessary" | "team1Wins" | "team2Wins" | "status">;

export type SeriesTag = "decider" | "if_necessary" | null;

/** Wins needed to take a best-of-N series. */
export const winsNeeded = (bestOf: number) => Math.floor(bestOf / 2) + 1;
/** Games already decided in the series. */
export const gamesPlayed = (s: Pick<SeriesState, "team1Wins" | "team2Wins">) => s.team1Wins + s.team2Wins;

/**
 * The game's tag. need = floor(best_of/2)+1, played = team1_wins + team2_wins.
 * DECIDER: both teams on need − 1 and this is the next game.
 * IF NECESSARY: an if-necessary game past what the leader still needs
 * (at 1–1 game 3 drops it and becomes the decider). None for Bo1 or a
 * completed series.
 */
export function seriesTag(s: SeriesState | null | undefined): SeriesTag {
  if (!s || s.bestOf <= 1 || s.status === "completed" || s.gameNumber == null) return null;
  const need = winsNeeded(s.bestOf);
  const played = gamesPlayed(s);
  if (s.team1Wins === need - 1 && s.team2Wins === need - 1 && s.gameNumber === played + 1) return "decider";
  if (s.ifNecessary && s.gameNumber > played + need - Math.max(s.team1Wins, s.team2Wins)) return "if_necessary";
  return null;
}

/** One game ahead: a tournament game opens once the series reaches it. Other matches are always open. */
export function isGameOpen(m: Pick<Match, "series"> | null | undefined): boolean {
  const s = m?.series;
  if (!s || s.gameNumber == null) return true;
  return s.status !== "completed" && s.gameNumber <= gamesPlayed(s) + 1;
}

/** "Preview opens after Game 2" — the game that has to finish first. */
export function previewOpensAfter(s: Pick<SeriesState, "gameNumber">): string {
  return `Preview opens after Game ${Math.max(1, (s.gameNumber ?? 2) - 1)}`;
}

/** The Upcoming card's series line: "QUARTERFINAL · GAME 3 OF 3" plus its tag. */
export function seriesLine(s: SeriesState & Pick<MatchSeries, "roundName">): { text: string; tag: SeriesTag } {
  const parts: string[] = [];
  if (s.roundName) parts.push(s.roundName.toUpperCase());
  if (s.gameNumber != null) parts.push(`GAME ${s.gameNumber} OF ${s.bestOf}`);
  return { text: parts.join(" · "), tag: seriesTag(s) };
}
export const TAG_TEXT: Record<Exclude<SeriesTag, null>, string> = { decider: "DECIDER", if_necessary: "IF NECESSARY" };

/** Match Info "Game": "3 of 3 · if necessary", "3 of 3 · decider" or "2 of 3". */
export function gameOfText(s: SeriesState): string {
  const base = `${s.gameNumber ?? "?"} of ${s.bestOf}`;
  const tag = seriesTag(s);
  return tag === "decider" ? `${base} · decider` : tag === "if_necessary" ? `${base} · if necessary` : base;
}

/** Match Info "Series": "Spirit lead 1–0" or "Level 1–1"; null before the series starts. */
export function seriesLeadText(s: Pick<SeriesState, "team1Wins" | "team2Wins">, team1Name: string, team2Name: string): string | null {
  const { team1Wins: a, team2Wins: b } = s;
  if (a + b === 0) return null;
  if (a === b) return `Level ${a}–${b}`;
  return a > b ? `${team1Name} lead ${a}–${b}` : `${team2Name} lead ${b}–${a}`;
}

/** Live header: "Quarterfinal · Game 2 of 3 • Spirit leads 1-0" (or "Series tied 1-1"). */
export function liveSeriesInfo(s: MatchSeries, team1Name: string, team2Name: string): string {
  const { team1Wins: a, team2Wins: b } = s;
  const lead = a === b ? `Series tied ${a}-${b}` : a > b ? `${team1Name} leads ${a}-${b}` : `${team2Name} leads ${b}-${a}`;
  const head = [s.roundName, s.gameNumber != null ? `Game ${s.gameNumber} of ${s.bestOf}` : `Best of ${s.bestOf}`].filter(Boolean).join(" · ");
  return `${head} • ${lead}`;
}

// ── Team colours on the dark card ─────────────────────────────────────────
const LIGHT = "#E6E6EC";
/** True for a #rgb / #rrggbb colour too dark to read on the card (Spirit's #1F1F1F). */
function tooDark(c: string): boolean {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return false;
  const h = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.045;
}
/**
 * The two sides' colours for bars and percents: a near-black team colour
 * reads as light grey (as the app shows Spirit); when both are near-black
 * the second falls back to the team2 accent so the bar keeps two parts.
 */
export function readableSides(c1: string, c2: string): [string, string] {
  const a = tooDark(c1) ? LIGHT : c1;
  const b = tooDark(c2) ? (a === LIGHT ? "var(--team2)" : LIGHT) : c2;
  return [a, b];
}

// ── Adjustments (bounce back / backs to the wall) ─────────────────────────
export interface SeriesAdjustment { effect: string; team: "team1" | "team2"; points: number }

export function normalizeAdjustments(raw: unknown): SeriesAdjustment[] {
  if (!Array.isArray(raw)) return [];
  const out: SeriesAdjustment[] = [];
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const r = a as Record<string, unknown>;
    const team = r.team === "team1" || r.team === 1 || r.team === "1" ? "team1" : r.team === "team2" || r.team === 2 || r.team === "2" ? "team2" : null;
    const points = typeof r.points === "number" ? r.points : Number(r.points);
    if (!team || !Number.isFinite(points) || points === 0) continue;
    out.push({ effect: String(r.effect ?? ""), team, points });
  }
  return out;
}

const EFFECT_TEXT: Record<string, string> = { bounce_back: "bounce back", backs_to_the_wall: "backs to the wall" };
const effectText = (e: string) => EFFECT_TEXT[e] ?? e.replace(/_/g, " ");

/**
 * "FUT Esports +4 bounce back"; one team's effects joined with commas
 * ("FUT Esports +4 bounce back, +6 backs to the wall"); two teams joined
 * with " · ". `team` names the side in `team1Name` / `team2Name`.
 */
export function adjustmentsSentence(adj: SeriesAdjustment[], team1Name: string, team2Name: string): string | null {
  if (!adj.length) return null;
  const order: ("team1" | "team2")[] = [];
  for (const a of adj) if (!order.includes(a.team)) order.push(a.team);
  return order.map((side) => {
    const name = side === "team1" ? team1Name : team2Name;
    const effects = adj.filter((a) => a.team === side).map((a) => `${signedPoints(a.points)} ${effectText(a.effect)}`);
    return `${name} ${effects.join(", ")}`;
  }).join(" · ");
}
