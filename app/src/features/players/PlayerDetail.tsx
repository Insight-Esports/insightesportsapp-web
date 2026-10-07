// PlayerDetail — PlayerDetailView.swift.
//
// Sections: header → Recent Form → All-Time → Top Agents / Champion Pool
// (not CS2) → Upcoming (their team's next fixtures) → Recent Games →
// Player Comments. Recent Form derives from the very rows the Recent
// Games table shows (one source, no contradictions); All-Time from the
// payload's career_stats or a wider client-side aggregate.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { fmt1, fmt2 } from "@/lib/format";
import { normalizePlayer, normalizePlayers, normalizeTeam, type Player, type PlayerCareerStats } from "@/lib/types";
import { InitialAvatar, LoadFailure, Page, SectionHeader, SkeletonBar, SkeletonLedger, SkeletonStatRow, TeamMark } from "@/components/ui";
import { FollowButton } from "@/features/follow/FollowButton";
import { UpcomingGamesList } from "@/features/teams/UpcomingGamesList";
import { StatTable, StripedTable, type StatCell } from "./StatTable";
import { PlayerRecentGamesList } from "./PlayerRecentGamesList";
import { PlayerComments } from "./PlayerComments";
import { normalizePlayerGameRows, normalizePlayerOverview, rowKDA, type AgentStats, type PlayerGameRow } from "./types";

export function PlayerDetail({ id }: { id: string }) {
  const { data: player, loading, error, connectionProblem, reload } = useFetch<Player>(
    async (signal) => normalizePlayer(await api.get(endpoints.playerDetail(id), { signal })),
    [id],
  );

  if (loading && !player) {
    return (
      <Page>
        <TitleBar title="" />
        <div className="flex flex-col items-center gap-3 px-4 pt-4">
          <span className="size-20 rounded-full bg-surface" />
          <SkeletonBar width={140} height={16} />
          <SkeletonBar width={90} height={10} />
        </div>
        <div className="px-4 pt-6 flex flex-col gap-5">
          <SkeletonStatRow columns={5} />
          <SkeletonLedger rows={6} avatar={20} />
        </div>
      </Page>
    );
  }
  if (!player) {
    return (
      <Page>
        <TitleBar title="" />
        <LoadFailure error={error ?? "Content not found."} connectionProblem={connectionProblem} onRetry={reload} />
      </Page>
    );
  }
  return <PlayerDetailLoaded player={player} />;
}

function TitleBar({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3 pt-2 pb-2 bg-bg sticky top-0 z-10">
      <Link href="/players" aria-label="Back to Players" className="grid place-items-center size-8 rounded-lg text-primary hover:bg-card"><ChevronLeft size={18} strokeWidth={2.5} /></Link>
      <span className="text-[22px] font-bold tracking-[-0.4px] text-primary truncate flex-1">{title}</span>
      {trailing}
    </div>
  );
}

function PlayerDetailLoaded({ player: initial }: { player: Player }) {
  const [player, setPlayer] = useState(initial);
  useEffect(() => setPlayer(initial), [initial]);
  const game = player.game;

  // Recent rows (first page) feed Recent Form.
  const [recentRows, setRecentRows] = useState<PlayerGameRow[] | null>(null);
  const form = useMemo(() => deriveAverages(recentRows?.slice(0, 10) ?? []), [recentRows]);

  // Agents/champions come from the same overview the prediction screens use.
  const overview = useFetch(async (signal) => normalizePlayerOverview(await api.get(endpoints.playerOverview(player.id, game), { signal }), game), [player.id, game], { enabled: game !== "CS2" });

  // ALL-TIME (our records): a wider fetch aggregated client-side; yields to
  // the backend's career_stats once backfilled. Also the photo/crest
  // enrichment when the row we arrived with lacked them.
  const [derivedCareer, setDerivedCareer] = useState<PlayerCareerStats | null>(null);
  useEffect(() => {
    let active = true;
    setDerivedCareer(null);
    if (!player.careerStats) {
      api.get(endpoints.playerMatches(player.id, 100)).then((raw) => {
        if (!active) return;
        const rows = normalizePlayerGameRows(raw);
        if (rows.length > 10) setDerivedCareer(aggregateCareer(rows));
      }).catch(() => { /* real empty state */ });
    }
    if (!player.imageURL || !player.teamLogoURL) {
      api.get(endpoints.topPlayers(game, null, null, player.name, 5)).then((raw) => {
        if (!active) return;
        const hit = normalizePlayers(raw).find((p) => p.id === player.id);
        if (hit && ((!player.imageURL && hit.imageURL) || (!player.teamLogoURL && hit.teamLogoURL))) {
          setPlayer((p) => ({ ...p, imageURL: p.imageURL ?? hit.imageURL, teamLogoURL: p.teamLogoURL ?? hit.teamLogoURL }));
        } else if (!player.teamLogoURL && player.teamId) {
          api.get(endpoints.teamDetail(player.teamId)).then((t) => {
            if (!active) return;
            const team = normalizeTeam(t);
            if (team.logoURL) setPlayer((p) => ({ ...p, teamLogoURL: p.teamLogoURL ?? team.logoURL }));
          }).catch(() => { /* ignore */ });
        }
      }).catch(() => { /* ignore */ });
    }
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id]);

  const career = player.careerStats ?? derivedCareer;
  const teamHref = player.teamId ? `/teams/${encodeURIComponent(player.teamId)}` : player.teamName ? `/teams/${encodeURIComponent(player.teamName)}?game=${encodeURIComponent(game)}` : null;

  const header = (
    <div className="flex flex-col items-center gap-3 px-4 pt-4 text-center">
      <InitialAvatar name={player.name} imageURL={player.imageURL} size={80} />
      <div className="flex flex-col gap-1">
        <span className="t-headline-lg text-primary">{player.name}</span>
        {player.realName ? <span className="t-body-md text-muted">{player.realName}</span> : null}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {player.teamName && teamHref ? (
          <Link href={teamHref} className="inline-flex items-center gap-1.5 text-secondary hover:text-primary transition-colors">
            <TeamMark name={player.teamName} logoURL={player.teamLogoURL} size={18} />
            <span className="t-body-md">{player.teamName}</span>
            <ChevronRight size={10} strokeWidth={3} className="text-muted" />
          </Link>
        ) : null}
        {player.role ? (
          <>
            {player.teamName ? <span className="text-muted">•</span> : null}
            <span className="t-body-md text-secondary">{player.role}</span>
          </>
        ) : null}
      </div>
    </div>
  );

  const recentForm = (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Recent Form" />
      <div className="px-4">
        {recentRows === null ? <SkeletonStatRow columns={5} /> : <StatTable cells={recentFormCells(game, form)} />}
      </div>
    </section>
  );

  const allTime = career ? (
    <section className="flex flex-col gap-3">
      <SectionHeader title="All-Time" />
      <div className="px-4 flex flex-col gap-2.5">
        <StatTable cells={allTimeCells(game, career)} />
        <StatTable cells={careerBestCells(game, career)} />
      </div>
    </section>
  ) : null;

  const agents = game !== "CS2" ? (
    <section className="flex flex-col gap-3">
      <SectionHeader title={game === "League" ? "Champion Pool" : "Top Agents"} />
      {overview.loading && !overview.data ? (
        <div className="mx-4 h-20 rounded-xl bg-card border border-border-subtle" />
      ) : !overview.data || overview.data.agents.length === 0 ? (
        <p className="px-4 t-body-sm text-muted">{game === "League" ? "No champion data available" : "No agent data available"}</p>
      ) : (
        <div className="px-4"><AgentTable agents={overview.data.agents} game={game} /></div>
      )}
    </section>
  ) : null;

  const upcoming = player.teamName ? <UpcomingGamesList teamId={player.teamId} teamName={player.teamName} game={game} /> : null;
  const recent = <PlayerRecentGamesList playerId={player.id} game={game} onRows={setRecentRows} />;
  const comments = <PlayerComments player={player} />;

  return (
    <Page>
      <TitleBar title={player.name} trailing={<FollowButton targetType="player" targetId={player.id} compact />} />
      {header}
      {/* Phones: the iOS order top to bottom. Desktop: the rail (agents, upcoming) sits beside the main column. Every section renders exactly once. */}
      <div className={`pt-5 grid gap-5 lg:items-start ${agents || upcoming ? "lg:grid-cols-[minmax(0,1fr)_360px] lg:pr-4" : ""}`}>
        <div className="lg:col-start-1">{recentForm}</div>
        {allTime ? <div className="lg:col-start-1">{allTime}</div> : null}
        {agents || upcoming ? <div className="lg:col-start-2 lg:row-start-1 lg:row-span-4 flex flex-col gap-5">{agents}{upcoming}</div> : null}
        <div className="lg:col-start-1">{recent}</div>
        <div className="lg:col-start-1">{comments}</div>
      </div>
    </Page>
  );
}

// ── Derivations (PlayerDetailViewModel) ───────────────────────────────────
interface Averages {
  gamesPlayed: string; avgKDA: string; avgKDALine: [string, string, string] | null; maxKills: string;
  avgACS: string; avgRating: string;
}
function deriveAverages(rows: PlayerGameRow[]): Averages {
  const dash: Averages = { gamesPlayed: "—", avgKDA: "—", avgKDALine: null, maxKills: "—", avgACS: "—", avgRating: "—" };
  if (rows.length === 0) return dash;
  const n = rows.length;
  const k = rows.reduce((s, r) => s + r.kills, 0);
  const d = rows.reduce((s, r) => s + r.deaths, 0);
  const a = rows.reduce((s, r) => s + r.assists, 0);
  const acs = rows.map((r) => r.acs).filter((v): v is number => v != null);
  const rating = rows.map((r) => r.rating).filter((v): v is number => v != null);
  return {
    gamesPlayed: String(n),
    avgKDA: fmt1(d > 0 ? (k + a) / d : k + a),
    avgKDALine: [fmt1(k / n), fmt1(d / n), fmt1(a / n)],
    maxKills: String(Math.max(...rows.map((r) => r.kills))),
    avgACS: acs.length ? String(Math.round(acs.reduce((s, v) => s + v, 0) / acs.length)) : "—",
    avgRating: rating.length ? fmt2(rating.reduce((s, v) => s + v, 0) / rating.length) : "—",
  };
}
function kdaCells(line: [string, string, string] | null): StatCell[] {
  if (!line) return [{ label: "K/D/A", value: "—" }];
  return [{ label: "K", value: line[0] }, { label: "D", value: line[1] }, { label: "A", value: line[2] }];
}
function recentFormCells(game: string, f: Averages): StatCell[] {
  switch (game) {
    case "VALORANT": return [{ label: "Avg ACS", value: f.avgACS, marquee: true }, ...kdaCells(f.avgKDALine), { label: "Games", value: f.gamesPlayed }];
    case "CS2":
      return f.avgRating !== "—"
        ? [{ label: "Avg Rating", value: f.avgRating, marquee: true }, ...kdaCells(f.avgKDALine), { label: "Games", value: f.gamesPlayed }]
        : [...kdaCells(f.avgKDALine), { label: "Most Kills", value: f.maxKills }, { label: "Games", value: f.gamesPlayed }];
    case "League": return [{ label: "Avg KDA", value: f.avgKDA, marquee: true }, ...kdaCells(f.avgKDALine), { label: "Games", value: f.gamesPlayed }];
    default: return [];
  }
}
function allTimeCells(game: string, c: PlayerCareerStats): StatCell[] {
  const cells: StatCell[] = [];
  if (game === "VALORANT" && c.avgACS != null) cells.push({ label: "Avg ACS", value: String(Math.round(c.avgACS)), marquee: true });
  if (game === "CS2" && c.avgRating != null) cells.push({ label: "Avg Rating", value: fmt2(c.avgRating), marquee: true });
  if (game === "League" && c.avgKDA != null) cells.push({ label: "Avg KDA", value: fmt1(c.avgKDA), marquee: true });
  if (c.avgKills != null && c.avgDeaths != null && c.avgAssists != null) {
    cells.push({ label: "K", value: fmt1(c.avgKills) }, { label: "D", value: fmt1(c.avgDeaths) }, { label: "A", value: fmt1(c.avgAssists) });
  }
  if (c.gamesPlayed != null) cells.push({ label: "Games", value: String(c.gamesPlayed) });
  return cells;
}
function careerBestCells(game: string, c: PlayerCareerStats): StatCell[] {
  const cells: StatCell[] = [];
  if (game === "VALORANT" && c.bestACS != null) cells.push({ label: "Best ACS", value: String(Math.round(c.bestACS)), marquee: true });
  if (game === "CS2" && c.bestRating != null) cells.push({ label: "Best Rating", value: fmt2(c.bestRating), marquee: true });
  if (game === "League" && c.bestKDA != null) cells.push({ label: "Best KDA", value: fmt1(c.bestKDA), marquee: true });
  if (c.maxKills != null) cells.push({ label: "Most Kills", value: String(c.maxKills) });
  return cells;
}
function aggregateCareer(rows: PlayerGameRow[]): PlayerCareerStats {
  const n = rows.length;
  const avg = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null);
  const max = (vals: number[]) => (vals.length ? Math.max(...vals) : null);
  const acs = rows.map((r) => r.acs).filter((v): v is number => v != null);
  const rating = rows.map((r) => r.rating).filter((v): v is number => v != null);
  const kda = rows.map((r) => r.kda).filter((v): v is number => v != null);
  return {
    gamesPlayed: n,
    avgKills: rows.reduce((s, r) => s + r.kills, 0) / n,
    avgDeaths: rows.reduce((s, r) => s + r.deaths, 0) / n,
    avgAssists: rows.reduce((s, r) => s + r.assists, 0) / n,
    avgACS: avg(acs), avgRating: avg(rating), avgKDA: avg(kda),
    bestACS: max(acs), bestRating: max(rating), bestKDA: max(kda.length ? kda : rows.map(rowKDA)),
    maxKills: max(rows.map((r) => r.kills)),
  };
}

// ── Top agents table (AgentRow) ───────────────────────────────────────────
function AgentTable({ agents, game }: { agents: AgentStats[]; game: string }) {
  const isLeague = game === "League";
  const hasMarquee = agents.some((a) => a.avgMarquee != null);
  return (
    <StripedTable
      header={
        <>
          <span className="flex-1">{isLeague ? "Champion" : "Agent"}</span>
          <span className="w-12 shrink-0 text-center">Games</span>
          <span className="w-[52px] shrink-0 text-center">Win %</span>
          {!isLeague ? <span className="w-12 shrink-0 text-center">{hasMarquee ? (game === "VALORANT" ? "ACS" : "RTG") : "Avg K"}</span> : null}
          <span className="w-12 shrink-0 text-center">KDA</span>
        </>
      }
    >
      {agents.map((a) => (
        <div key={a.name} className="flex items-center gap-1 px-3 py-2.5">
          <span className="flex-1 min-w-0 flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-muted" />
            <span className="t-body-sm text-primary truncate">{a.name}</span>
          </span>
          <span className="w-12 shrink-0 text-center t-mono-sm text-muted">{a.matches}</span>
          <span className="w-[52px] shrink-0 text-center t-mono-sm text-primary">{a.winRate > 0 ? `${Math.round(a.winRate)}%` : "—"}</span>
          {!isLeague ? (
            <span className="w-12 shrink-0 text-center t-mono-sm text-violet">
              {a.avgMarquee != null ? (game === "VALORANT" ? String(Math.round(a.avgMarquee)) : fmt2(a.avgMarquee)) : a.avgStat > 0 ? fmt1(a.avgStat) : "—"}
            </span>
          ) : null}
          <span className={`w-12 shrink-0 text-center t-mono-sm ${isLeague ? "text-violet" : "text-primary"}`}>
            {isLeague ? (a.avgStat > 0 ? fmt1(a.avgStat) : "—") : a.avgKDA != null ? fmt1(a.avgKDA) : "—"}
          </span>
        </div>
      ))}
    </StripedTable>
  );
}
