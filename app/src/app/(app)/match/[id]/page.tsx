// /match/[id] — CompletedMatchLoaderView: fetches the full Match and
// routes by state. A live match opens the live screen, an upcoming one
// its preview, a finished one its result.
"use client";

import { useParams } from "next/navigation";
import { WifiOff } from "lucide-react";
import { Page, SkeletonMatchCard, SkeletonStatRow, Spinner } from "@/components/ui";
import { api, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { normalizeMatch, type Json } from "@/lib/types";
import { LiveMatchScreen } from "@/features/matches/live/LiveMatchScreen";
import { CompletedMatchScreen } from "@/features/matches/live/CompletedMatchScreen";
import { UpcomingMatchScreen } from "@/features/matches/live/UpcomingMatchScreen";

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? decodeURIComponent(params.id) : "";
  const { data: match, loading, error, reload } = useFetch(
    (signal) => api.get<Json>(endpoints.matchDetail(id), { signal }).then(normalizeMatch),
    [id],
    { enabled: !!id },
  );

  if (loading || (!match && !error)) {
    return (
      <Page wide>
        <div className="flex items-center gap-2 px-4 pt-3 pb-2"><Spinner size={14} /><span className="t-label-md text-muted">Loading match</span></div>
        <div className="px-4 flex flex-col gap-4 max-w-[760px]">
          <SkeletonMatchCard />
          <SkeletonStatRow columns={4} />
          <SkeletonStatRow columns={6} />
        </div>
      </Page>
    );
  }

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
