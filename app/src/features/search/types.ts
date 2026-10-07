// features/search/types.ts — SearchView.swift result shapes.
import { normalizePlayers, normalizeTeams, str, type Json, type Player, type Team } from "@/lib/types";

/** Minimal user row from search — id + username required only. */
export interface SearchUser {
  id: string;
  username: string;
  avatarURL: string | null;
}

export interface SearchResults {
  players: Player[];
  teams: Team[];
  tournaments: string[];
  users: SearchUser[];
}
export const EMPTY_RESULTS: SearchResults = { players: [], teams: [], tournaments: [], users: [] };

export function resultsEmpty(r: SearchResults): boolean {
  return r.players.length === 0 && r.teams.length === 0 && r.tournaments.length === 0 && r.users.length === 0;
}

/** Combined server search: { players, teams, tournaments, users }.
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
    .map((u) => ({ id: String(u.id), username: String(u.username), avatarURL: str(u.avatar_url) ?? str(u.avatarURL) }));
  return {
    players: normalizePlayers(raw?.players ?? []),
    teams: normalizeTeams(raw?.teams ?? []),
    tournaments,
    users,
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
