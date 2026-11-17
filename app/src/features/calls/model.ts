// calls/model.ts — Insight's Calls on a match (InsightCalls.swift; wire:
// backend/premium-features-contract.md §1, GET /api/alerts/calls/:matchId).
//
// Before every match the server writes down Insight's calls once and never
// edits them: who it favours, and a kill count for the leading players.
// Decoded tolerantly (numbers may arrive as numeric strings); the sentence is
// built in the app's own words, the same ones Stat Alerts uses ("Wins",
// "At least 19 kills"), with the server's `text` as the fallback.

import { num, str, type Json } from "@/lib/types";
import { callText } from "@/features/alerts/model";

export type CallStatus = "pending" | "hit" | "miss" | "void";

export interface InsightCall {
  id: string;
  /** winner | player_stat (anything else falls back to `text`). */
  kind: string;
  /** The call in the server's words: the fallback. */
  text: string;
  targetName: string;
  stat: string | null;
  direction: string | null;
  threshold: number | null;
  /** What Insight gave it before the match, in whole percent. */
  chance: number | null;
  status: CallStatus;
  finalValue: number | null;
}

export interface InsightCalls {
  available: boolean;
  /** A free account before the end: the count and the way to Premium. */
  locked: boolean;
  callsCount: number;
  calls: InsightCall[];
  hits: number | null;
  total: number | null;
}

const asStatus = (v: Json): CallStatus => (v === "hit" || v === "miss" || v === "void" ? v : "pending");

let fallbackId = 0;
function normalizeCall(raw: Json): InsightCall {
  const chance = num(raw?.chance);
  return {
    id: raw?.id != null ? String(raw.id) : `call-${fallbackId++}`,
    kind: str(raw?.kind) ?? "",
    text: str(raw?.text) ?? "",
    targetName: str(raw?.target_name) ?? "",
    stat: str(raw?.stat),
    direction: str(raw?.direction),
    threshold: num(raw?.threshold),
    chance: chance === null ? null : Math.round(chance),
    status: asStatus(raw?.status),
    finalValue: num(raw?.final_value),
  };
}

export function normalizeCalls(raw: Json): InsightCalls {
  const r = raw && typeof raw === "object" ? raw : {};
  const calls = Array.isArray(r.calls) ? r.calls.filter((c: Json) => c && typeof c === "object").map(normalizeCall) : [];
  const count = num(r.calls_count);
  const summary = r.summary && typeof r.summary === "object" ? r.summary : null;
  return {
    available: r.available === true,
    locked: r.locked === true,
    callsCount: count === null ? calls.length : Math.round(count),
    calls,
    hits: summary ? num(summary.hit) : null,
    total: summary ? num(summary.total) : null,
  };
}

/** The call in the app's own words ("Wins", "At least 19 kills"); a kind this build doesn't know reads the server's sentence. */
export function callLine(c: InsightCall): string {
  switch (c.kind) {
    case "winner":
      return callText({ kind: "result", event: "win", stat: null, direction: null, target: null, mapNumber: null });
    case "player_stat":
      if (!c.stat || c.threshold === null) return c.text;
      return callText({ kind: "stat", stat: c.stat, direction: c.direction === "under" ? "under" : "over", target: c.threshold, event: null, mapNumber: null });
    default:
      return c.text;
  }
}

/** Who the call is about; the server's sentence stands alone without one. */
export const callName = (c: InsightCall) => c.targetName || c.text;
export const showsLine = (c: InsightCall) => !!c.targetName;

/** "68%". */
export const percentText = (v: number) => `${v}%`;

/** A final value as it reads (StatAlertText.value): +/− signed, whole numbers plain, else one decimal. */
export function valueText(c: InsightCall): string {
  const v = c.finalValue;
  if (v === null || !Number.isFinite(v)) return "–";
  const plain = (x: number) => (Math.abs(x) >= 1000 || Number.isInteger(x) ? x.toFixed(0) : x.toFixed(1));
  if ((c.stat ?? "kills") !== "plus_minus") return plain(v);
  const t = plain(Math.abs(v));
  return v > 0 ? `+${t}` : v < 0 ? `−${t}` : t;
}

/** "2 of 4 hit · Made before the match and never changed." */
export function captionText(data: InsightCalls): string {
  const rule = "Made before the match and never changed.";
  if (data.hits === null || data.total === null || data.total <= 0) return rule;
  return `${data.hits} of ${data.total} hit · ${rule}`;
}
