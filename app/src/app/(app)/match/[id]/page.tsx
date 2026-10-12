// /match/[id] — CompletedMatchLoaderView: fetches the full Match and
// routes by state. A live match opens the live screen, an upcoming one
// its preview, a finished one its result. While the Match loads (and its
// two crests warm) the page is the match screen's own silhouette; the
// screen it routes to keeps that silhouette up until ITS first requests
// have landed, so the reveal is one step, not two.
"use client";

import { useParams } from "next/navigation";
import { WifiOff } from "lucide-react";
import { Page } from "@/components/ui";
import { api, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { useReveal } from "@/lib/use-reveal";
import { normalizeMatch, type Json } from "@/lib/types";
import { LiveMatchScreen } from "@/features/matches/live/LiveMatchScreen";
import { CompletedMatchScreen } from "@/features/matches/live/CompletedMatchScreen";
import { UpcomingMatchScreen } from "@/features/matches/live/UpcomingMatchScreen";
import { MatchScreenSkeleton } from "@/features/matches/live/MatchSkeleton";

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? decodeURIComponent(params.id) : "";
  const { data: match, loading, error, reload } = useFetch(
    (signal) => api.get<Json>(endpoints.matchDetail(id), { signal }).then(normalizeMatch),
    [id],
    { enabled: !!id },
  );
  const revealed = useReveal(loading || (!match && !error), () => [match?.team1LogoURL, match?.team2LogoURL]);

  if (!revealed && !error) return <MatchScreenSkeleton />;

  if (!match) {
    return (
      <Page>
        <div className="flex flex-col items-center gap-2.5 py-24 text-center">
          <WifiOff size={28} className="text-muted" />
          <span className="t-body-sm text-muted">Couldn&apos;t load this match</span>
          <button type="button" onClick={reload} className="t-label-md text-violet hover:underline underline-offset-2">Retry</button>
        </div>
      </Page>
    );
  }

  switch (match.status) {
    case "live": return <LiveMatchScreen key={match.id} match={match} />;
    case "upcoming": return <UpcomingMatchScreen key={match.id} match={match} />;
    default: return <CompletedMatchScreen key={match.id} match={match} />;
  }
}
