// features/search/types.ts — SearchView.swift result shapes.
import { flairUserFrom, type FlairUser } from "@/components/ui/premium-flair";
import { normalizePlayers, normalizeTeams, str, type Json, type Player, type Team } from "@/lib/types";

/** Minimal user row from search — id + username required only. */
export interface SearchUser {
  id: string;
  username: string;
  avatarURL: string | null;
  flair: FlairUser;
}

/** One of the server's "features": an app screen matching the term, as an
 *  insight:// deep link (backend config/appDestinations.js), in the server's ranking. */
export interface SearchFeature {
  link: string;
  name: string | null;
  description: string | null;
}

export interface SearchResults {
  players: Player[];
  teams: Team[];
  tournaments: string[];
  users: SearchUser[];
  features: SearchFeature[];
}
export const EMPTY_RESULTS: SearchResults = { players: [], teams: [], tournaments: [], users: [], features: [] };

export function resultsEmpty(r: SearchResults): boolean {
  return r.players.length === 0 && r.teams.length === 0 && r.tournaments.length === 0 && r.users.length === 0;
}

/** The term a search response answers (`query`, echoed since 2026-10-28), or
 *  null when the server doesn't echo it. */
export function echoedSearchQuery(raw: Json): string | null {
  return typeof raw?.query === "string" ? raw.query.trim() : null;
}

/** Combined server search: { query, players, teams, tournaments, users, features }.
 *  Tournaments arrive as strings or {name} objects — decode both. */
export function normalizeSearchResults(raw: Json): SearchResults {
  const tournaments: string[] = [];
  const t: Json[] = Array.isArray(raw?.tournaments) ? raw.tournaments : [];
  for (const hit of t) {
    const name = typeof hit === "string" ? hit : str(hit?.name);
    if (name) tournaments.push(name);
  }
  const usersRaw: Json[] = Array.isArray(raw?.users) ? raw.users : [];
  const users: SearchUser[] = usersRaw
    .filter((u) => u?.id != null && u?.username != null)
    .map((u) => ({ id: String(u.id), username: String(u.username), avatarURL: str(u.avatar_url) ?? str(u.avatarURL), flair: flairUserFrom(u) }));
  const featuresRaw: Json[] = Array.isArray(raw?.features) ? raw.features : [];
  const features: SearchFeature[] = featuresRaw
    .filter((f) => typeof f?.link === "string" && f.link)
    .map((f) => ({ link: String(f.link), name: str(f.name), description: str(f.description) }));
  return {
    players: normalizePlayers(raw?.players ?? []),
    teams: normalizeTeams(raw?.teams ?? []),
    tournaments,
    users,
    features,
  };
}

/** Maps a tournament name to a game for the game filter (until the backend tags them). */
export function tournamentGame(name: string): string {
  const t = name.toLowerCase();
  if (t.includes("vct") || t.includes("masters") || t.includes("champions") || t.includes("valorant")) return "VALORANT";
  if (t.includes("iem") || t.includes("blast") || t.includes("pgl") || t.includes("major") || t.includes("katowice") || t.includes("cologne")) return "CS2";
  if (t.includes("lck") || t.includes("lpl") || t.includes("worlds") || t.includes("msi") || t.includes("summer")) return "League";
  return "VALORANT";
}
