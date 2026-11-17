// match-links.ts — a tournament game's two ways into its tournament (iOS
// LiveMatchView openSeries / openTournament):
//   the HUD's series line "Quarterfinal · Game 2 of 5 ›"  → the series page
//   the title strip's tournament name "Insight CS2 Cup 2 ›" → the bracket
// A match with no `series`: neither links. A series with no tournament_id:
// only the series line does.
//
// Never a second copy of a screen: opened from that series page (or that
// bracket), the link goes back to it. Anything opened from here carries this
// match's own path as `from`, so its Back (and a series page's Watch row)
// comes back here.
"use client";

import type { MouseEvent } from "react";
import { useSearchParams } from "next/navigation";
import type { Match } from "@/lib/types";
import { bracketHref, seriesHref } from "@/features/tournaments/routes";
import { matchSelfPath, pagePathFrom, pathnameOf, useBackToScreen } from "../from-match";

export interface ScreenLink {
  href: string;
  /** Goes back instead when the page is the one directly beneath. */
  onClick: (e: MouseEvent) => void;
}

export function useMatchTournamentLinks(match: Match): { series: ScreenLink | null; tournament: ScreenLink | null } {
  const from = useSearchParams().get("from");
  const self = matchSelfPath(match.id, from);
  // The page this match was opened from (a series page passes its own path).
  const opened = pagePathFrom(from);
  const openedIs = (page: string | null) => !!page && !!opened && pathnameOf(opened) === pathnameOf(page);

  const s = match.series ?? null;
  const seriesPage = s ? seriesHref(s.id) : null;
  const fromSeries = openedIs(seriesPage);
  const seriesTarget = s ? (fromSeries ? opened : seriesHref(s.id, self)) : null;

  const tournamentId = s?.tournamentId || null;
  const bracketPage = tournamentId ? bracketHref(tournamentId) : null;
  const fromBracket = openedIs(bracketPage);
  const bracketTarget = bracketPage ? (fromBracket ? opened : `${bracketPage}?from=${encodeURIComponent(self)}`) : null;

  const toSeries = useBackToScreen(seriesTarget, fromSeries);
  const toBracket = useBackToScreen(bracketTarget, fromBracket);
  return {
    series: seriesTarget ? { href: seriesTarget, onClick: toSeries } : null,
    tournament: bracketTarget ? { href: bracketTarget, onClick: toBracket } : null,
  };
}
