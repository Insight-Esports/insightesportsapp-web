// alerts/model.ts — Stat Alerts payloads (GET /alerts, GET /alerts/context,
// backend/stat-alerts-contract.md rev 5.1) decoded tolerantly, plus the one
// set of words every alert screen uses: "At least 20 kills", "Under 20
// kills", "Wins", "Loses", "Wins 2–0", "Series goes to map 3", "Wins map 2".
// Never "line", "odds", "prop" or "bet".

import { int, iso, num, str, type Json } from "@/lib/types";
import { PredictionStatCatalog } from "@/features/predictions/types";
import type { AlertDirection, AlertTargetType } from "./entry";

export type AlertKind = "stat" | "result" | "map";
export type ResultEvent = "win" | "lose" | "sweep" | "distance";
export type AlertOutcome = "hit" | "miss" | "void";

/** The call of an alert: what it waits for. */
export interface AlertCall {
  kind: AlertKind;
  stat: string | null;
  direction: AlertDirection | null;
  target: number | null;
  event: string | null;
  mapNumber: number | null;
}

/** `match` on an alert row (matchShape in statAlertService.js). */
export interface AlertMatch {
  id: string;
  opponentName: string | null;
  scheduledAt: string | null;
  /** Active rows only: upcoming / scheduled / live / completed. */
  status: string | null;
  bestOf: number | null;
  /** Series (maps) score from the target's side; live and completed only. */
  targetScore: number | null;
  opponentScore: number | null;
}

export interface AlertBase extends AlertCall {
  game: string;
  targetType: AlertTargetType;
  targetId: string;
  targetName: string;
  teamName: string | null;
  imageURL: string | null;
  match: AlertMatch | null;
}

export interface ActiveAlert extends AlertBase {
  id: string;
  repeat: boolean;
  createdAt: string | null;
  /** Present while the alert's match is live: the live value, and when the live push went out. */
  live: { value: number | null; firedAt: string | null } | null;
}

export interface HistoryAlert extends AlertBase {
  /** The result row's id (one per alert per match). */
  id: string;
  alertId: string;
  outcome: AlertOutcome;
  finalValue: number | null;
  finalScore: string | null;
  finalAt: string | null;
}

export interface ContextMap { number: number; status: string | null; targetWon: boolean | null; targetRounds: number | null; opponentRounds: number | null }
export interface AlertContext {
  match: (AlertMatch & { maps: ContextMap[] }) | null;
}

// ── Decoding ────────────────────────────────────────────────────────────────
const asKind = (v: Json): AlertKind => (v === "result" || v === "map" ? v : "stat");
const asDirection = (v: Json): AlertDirection | null => (v === "over" || v === "under" ? v : null);
const asType = (v: Json): AlertTargetType => (v === "team" ? "team" : "player");
const asOutcome = (v: Json): AlertOutcome => (v === "hit" || v === "miss" ? v : "void");

function normalizeMatch(raw: Json): AlertMatch | null {
  if (!raw || typeof raw !== "object" || raw.id == null) return null;
  return {
    id: String(raw.id),
    opponentName: str(raw.opponent_name),
    scheduledAt: iso(raw.scheduled_at),
    status: str(raw.status),
    bestOf: int(raw.best_of),
    targetScore: int(raw.target_score),
    opponentScore: int(raw.opponent_score),
  };
}

function normalizeBase(raw: Json): AlertBase {
  return {
    kind: asKind(raw.kind),
    stat: str(raw.stat),
    direction: asDirection(raw.direction),
    target: num(raw.target),
    event: str(raw.event),
    mapNumber: int(raw.map_number),
    game: str(raw.game) ?? "VALORANT",
    targetType: asType(raw.target_type),
    targetId: String(raw.target_id ?? ""),
    targetName: str(raw.target_name) ?? "",
    teamName: str(raw.team_name),
    imageURL: str(raw.image_url),
    match: normalizeMatch(raw.match),
  };
}

export function normalizeActive(raw: Json): ActiveAlert {
  const live = raw?.live && typeof raw.live === "object" ? { value: num(raw.live.value), firedAt: iso(raw.live.fired_at) } : null;
  return { ...normalizeBase(raw), id: String(raw.id), repeat: raw.repeat === true || raw.repeat === "true", createdAt: iso(raw.created_at), live };
}

export function normalizeHistory(raw: Json): HistoryAlert {
  return {
    ...normalizeBase(raw),
    id: String(raw.id),
    alertId: String(raw.alert_id ?? raw.id),
    outcome: asOutcome(raw.status ?? raw.outcome),
    finalValue: num(raw.final_value),
    finalScore: str(raw.final_score),
    finalAt: iso(raw.final_at),
  };
}

export function normalizeAlertList(raw: Json): { active: ActiveAlert[]; history: HistoryAlert[] } {
  const r = raw && typeof raw === "object" ? raw : {};
  const rows = (v: Json) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object" && x.id != null) : []);
  return { active: rows(r.active).map(normalizeActive), history: rows(r.history).map(normalizeHistory) };
}

export function normalizeContext(raw: Json): AlertContext {
  const m = raw?.match;
  const base = normalizeMatch(m);
  if (!base) return { match: null };
  const maps: ContextMap[] = Array.isArray(m.maps)
    ? m.maps.filter((x: Json) => x && typeof x === "object").map((x: Json) => ({
        number: int(x.number) ?? 0,
        status: str(x.status),
        targetWon: typeof x.target_won === "boolean" ? x.target_won : null,
        targetRounds: int(x.target_rounds),
        opponentRounds: int(x.opponent_rounds),
      }))
    : [];
  return { match: { ...base, maps } };
}

// ── Stats ───────────────────────────────────────────────────────────────────
/** Stats that only go up during a match (statAlertService CUMULATIVE_STATS). */
export const CUMULATIVE = new Set(["kills", "deaths", "assists", "headshots", "first_bloods", "clutch_wins", "gold_earned", "damage_dealt", "vision_score", "kills_t_side", "kills_ct_side"]);
/** Stats that move both ways: decided when the match ends. */
export const BOTH_WAYS = new Set(["plus_minus", "acs", "adr", "cs_per_min"]);
/** Decimal-valued stats (everything else is a whole number). */
const DECIMAL = new Set(["acs", "adr", "cs_per_min"]);

export const isCounting = (stat: string | null | undefined) => !!stat && !DECIMAL.has(stat);

/** Stepper step: ACS 5, CS/min 0.1, gold 250, everything else 1. */
export function statStep(stat: string | null | undefined): number {
  switch (stat) {
    case "acs": return 5;
    case "cs_per_min": return 0.1;
    case "gold_earned": return 250;
    default: return 1;
  }
}

/** Snap to the stat's step; above zero except +/−. */
export function snapTarget(stat: string, v: number): number {
  const step = statStep(stat);
  let out = Math.round(v / step) * step;
  out = step < 1 ? Math.round(out * 10) / 10 : Math.round(out);
  if (stat !== "plus_minus" && out <= 0) out = step;
  return out;
}

/** The words for a stat inside a call ("20 kills", "250 ACS", "+3 +/−"). */
export function statWord(stat: string | null | undefined): string {
  switch (stat) {
    case "kills": return "kills";
    case "deaths": return "deaths";
    case "assists": return "assists";
    case "headshots": return "headshots";
    case "acs": return "ACS";
    case "adr": return "ADR";
    case "plus_minus": return "+/−";
    case "cs_per_min": return "CS/min";
    case "gold_earned": return "gold";
    case "vision_score": return "vision score";
    default: return stat ? PredictionStatCatalog.label(stat).toLowerCase() : "";
  }
}

/** Chip label for a stat (the predictor's labels). */
export const statLabel = (stat: string) => PredictionStatCatalog.label(stat);

/** A stat number: signed for +/−, one decimal for CS/min, thousands for gold. */
export function fmtStat(stat: string | null | undefined, v: number | null | undefined, signed = stat === "plus_minus"): string {
  if (v == null || !Number.isFinite(v)) return "—";
  let s: string;
  if (stat === "cs_per_min") s = v.toFixed(1);
  else if (Math.abs(v) >= 1000) s = Math.round(v).toLocaleString("en-US");
  else if (Number.isInteger(v)) s = String(v);
  else s = (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "");
  if (signed) {
    if (v > 0) return `+${s}`;
    if (v < 0) return `−${s.replace("-", "")}`;
  }
  return s;
}

// ── Words ───────────────────────────────────────────────────────────────────
/** Maps needed to win a best-of-N. */
export const mapsToWin = (bestOf: number | null | undefined) => (bestOf && bestOf > 0 ? Math.floor(bestOf / 2) + 1 : null);

export function resultWords(event: string | null, bestOf: number | null | undefined): string {
  switch (event) {
    case "win": return "Wins";
    case "lose": return "Loses";
    case "sweep": {
      const need = mapsToWin(bestOf ?? 3) ?? 2;
      return `Wins ${need}–0`;
    }
    case "distance": return `Series goes to map ${bestOf && bestOf > 1 ? bestOf : 3}`;
    default: return "Result";
  }
}

/** "At least 20 kills" · "Under 20 kills" · "Wins" · "Wins 2–0" · "Series goes to map 3" · "Wins map 2". */
export function callText(c: AlertCall, bestOf?: number | null): string {
  if (c.kind === "result") return resultWords(c.event, bestOf);
  if (c.kind === "map") return `Wins map ${c.mapNumber ?? 1}`;
  const word = statWord(c.stat);
  const n = fmtStat(c.stat, c.target);
  return `${c.direction === "under" ? "Under" : "At least"} ${n} ${word}`.trim();
}

/** The composer's selection key for a call: a stat key, "win" / "lose" / "sweep" / "distance", or "map_N". */
export function callKey(c: AlertCall): string {
  if (c.kind === "result") return c.event ?? "win";
  if (c.kind === "map") return `map_${c.mapNumber ?? 1}`;
  return c.stat ?? "kills";
}

export const RESULT_EVENTS: ResultEvent[] = ["win", "lose", "sweep", "distance"];

/** Parses a selection key back into kind / event / map. */
export function parseKey(key: string): { kind: AlertKind; stat: string | null; event: string | null; mapNumber: number | null } {
  if ((RESULT_EVENTS as string[]).includes(key)) return { kind: "result", stat: null, event: key, mapNumber: null };
  const m = /^map_(\d)$/.exec(key);
  if (m) return { kind: "map", stat: null, event: "map_win", mapNumber: Number(m[1]) };
  return { kind: "stat", stat: key, event: null, mapNumber: null };
}

/** "Tue 7:00 PM". */
export function whenText(isoStr: string | null | undefined): string | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** "Oct 26". */
export function dayText(isoStr: string | null | undefined): string | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const isLiveAlert = (a: ActiveAlert) => a.match?.status === "live";

/** A live stat alert has reached its number: the live push went out, or a stat that only goes up is there. */
export function isReached(a: ActiveAlert): boolean {
  if (a.kind !== "stat" || !a.live) return false;
  if (a.live.firedAt) return true;
  const v = a.live.value, t = a.target;
  return a.direction !== "under" && v != null && t != null && CUMULATIVE.has(a.stat ?? "") && v >= t;
}

/** "12 – 9" from a pair. */
export const scorePair = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : `${a} – ${b}`);

export const PREMIUM_UPGRADE_HREF = "/premium/upgrade";
