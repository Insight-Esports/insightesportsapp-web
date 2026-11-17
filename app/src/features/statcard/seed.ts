// seed.ts — what a scoreboard already has on screen when a name is clicked
// (the Match, the player's line and their table's team), handed to the card
// so it opens drawn (PlayerStatCardView(match:stat:teamName:)). A link or a
// reload passes none, and the card loads.
"use client";

import type { Match } from "@/lib/types";
import type { LivePlayerStat } from "@/features/matches/live/types";

export interface CardSeed { match: Match; stat: LivePlayerStat; teamName: string | null }

const seeds = new Map<string, CardSeed>();
const key = (matchId: string, playerId: string) => `${matchId}|${playerId}`;

export function rememberCardSeed(seed: CardSeed) {
  seeds.set(key(seed.match.id, seed.stat.id), seed);
  // Only the last few matter (a card is opened from the screen beneath it).
  while (seeds.size > 12) { const oldest = seeds.keys().next().value; if (oldest === undefined) break; seeds.delete(oldest); }
}

export function recallCardSeed(matchId: string, playerId: string): CardSeed | null {
  return seeds.get(key(matchId, playerId)) ?? null;
}

/** The card for one player in one match; `fromMatch` makes its match block go back to the match beneath. */
export function cardHref(matchId: string, playerId: string, fromMatch = false): string {
  const path = `/card/${encodeURIComponent(matchId)}/${encodeURIComponent(playerId)}`;
  return fromMatch ? `${path}?from=${encodeURIComponent(`match:${matchId}`)}` : path;
}
