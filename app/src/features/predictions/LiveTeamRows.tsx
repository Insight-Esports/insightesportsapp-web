// predictions/LiveTeamRows.tsx — the live match page's Predictions section
// (LiveMatchSections.swift, parity doc 2026-10-28 §11): under the two top
// players, both teams as rows — 22px crest, name, "12 – 9 · leading",
// chevron → the team's Analyze page in live mode. Ids, crests and the round
// score come from the props when the screen has them, else from the app's
// shared GET /matches/live.
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { liveMatchById, useLiveMatches } from "@/lib/live-matches";
import { TeamMark } from "@/components/ui";
import { liveScoreLine } from "@/components/ui/entity-header";
import { flowHref } from "./flow";

export interface LiveTeamSide { id?: string | null; name: string; logoURL?: string | null; score?: number | null; color: string }

export function LiveTeamPredictRows({ game, matchId, team1, team2, active = true }: { game: string; matchId: string; team1: LiveTeamSide; team2: LiveTeamSide; active?: boolean }) {
  const list = useLiveMatches(active);
  const m = liveMatchById(list, matchId);
  const sides = [
    { ...team1, id: team1.id ?? m?.team1Id ?? null, logoURL: team1.logoURL ?? m?.team1LogoURL ?? null, score: team1.score ?? m?.team1Score ?? null, oppScore: team2.score ?? m?.team2Score ?? null },
    { ...team2, id: team2.id ?? m?.team2Id ?? null, logoURL: team2.logoURL ?? m?.team2LogoURL ?? null, score: team2.score ?? m?.team2Score ?? null, oppScore: team1.score ?? m?.team1Score ?? null },
  ];
  return (
    <>
      {sides.map((s) => {
        if (!s.id) return null;
        const line = s.score != null && s.oppScore != null
          ? `${s.score} – ${s.oppScore} · ${s.score > s.oppScore ? "leading" : s.score < s.oppScore ? "trailing" : "level"}`
          : m ? liveScoreLine(m, s.id) : null;
        return (
          <Link
            key={s.id}
            href={flowHref.options({ game, targetType: "team", targetId: s.id, targetName: s.name, isLive: true, matchId })}
            className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface hover:bg-surface/70 transition-colors"
          >
            <TeamMark name={s.name} logoURL={s.logoURL} color={s.color} size={22} />
            <span className="flex flex-col min-w-0">
              <span className="t-body-md text-primary truncate">{s.name}</span>
              {line ? <span className="t-label-sm text-muted truncate">{line}</span> : null}
            </span>
            <span className="flex-1" />
            <ChevronRight size={11} className="text-muted" />
          </Link>
        );
      })}
    </>
  );
}
