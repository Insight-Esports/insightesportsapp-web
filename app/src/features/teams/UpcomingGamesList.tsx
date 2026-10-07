// UpcomingGamesList — RecentGamesList.swift's UpcomingGamesList.
//
// A team's next fixtures (from the rolling /matches/upcoming feed, scoped
// to this team and game) — the same table on the team page and on its
// players' pages. The calendar button links to the team's month view.
"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { formatDate, formatTime } from "@/lib/format";
import { normalizeMatches, type Match } from "@/lib/types";
import { SectionHeader, SkeletonLedger, TeamMark } from "@/components/ui";
import { StripedTable } from "@/features/players/StatTable";

export function UpcomingGamesList({ teamId, teamName, game, limit = 5 }: { teamId: string | null; teamName: string; game: string | null; limit?: number }) {
  const { data, loading } = useFetch<Match[]>(async (signal) => {
    const all = normalizeMatches(await api.get(endpoints.upcomingMatches, { signal }));
    const cutoff = Date.now() - 45 * 60 * 1000;
    return all
      .filter((m) => new Date(m.scheduledAt).getTime() > cutoff)
      .filter((m) => !game || m.game === game)
      .filter((m) => (teamId != null && (m.team1Id === teamId || m.team2Id === teamId)) || m.team1Name === teamName || m.team2Name === teamName)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, limit);
  }, [teamId, teamName, game, limit]);

  const calendarHref = `/schedule?${new URLSearchParams({ ...(game ? { game } : {}), team: teamId ?? teamName }).toString()}`;
  const rows = data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title="Upcoming"
        trailing={
          <Link href={calendarHref} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-violet/45 text-violet t-label-md hover:bg-violet/10 transition-colors">
            <Calendar size={13} strokeWidth={2.5} />Calendar
          </Link>
        }
      />
      {loading && !data ? (
        <SkeletonLedger rows={3} avatar={20} className="mx-4" />
      ) : rows.length === 0 ? (
        <p className="t-body-sm text-muted text-center py-4">No upcoming games scheduled</p>
      ) : (
        <div className="px-4">
          <StripedTable
            header={
              <>
                <span className="w-[52px] shrink-0">Date</span>
                <span className="flex-1">Opponent</span>
                <span className="w-[76px] shrink-0 text-right">Time</span>
              </>
            }
          >
            {rows.map((m) => {
              const weAreTeam1 = (teamId != null && m.team1Id === teamId) || m.team1Name === teamName;
              const opp = weAreTeam1 ? m.team2Name : m.team1Name;
              const oppLogo = weAreTeam1 ? m.team2LogoURL : m.team1LogoURL;
              return (
                <Link key={m.id} href={`/match/${encodeURIComponent(m.id)}`} className="flex items-center gap-1 px-3 py-2.5 hover:bg-surface/70 transition-colors">
                  <span className="w-[52px] shrink-0 t-label-sm text-muted tabular-nums">{formatDate(m.scheduledAt)}</span>
                  <span className="flex-1 min-w-0 flex items-center gap-1.5">
                    <TeamMark name={opp} logoURL={oppLogo} size={20} />
                    <span className="t-body-sm text-primary truncate">{opp}</span>
                  </span>
                  <span className="w-[76px] shrink-0 text-right t-mono-sm text-violet whitespace-nowrap">{formatTime(m.scheduledAt)}</span>
                </Link>
              );
            })}
          </StripedTable>
        </div>
      )}
    </section>
  );
}
