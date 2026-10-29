// archive/types.ts — the match archive's wire shapes (backend
// models/Archive.js via controllers/archiveController.js), decoded the same
// tolerant way as lib/types.ts, plus the UTC day math the archive runs on:
// the backend files a match under the UTC day it was played (start_time),
// so the calendar, the day pages and the month sections all use UTC keys.

import { ApiError } from "@/lib/api";
import { bool, int, iso, normalizeMatch, num, str, type Json, type Match } from "@/lib/types";

/** The archived player's own line in a match (rows carry it with `player=`). */
export interface ArchivePlayerStat {
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  acs: number | null;
  adr: number | null;
  rating: number | null;
  plusMinus: number | null;
  csPerMin: number | null;
  characterName: string | null;
  /** The side the player was on in THIS match (survives org changes). */
  teamId: string | null;
  /** From teamId; null when the side or the winner is unknown. */
  won: boolean | null;
}

export interface ArchiveMatch extends Match {
  /** When it was played (start_time): the date the archive files it under. */
  playedAt: string;
  playerStat: ArchivePlayerStat | null;
}

export interface ArchivePage { matches: ArchiveMatch[]; nextCursor: string | null }
export interface ArchiveYear { year: number; matches: number }
export interface ArchiveDay { date: string; matches: number }

function normalizePlayerStat(raw: Json): ArchivePlayerStat | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    kills: int(raw.kills), deaths: int(raw.deaths), assists: int(raw.assists),
    acs: num(raw.acs), adr: num(raw.adr), rating: num(raw.rating),
    plusMinus: num(raw.plus_minus), csPerMin: num(raw.cs_per_min),
    characterName: str(raw.character_name),
    teamId: str(raw.team_id),
    won: raw.won === null || raw.won === undefined ? null : bool(raw.won),
  };
}

export function normalizeArchiveMatch(raw: Json): ArchiveMatch {
  const m = normalizeMatch({ ...raw, status: raw?.status ?? "completed" });
  return { ...m, playedAt: iso(raw.played_at) ?? iso(raw.start_time) ?? m.scheduledAt, playerStat: normalizePlayerStat(raw.player_stat) };
}

export function normalizeArchivePage(raw: Json): ArchivePage {
  const arr = Array.isArray(raw?.matches) ? raw.matches : Array.isArray(raw) ? raw : [];
  const matches: ArchiveMatch[] = [];
  for (const r of arr) {
    try { if (r?.id != null) matches.push(normalizeArchiveMatch(r)); } catch { /* skip bad row */ }
  }
  return { matches, nextCursor: str(raw?.next_cursor) || null };
}

export function normalizeArchiveYears(raw: Json): ArchiveYear[] {
  const arr = Array.isArray(raw?.years) ? raw.years : [];
  return arr
    .map((y: Json) => ({ year: int(y?.year) ?? 0, matches: int(y?.matches) ?? 0 }))
    .filter((y: ArchiveYear) => y.year > 0 && y.matches > 0)
    .sort((a: ArchiveYear, b: ArchiveYear) => b.year - a.year);
}

export function normalizeArchiveDays(raw: Json): ArchiveDay[] {
  const arr = Array.isArray(raw?.days) ? raw.days : [];
  return arr
    .map((d: Json) => ({ date: str(d?.date) ?? "", matches: int(d?.matches) ?? 0 }))
    .filter((d: ArchiveDay) => DAY_KEY.test(d.date) && d.matches > 0);
}

// ── UTC day math ───────────────────────────────────────────────────────────
export const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 864e5;

/** "YYYY-MM-DD" (UTC) of an ISO time or epoch ms. */
export function utcDayKey(t: string | number | Date): string {
  return new Date(t).toISOString().slice(0, 10);
}
/** "YYYY-MM" (UTC). */
export function utcMonthKey(t: string | number | Date): string {
  return new Date(t).toISOString().slice(0, 7);
}
export function isDayKey(s: string | null | undefined): s is string {
  return !!s && DAY_KEY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}
/** A UTC date formatted for the reader's locale, e.g. "Mar 14". */
export function formatUtc(t: string | number | Date, opts: Intl.DateTimeFormatOptions): string {
  return new Date(t).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}
/** The day page's title: "Saturday, March 14, 2020". */
export function longDayLabel(key: string): string {
  return formatUtc(`${key}T00:00:00Z`, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
/** A month section's header: "March 2020". */
export function monthLabel(monthKey: string): string {
  return formatUtc(`${monthKey}-01T00:00:00Z`, { month: "long", year: "numeric" });
}

// ── Paywall (403 PREMIUM_REQUIRED {free_days}) ─────────────────────────────
/** The archive's paywall answer: `days` is the free window (null when unknown). */
export function premiumGateOf(e: unknown): { days: number | null } | null {
  if (!(e instanceof ApiError) || e.status !== 403 || e.code !== "PREMIUM_REQUIRED") return null;
  const fromBody = num(e.body?.free_days);
  const fromText = /last (\d+) days?/i.exec(e.message)?.[1];
  const days = fromBody ?? (fromText ? Number(fromText) : null);
  return { days: days && days > 0 ? days : null };
}

/** The first whole UTC day inside a free window of `days`: the server's floor is
 *  now − days, so the day after the floor's date always clears it. */
export function freeWindowStart(days: number, now = Date.now()): string {
  return utcDayKey(now - days * DAY_MS + DAY_MS);
}

export interface ArchiveFilters {
  game?: string | null;
  team?: string | null;
  player?: string | null;
  date?: string | null;
  from?: string | null;
  to?: string | null;
}

/** The same request cut down to the free window, or null when none of it is in there. */
export function narrowToWindow(f: ArchiveFilters, days: number): ArchiveFilters | null {
  const start = freeWindowStart(days);
  if (f.date) return f.date >= start ? f : null;
  if (f.to && f.to < start) return null;
  return { ...f, from: f.from && f.from > start ? f.from : start };
}
