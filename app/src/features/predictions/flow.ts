// predictions/flow.ts — the predictor's URL grammar. Every step of the iOS
// NavigationStack is a sub-route of /premium/predict with its inputs in the
// query string, so back/forward works and any step can be shared.
//
//   /premium/predict                 game, type[, breakdown=1]        → pick a player / team
//   /premium/predict/target          game, type, id, name[, live, match]  → "Analyze" options
//   /premium/predict/stat            + the same                        → stat picker
//   /premium/predict/result          + stat[, baseline, direction, window, map, agent, opponent, side]
//   /premium/predict/breakdown       game, type, id, name              → full breakdown
//   /premium/predict/live            game, id, name[, match]           → live-player breakdown
//   /premium/predict/h2h             game, id, name[, opponent, opponentName, map]
//   /premium/predict/h2h/result      game, id, name, opponent, opponentName[, map]
//   /premium/predict/map             game, id, name[, map]             → team map profile

import { SELECTABLE_GAMES } from "@/lib/types";
import type { PredictionDirection, PredictionTargetType } from "./types";

export const PREDICT_BASE = "/premium/predict";

export type ParamSource = { get(name: string): string | null };

export interface FlowTarget {
  game: string;
  targetType: PredictionTargetType;
  targetId: string;
  targetName: string;
  isLive: boolean;
  matchId: string | null;
}

export function readGame(sp: ParamSource): string {
  const g = sp.get("game");
  return g && SELECTABLE_GAMES.some((x) => x.id === g) ? g : "VALORANT";
}
export function readTargetType(sp: ParamSource): PredictionTargetType {
  return sp.get("type") === "team" ? "team" : "player";
}
export function readTarget(sp: ParamSource): FlowTarget {
  return {
    game: readGame(sp),
    targetType: readTargetType(sp),
    targetId: sp.get("id") ?? "",
    targetName: sp.get("name") ?? "",
    isLive: sp.get("live") === "1",
    matchId: sp.get("match"),
  };
}
export function readDirection(sp: ParamSource): PredictionDirection {
  return sp.get("direction") === "under" ? "under" : "over";
}
export function readNumber(sp: ParamSource, key: string): number | null {
  const v = sp.get(key);
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Builds a query string, dropping null / empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "" || v === false) continue;
    u.set(k, v === true ? "1" : String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export function targetParams(t: FlowTarget) {
  return { game: t.game, type: t.targetType, id: t.targetId, name: t.targetName, live: t.isLive, match: t.matchId };
}

export const flowHref = {
  select: (game: string, type: PredictionTargetType, directBreakdown = false, mode?: "live" | "all") =>
    `${PREDICT_BASE}${qs({ game, type, breakdown: directBreakdown, mode: mode === "live" ? "live" : null })}`,
  options: (t: FlowTarget) => `${PREDICT_BASE}/target${qs(targetParams(t))}`,
  stat: (t: FlowTarget) => `${PREDICT_BASE}/stat${qs(targetParams(t))}`,
  result: (t: FlowTarget, extra: Record<string, string | number | boolean | null | undefined>) => `${PREDICT_BASE}/result${qs({ ...targetParams(t), ...extra })}`,
  breakdown: (t: FlowTarget) => `${PREDICT_BASE}/breakdown${qs({ game: t.game, type: t.targetType, id: t.targetId, name: t.targetName })}`,
  live: (t: FlowTarget) => `${PREDICT_BASE}/live${qs({ game: t.game, id: t.targetId, name: t.targetName, match: t.matchId })}`,
  h2h: (t: FlowTarget, opponentId?: string | null, opponentName?: string | null, map?: string | null) =>
    `${PREDICT_BASE}/h2h${qs({ game: t.game, id: t.targetId, name: t.targetName, opponent: opponentId, opponentName, map })}`,
  h2hResult: (t: FlowTarget, opponentId: string, opponentName: string, map?: string | null) =>
    `${PREDICT_BASE}/h2h/result${qs({ game: t.game, id: t.targetId, name: t.targetName, opponent: opponentId, opponentName, map })}`,
  mapProfile: (t: FlowTarget, map?: string | null) => `${PREDICT_BASE}/map${qs({ game: t.game, id: t.targetId, name: t.targetName, map })}`,
};
