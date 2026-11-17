// /card/[matchId]/[playerId] — PlayerStatCardView: one player in one match.
// A name on a live or finished scoreboard opens it with `?from=match:<id>`
// (its match block and Back return to the match beneath); a shared link
// opens it on its own.
"use client";

import { useParams, useSearchParams } from "next/navigation";
import { StatCardScreen } from "@/features/statcard/StatCardScreen";

export default function StatCardPage() {
  const params = useParams<{ matchId: string; playerId: string }>();
  const matchId = decodeURIComponent(String(params?.matchId ?? ""));
  const playerId = decodeURIComponent(String(params?.playerId ?? ""));
  const fromMatch = useSearchParams().get("from") === `match:${matchId}`;
  return <StatCardScreen key={`${matchId}|${playerId}`} matchId={matchId} playerId={playerId} fromMatch={fromMatch} />;
}
