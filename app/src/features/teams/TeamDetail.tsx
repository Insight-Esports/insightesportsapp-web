// TeamDetail — TeamDetailView.swift.
//
// Spec order: header (logo · name · tier · region · game · rank) → Season →
// Map Pool (VAL/CS2) or Side Record (League) → Roster → Upcoming → Recent
// Games. Titles, team statistics, sides and the coach render only when the
// backend has rows for them (the app keeps those structs unplugged).
//
// Every entry path converges on the payload record: the screen fetches by
// id, and tolerates a NAME as the id (match cards link by name when a row
// shipped null team ids) by resolving it through search.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, Medal, Trophy, UserX } from "lucide-react";
import { api, ApiError, endpoints } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { clsx, fmt1, fmt2 } from "@/lib/format";
import { matchResultTime, normalizePlayers, normalizeTeam, normalizeTeams, teamStub, type Match, type Player, type Team } from "@/lib/types";
import { EmptyState, GamePill, InitialAvatar, LoadFailure, Page, SectionHeader, SkeletonBar, SkeletonLedger, SkeletonStatRow, StatCard, TeamMark, TierBadge } from "@/components/ui";
import { FollowButton } from "@/features/follow/FollowButton";
import { StripedTable } from "@/features/players/StatTable";
import { TeamMapPool } from "./TeamMapPool";
import { TeamRecentGamesList } from "./RecentGamesList";
import { UpcomingGamesList } from "./UpcomingGamesList";
import { normalizeCoachHistory, normalizeTeamSides, normalizeTeamStats, normalizeTeamTitles, type TeamSide, type TeamTitle } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The team the page shows, plus whether the backend knows it by this id
 *  (a stub built from a bare name can't load roster / follow). */
interface ResolvedTeam { team: Team; stub: boolean }

/** Resolve the route id to a Team: by id first; a name falls back to search. */
async function resolveTeam(id: string, gameHint: string | null, signal: AbortSignal): Promise<ResolvedTeam> {
  let team: Team | null = null;
  let stub = false;
  try {
    team = normalizeTeam(await api.get(endpoints.teamDetail(id), { signal }));
  } catch (e) {
    const notFound = e instanceof ApiError && (e.status === 404 || e.status === 400);
    if (!notFound && UUID.test(id)) throw e;
  }
  if (!team) {
    // Treat the id as a name (Team(name:) convenience init): combined
    // search first, then the teams list filtered by name.
    const name = id;
    const pickBest = (teams: Team[]) =>
      teams.find((t) => t.name.toLowerCase() === name.toLowerCase() && (!gameHint || t.game === gameHint))
      ?? teams.find((t) => t.name.toLowerCase() === name.toLowerCase())
      ?? teams.find((t) => !gameHint || t.game === gameHint)
      ?? teams[0] ?? null;
    try {
      const combined = await api.get<{ teams?: unknown }>(endpoints.search(name, gameHint), { signal });
      team = pickBest(normalizeTeams(combined?.teams ?? []));
    } catch { /* next door */ }
    if (!team) {
      for (const g of gameHint ? [gameHint] : ["VALORANT", "CS2", "League"]) {
        try {
          team = pickBest(normalizeTeams(await api.get(endpoints.teams(g, name, 10, 0), { signal })));
          if (team) break;
        } catch { /* keep trying */ }
      }
    }
    if (!team) { team = teamStub(name, gameHint ?? ""); stub = true; }
  }
  // Match-card taps pass a MINIMAL team (real id, zeroed stats); the full
  // list row has the record.
  if (!stub && team.wins === 0 && team.losses === 0 && team.game) {
    try {
      const full = normalizeTeams(await api.get(endpoints.teams(team.game, team.name, 10, 0), { signal })).find((t) => t.id === team!.id);
      if (full) team = full;
    } catch { /* keep what we have */ }
  }
  return { team, stub };
}

export function TeamDetail({ id }: { id: string }) {
  const params = useSearchParams();
  const gameHint = params.get("game");
  const { data, loading, error, connectionProblem, reload } = useFetch<ResolvedTeam>((signal) => resolveTeam(id, gameHint, signal), [id, gameHint]);
  const team = data?.team ?? null;

  if (loading && !team) {
    return (
      <Page>
        <TitleBar title="" />
        <div className="flex flex-col items-center gap-3 px-4 pt-4">
          <span className="size-20 rounded-2xl bg-surface" />
          <SkeletonBar width={150} height={16} />
          <SkeletonBar width={100} height={10} />
        </div>
        <div className="px-4 pt-6 flex flex-col gap-5"><SkeletonStatRow columns={4} /><SkeletonLedger rows={5} avatar={24} /></div>
      </Page>
    );
  }
  if (!team) {
    return (
      <Page>
        <TitleBar title="" />
        <LoadFailure error={error ?? "Content not found."} connectionProblem={connectionProblem} onRetry={reload} />
      </Page>
    );
  }
  return <TeamDetailLoaded team={team} stub={data?.stub ?? false} />;
}

function TitleBar({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3 pt-2 pb-2 bg-bg sticky top-0 z-10">
      <Link href="/teams" aria-label="Back to Teams" className="grid place-items-center size-8 rounded-lg text-primary hover:bg-card"><ChevronLeft size={18} strokeWidth={2.5} /></Link>
      <span className="text-[22px] font-bold tracking-[-0.4px] text-primary truncate flex-1">{title}</span>
      {trailing}
    </div>
  );
}

function TeamDetailLoaded({ team, stub }: { team: Team; stub: boolean }) {
  const game = team.game;
  const hasRealId = !stub;

  const roster = useFetch<Player[]>(async (signal) => normalizePlayers(await api.get(endpoints.teamPlayers(team.id), { signal })), [team.id], { enabled: hasRealId });
  const titles = useFetch(async (signal) => normalizeTeamTitles(await api.get(endpoints.teamTitles(team.id), { signal })), [team.id], { enabled: hasRealId });
  const sides = useFetch<TeamSide[]>(async (signal) => normalizeTeamSides(await api.get(endpoints.teamSides(team.id, game), { signal })), [team.id, game], { enabled: hasRealId && (game === "VALORANT" || game === "CS2") });
  const stats = useFetch(async (signal) => normalizeTeamStats(await api.get(endpoints.teamStats(team.id, game), { signal })), [team.id, game], { enabled: hasRealId && !!game });
  const coachHistory = useFetch(async (signal) => normalizeCoachHistory(await api.get(endpoints.coach(team.coach!.id!), { signal })), [team.coach?.id], { enabled: !!team.coach?.id });

  // Record and streak over exactly the games the Recent Games ledger has loaded.
  const [recentRows, setRecentRows] = useState<Match[] | null>(null);
  const derived = useMemo(() => deriveRecord(team, recentRows ?? []), [team, recentRows]);

  // Precedence: DB season aggregates → legacy wins/losses → derived from the listed matches.
  const seasonWins = (team.seasonWins ?? 0) + (team.seasonLosses ?? 0) > 0 ? (team.seasonWins as number) : team.wins + team.losses > 0 ? team.wins : derived.wins;
  const seasonLosses = (team.seasonWins ?? 0) + (team.seasonLosses ?? 0) > 0 ? (team.seasonLosses as number) : team.wins + team.losses > 0 ? team.losses : derived.losses;
  const seasonGames = seasonWins + seasonLosses;
  const streakColor = derived.streak && /Wins?$/.test(derived.streak) ? "text-primary" : "text-muted";

  // Roster buckets: every game fields FIVE; the first five starter-status
  // players start, everyone else joins the substitutes bucket.
  const players = roster.data ?? [];
  const rawStarters = players.filter((p) => (p.rosterStatus ?? "starter") === "starter");
  const starters = rawStarters.slice(0, 5);
  const substitutes = rawStarters.slice(5).concat(players.filter((p) => p.rosterStatus === "substitute"));
  const inactive = players.filter((p) => p.rosterStatus === "inactive");
  const [showFormer, setShowFormer] = useState(false);
  useEffect(() => setShowFormer(false), [team.id]);
  const ratingHeader = game === "VALORANT" ? "ACS" : game === "League" ? "KDA" : "RTG";

  const header = (
    <div className="flex flex-col items-center gap-3 px-4 pt-4 text-center">
      <TeamMark name={team.abbreviation} logoURL={team.logoURL} color="var(--surface)" size={80} />
      <span className="t-headline-lg text-primary">{team.name}</span>
      <div className="flex items-center gap-2">
        {team.tier === 1 ? <TierBadge tier={1} /> : null}
        {team.region ? <><span className="t-body-md text-secondary">{team.region}</span><span className="text-muted">•</span></> : null}
        {game ? <GamePill game={game} /> : null}
      </div>
      {(team.ranking ?? 0) > 0 ? (
        <div className="flex items-center gap-1 t-label-md"><span className="text-muted">Rank</span><span className="text-primary">#{team.ranking}</span></div>
      ) : null}
    </div>
  );

  const season = (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Season" />
      <div className="mx-4 rounded-xl border border-border-subtle overflow-hidden">
        <div className="flex items-center gap-1 px-3 py-1.5 t-label-sm text-muted uppercase">
          <span className="flex-1">Record</span><span className="w-16 text-right">Win %</span><span className="w-14 text-right">Games</span><span className="w-[78px] text-right">Streak</span>
        </div>
        <div className="flex items-center gap-1 px-3 py-3 bg-card">
          <span className="flex-1 t-mono-md text-primary">{seasonWins}–{seasonLosses}</span>
          <span className="w-16 text-right t-mono-md text-violet">{seasonGames > 0 ? `${Math.round((seasonWins / seasonGames) * 100)}%` : "—"}</span>
          <span className="w-14 text-right t-mono-md text-primary">{seasonGames}</span>
          <span className={clsx("w-[78px] text-right t-label-md truncate", streakColor)}>{derived.streak ?? "—"}</span>
        </div>
      </div>
    </section>
  );

  const rosterLedger = (list: Player[], dim?: boolean) => (
    <StripedTable className={dim ? "opacity-60" : undefined}
      header={<><span className="flex-1">Player</span><span className="w-[78px] shrink-0">Role</span><span className="w-12 shrink-0 text-right">{ratingHeader}</span></>}>
      {list.map((p) => <RosterRow key={p.id} player={p} game={game} />)}
    </StripedTable>
  );

  const rosterSection = (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Roster" />
      {roster.loading && hasRealId ? (
        <SkeletonLedger rows={5} avatar={24} className="mx-4" />
      ) : players.length === 0 ? (
        <EmptyState icon={<UserX />} title="No roster data for this team yet" subtitle="Check back soon" />
      ) : (
        <div className="px-4 flex flex-col gap-2">
          {rosterLedger(starters)}
          {rawStarters.length > 6 && players.every((p) => p.rosterStatus == null) ? (
            <span className="t-label-sm text-muted px-1">Full squad shown — starter/substitute designation coming soon</span>
          ) : null}
          {substitutes.length > 0 ? (
            <>
              <span className="t-label-sm text-muted uppercase px-1 pt-2">Substitutes</span>
              {rosterLedger(substitutes)}
            </>
          ) : null}
          {inactive.length > 0 ? (
            <>
              <button type="button" onClick={() => setShowFormer((v) => !v)} className="t-label-sm text-violet text-left px-1 pt-2 hover:underline">
                {showFormer ? "Hide former players" : `Show former players (${inactive.length})`}
              </button>
              {showFormer ? rosterLedger(inactive, true) : null}
            </>
          ) : null}
        </div>
      )}
    </section>
  );

  const upcoming = <UpcomingGamesList teamId={hasRealId ? team.id : null} teamName={team.name} game={game || null} />;
  const recent = (
    <TeamRecentGamesList teamId={team.id} game={game || null} perspective={{ teamId: hasRealId ? team.id : null, teamName: team.name }} onRows={setRecentRows} />
  );

  // ── Extras the backend serves (unplugged in the app; shown here only when non-empty) ──
  const titlesSection = titles.data && titles.data.titles.length > 0 ? (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Titles & Trophies" />
      <div className="flex gap-3 px-4 overflow-x-auto no-scrollbar">
        {titles.data.titles.map((t) => <TrophyCard key={t.id} title={t} />)}
      </div>
      <div className="flex flex-wrap gap-3 px-4">
        <SummaryPill count={titles.data.majorTitles} label="Major Titles" color="text-gold" />
        <SummaryPill count={titles.data.titles.length} label="Total Titles" color="text-violet" />
        {game === "League" && stats.data?.worldsAppearances != null ? <SummaryPill count={stats.data.worldsAppearances} label="Worlds Apps" color="text-success" /> : null}
      </div>
    </section>
  ) : null;

  const statsSection = stats.data && stats.data.totalMatches > 0 ? (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Team Statistics" />
      <div className="grid grid-cols-2 gap-2.5 px-4">
        <StatCard label={game === "League" ? "Games Played" : "Maps Played"} value={String(stats.data.totalMatches)} />
        <StatCard label="Win Rate" value={`${Math.round(team.winRate * 100)}%`} valueClassName={team.winRate >= 0.6 ? "text-success" : undefined} />
        {game === "VALORANT" && stats.data.avgTeamAcs != null ? <StatCard label="Avg Team ACS" value={String(Math.round(stats.data.avgTeamAcs))} valueClassName="text-violet" /> : null}
        {game === "CS2" && stats.data.hltvRating != null ? <StatCard label="HLTV Rating" value={fmt2(stats.data.hltvRating)} valueClassName="text-violet" /> : null}
        {(game === "VALORANT" || game === "CS2") && stats.data.avgTeamAdr != null ? <StatCard label="Avg Team ADR" value={String(Math.round(stats.data.avgTeamAdr))} /> : null}
        {game === "League" && stats.data.avgKda != null ? <StatCard label="Avg KDA" value={fmt2(stats.data.avgKda)} valueClassName="text-violet" /> : null}
        {game === "League" && stats.data.avgGoldDiffAt15 != null ? (
          <StatCard label="Gold Diff @15" value={`${stats.data.avgGoldDiffAt15 >= 0 ? "+" : ""}${Math.trunc(stats.data.avgGoldDiffAt15)}`} valueClassName={stats.data.avgGoldDiffAt15 >= 0 ? "text-success" : "text-error"} />
        ) : null}
      </div>
    </section>
  ) : null;

  const sidesSection = sides.data && sides.data.length > 0 ? (
    <section className="flex flex-col gap-3">
      <SectionHeader title={game === "CS2" ? "T/CT Side Stats" : "Attack/Defense Split"} />
      <div className="grid grid-cols-2 gap-3 px-4">
        {sides.data.map((s) => <SideStatCard key={s.side} side={s} />)}
      </div>
    </section>
  ) : null;

  const coachSection = team.coach?.name ? (
    <section className="flex flex-col gap-3">
      <SectionHeader title="Coach" />
      <div className="mx-4 rounded-xl border border-border-subtle bg-card overflow-hidden">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <InitialAvatar name={team.coach.name} imageURL={team.coach.imageURL} size={40} />
          <span className="flex flex-col min-w-0 flex-1">
            <span className="t-body-md text-primary truncate">{team.coach.name}</span>
            <span className="t-label-sm text-muted truncate">
              {[team.coach.role ?? "Head Coach", team.coach.nationality, team.coach.since ? `since ${team.coach.since}` : null].filter(Boolean).join(" · ")}
            </span>
          </span>
        </div>
        {coachHistory.data && coachHistory.data.length > 0 ? (
          <div className="hairline-t">
            {coachHistory.data.map((h, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3.5 py-2 [&+&]:border-t [&+&]:border-border-subtle">
                <TeamMark name={h.teamName ?? "?"} logoURL={h.teamLogoURL} size={20} />
                <span className="flex-1 t-body-sm text-secondary truncate">{h.teamName ?? "—"}{h.role ? ` · ${h.role}` : ""}</span>
                <span className="t-label-sm text-muted">{[h.from, h.to ?? "present"].filter(Boolean).join(" – ")}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  ) : null;

  return (
    <Page>
      <TitleBar title={team.name} trailing={hasRealId ? <FollowButton targetType="team" targetId={team.id} compact /> : null} />
      {header}
      {/* Phones: the iOS order. Desktop: Upcoming + the extra sections form a rail beside Season / Map Pool / Roster / Recent Games. */}
      <div className="pt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:pr-4">
        {season}
        <TeamMapPool teamId={hasRealId ? team.id : ""} game={game} teamName={team.name} />
        {rosterSection}
        <div className="flex flex-col gap-5 lg:col-start-2 lg:row-start-1 lg:row-span-4">
          {upcoming}
          {titlesSection}
          {statsSection}
          {sidesSection}
          {coachSection}
        </div>
        {recent}
      </div>
    </Page>
  );
}

// ── Derivations (TeamDetailViewModel.deriveRecord) ────────────────────────
function deriveRecord(team: Team, matches: Match[]): { wins: number; losses: number; streak: string | null } {
  const mine = matches.filter((m) => m.status === "completed");
  const won = (m: Match) => {
    const weAreTeam1 = m.team1Id === team.id || m.team1Name === team.name;
    return weAreTeam1 ? m.team1Score > m.team2Score : m.team2Score > m.team1Score;
  };
  const wins = mine.filter(won).length;
  const newestFirst = mine.slice().sort((a, b) => matchResultTime(b).localeCompare(matchResultTime(a)));
  let streak: string | null = null;
  if (newestFirst.length) {
    const w = won(newestFirst[0]);
    let run = 0;
    for (const m of newestFirst) { if (won(m) === w) run++; else break; }
    streak = run === 1 ? (w ? "1 Win" : "1 Loss") : `${run} ${w ? "Wins" : "Losses"}`;
  }
  return { wins, losses: mine.length - wins, streak };
}

// ── Rows & cards ──────────────────────────────────────────────────────────
function RosterRow({ player, game }: { player: Player; game: string }) {
  const role = !player.role || player.role.toLowerCase() === "unknown" ? "—" : player.role;
  const rating = player.rating == null ? "—" : game === "VALORANT" ? String(Math.round(player.rating)) : game === "League" ? fmt1(player.rating) : fmt2(player.rating);
  return (
    <Link href={`/players/${encodeURIComponent(player.id)}`} className="flex items-center gap-1 px-3 py-2.5 hover:bg-surface/70 transition-colors">
      <span className="flex-1 min-w-0 flex items-center gap-2">
        <InitialAvatar name={player.name} imageURL={player.imageURL} size={24} />
        <span className="t-body-sm text-primary truncate">{player.name}</span>
      </span>
      <span className="w-[78px] shrink-0 t-label-sm text-muted truncate">{role}</span>
      <span className={clsx("w-12 shrink-0 text-right t-mono-sm", player.rating == null ? "text-muted" : "text-violet")}>{rating}</span>
    </Link>
  );
}

function TrophyCard({ title }: { title: TeamTitle }) {
  return (
    <div className={clsx("flex flex-col items-center gap-2 w-[124px] shrink-0 p-3 rounded-xl bg-card border", title.isMajor ? "border-border-gold" : "border-border-subtle")}>
      <span className="grid place-items-center size-14 rounded-full bg-surface border border-border-subtle">
        {title.isMajor ? <Trophy size={24} className="text-gold" /> : <Medal size={24} className="text-violet" />}
      </span>
      <span className="t-label-md text-primary text-center line-clamp-2">{title.title}</span>
      {title.year != null ? <span className="t-label-sm text-muted">{title.year}</span> : null}
    </div>
  );
}

function SummaryPill({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface border border-border-subtle">
      <span className={clsx("t-mono-md", color)}>{count}</span>
      <span className="t-label-sm text-muted">{label}</span>
    </span>
  );
}

function SideStatCard({ side }: { side: TeamSide }) {
  // CS2's authentic palette: T desert tan, CT dark blue; VALORANT borrows the same warm/cool split.
  const color = side.side === "attacker" ? "text-val-attack" : side.side === "defender" ? "text-val-defense" : side.side === "T" ? "text-cs-t" : side.side === "CT" ? "text-cs-ct" : "text-violet";
  const pm = side.avgPlusMinus;
  const rows: [string, string, string][] = [
    ["Avg K", fmt1(side.avgKills), "text-success"],
    ["Avg D", fmt1(side.avgDeaths), "text-error"],
    ["ADR", String(Math.round(side.avgAdr)), "text-primary"],
    ["+/-", `${pm >= 0 ? "+" : ""}${fmt1(pm)}`, pm >= 0 ? "text-success" : "text-error"],
  ];
  return (
    <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-card border border-border-subtle">
      <span className={clsx("t-label-lg text-center", color)}>{side.label}</span>
      <div className="hairline-b" />
      {rows.map(([label, value, cls]) => (
        <div key={label} className="flex justify-between"><span className="t-label-sm text-muted">{label}</span><span className={clsx("t-mono-sm", cls)}>{value}</span></div>
      ))}
    </div>
  );
}
