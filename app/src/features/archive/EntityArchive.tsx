// EntityArchive — Archive.swift's team and player screens:
//   /teams/[id]/matches     "All Matches"
//   /players/[id]/history   "Match History"
// A line ("Sentinels · 1,204 matches since 2016"), year chips (All, then the
// years from /archive/years, ?year= in the URL), then month sections, newest
// first, cursor-paged as the list scrolls. Team rows are the team page's
// recent-game row from that team's side, dated by played_at; player rows are
// the player's own line, their side and W/L taken from player_stat.team_id /
// player_stat.won so old games stay right after an org change.
"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, LoadFailure, Page, SkeletonBar, SkeletonLedger, TeamMark } from "@/components/ui";
import { NavBar } from "@/components/shell/NavBar";
import { api, endpoints } from "@/lib/api";
import { clsx, fmt1, fmt2 } from "@/lib/format";
import { useFetch } from "@/lib/use-fetch";
import { normalizePlayer, normalizeTeam } from "@/lib/types";
import { playerCacheKey, recallPlayer, recallTeam } from "@/features/entity-cache";
import { DateSectionHeader } from "@/features/matches/shared";
import { matchHref } from "@/features/matches/cards";
import { StripedTable } from "@/features/players/StatTable";
import { RecentGameRow } from "@/features/teams/RecentGamesList";
import { useArchiveMatches, useArchiveSwitch, useArchiveYears } from "./data";
import { ArchiveColumn, ArchiveGlyph, ArchiveOff, LoadMoreFooter, PremiumWall, PremiumWindowNote, YearChips } from "./shared";
import { formatUtc, monthLabel, utcMonthKey, type ArchiveMatch } from "./types";

type Kind = "team" | "player";
interface Subject { name: string; game: string }

/** The team / player the screen is about: the remembered row first, the record underneath. */
function useSubject(kind: Kind, id: string) {
  const recalled = useMemo<Subject | null>(() => {
    if (kind === "team") { const t = recallTeam(id); return t ? { name: t.name, game: t.game } : null; }
    const p = recallPlayer(id);
    return p ? { name: p.name, game: p.game } : null;
  }, [kind, id]);
  const team = useFetch(async (signal) => normalizeTeam(await api.get(endpoints.teamDetail(id), { signal })), [id], { enabled: kind === "team", cacheKey: `archive:team:${id}` });
  const player = useFetch(async (signal) => normalizePlayer(await api.get(endpoints.playerDetail(id), { signal })), [id], { enabled: kind === "player", cacheKey: playerCacheKey(id) });
  const fetched = kind === "team" ? team.data : player.data;
  return fetched && fetched.id === id ? { name: fetched.name, game: fetched.game } : recalled;
}

export function EntityArchive({ kind, id }: { kind: Kind; id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const archive = useArchiveSwitch();
  const subject = useSubject(kind, id);
  const yearParam = Number(params.get("year"));
  const year = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 2100 ? yearParam : null;
  const setYear = (y: number | null) => {
    const next = new URLSearchParams(params.toString());
    if (y === null) next.delete("year"); else next.set("year", String(y));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const scope = kind === "team" ? { team: id } : { player: id };
  const years = useArchiveYears(scope, !archive.off);
  const list = useArchiveMatches(archive.off ? null : { ...scope, from: year ? `${year}-01-01` : null, to: year ? `${year}-12-31` : null });

  const total = (years.data ?? []).reduce((s, y) => s + y.matches, 0);
  const since = years.data && years.data.length ? Math.min(...years.data.map((y) => y.year)) : null;
  const game = subject?.game || list.rows[0]?.game || "";
  const title = kind === "team" ? "All Matches" : "Match History";
  const back = kind === "team" ? `/teams/${encodeURIComponent(id)}` : `/players/${encodeURIComponent(id)}`;

  const months = useMemo(() => {
    const out: { key: string; rows: ArchiveMatch[] }[] = [];
    for (const m of list.rows) {
      const key = utcMonthKey(m.playedAt);
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(m); else out.push({ key, rows: [m] });
    }
    return out;
  }, [list.rows]);

  let content;
  if (archive.off) content = <ArchiveOff message={archive.message} />;
  else if (!list.loaded) content = <SkeletonLedger rows={8} avatar={20} className="mx-4 mt-1" />;
  else if (list.error) content = <LoadFailure error={list.error} connectionProblem={list.connectionProblem} onRetry={list.reload} />;
  else if (list.locked) content = <PremiumWall />;
  else if (months.length === 0) content = (
    <>
      {list.freeDays ? <PremiumWindowNote days={list.freeDays} className="mb-4" /> : null}
      <EmptyState icon={<ArchiveGlyph />} title={year ? `No matches in ${year}` : "No matches on record"} />
    </>
  );
  else content = (
    <>
      {list.freeDays ? <PremiumWindowNote days={list.freeDays} className="mb-2" /> : null}
      <div className="flex flex-col">
        {months.map(({ key, rows }) => (
          <section key={key} className="flex flex-col">
            <DateSectionHeader label={monthLabel(key)} className="!px-4" />
            <div className="px-4 pt-1 pb-4">
              {kind === "team" ? (
                <StripedTable
                  header={
                    <>
                      <span className="w-[52px] shrink-0">Date</span>
                      <span className="flex-1">Opponent</span>
                      <span className="w-[52px] shrink-0 text-center">Score</span>
                      <span className="w-[34px] shrink-0 text-right">W/L</span>
                    </>
                  }
                >
                  {rows.map((m) => <RecentGameRow key={m.id} match={m} perspective={{ teamId: id, teamName: subject?.name ?? null }} dateLabel={formatUtc(m.playedAt, { month: "short", day: "numeric" })} />)}
                </StripedTable>
              ) : (
                <PlayerTable rows={rows} game={game} />
              )}
            </div>
          </section>
        ))}
      </div>
      <LoadMoreFooter reachedEnd={list.reachedEnd} loadingMore={list.loadingMore} error={list.moreError} onLoadMore={() => void list.loadMore()} />
    </>
  );

  return (
    <Page>
      <ArchiveColumn>
        <NavBar title={title} back={back} />
        <div className="flex items-center gap-1.5 px-4 pt-3 min-h-[22px] t-body-md text-secondary min-w-0">
          {subject && years.data && total > 0 ? (
            <span className="truncate"><span className="text-primary font-semibold">{subject.name}</span> · {total.toLocaleString()} {total === 1 ? "match" : "matches"}{since ? ` since ${since}` : ""}</span>
          ) : subject ? (
            <span className="truncate text-primary font-semibold">{subject.name}</span>
          ) : (
            <SkeletonBar width={200} height={12} />
          )}
        </div>
        {archive.off ? null : <YearChips years={(years.data ?? []).map((y) => y.year)} value={year} onChange={setYear} className="pt-4 pb-3" />}
        {content}
      </ArchiveColumn>
    </Page>
  );
}

// ── Player rows ────────────────────────────────────────────────────────────
function headlineLabel(game: string): string {
  return game === "CS2" ? "RTG" : game === "League" ? "KDA" : "ACS";
}

function PlayerTable({ rows, game }: { rows: ArchiveMatch[]; game: string }) {
  const showChar = game !== "CS2";
  return (
    <StripedTable
      header={
        <>
          <span className="w-10 shrink-0">Date</span>
          <span className="flex-1 min-w-0">Opponent</span>
          <span className="w-6 shrink-0 text-center">W/L</span>
          {showChar ? <span className="w-[56px] md:w-[76px] shrink-0 truncate">{game === "League" ? "Champ" : "Agent"}</span> : null}
          <span className="w-[58px] md:w-[66px] shrink-0 text-center">K/D/A</span>
          <span className="w-9 md:w-11 shrink-0 text-right">{headlineLabel(game)}</span>
        </>
      }
    >
      {rows.map((m) => <PlayerArchiveRow key={m.id} match={m} game={game || m.game} showChar={showChar} />)}
    </StripedTable>
  );
}

function headline(m: ArchiveMatch, game: string): string {
  const s = m.playerStat;
  if (!s) return "—";
  if (game === "CS2") return s.rating != null ? fmt2(s.rating) : "—";
  if (game === "League") return s.kills == null || s.deaths == null ? "—" : fmt1(((s.kills ?? 0) + (s.assists ?? 0)) / Math.max(s.deaths, 1));
  return s.acs != null ? String(Math.round(s.acs)) : "—";
}

function PlayerArchiveRow({ match: m, game, showChar }: { match: ArchiveMatch; game: string; showChar: boolean }) {
  const s = m.playerStat;
  const side = s?.teamId ?? null;
  const onTeam1 = side ? (m.team1Id === side ? true : m.team2Id === side ? false : null) : null;
  const opponent = onTeam1 === true ? m.team2Name : onTeam1 === false ? m.team1Name : `${m.team1Name} vs ${m.team2Name}`;
  const opponentLogo = onTeam1 === true ? m.team2LogoURL : onTeam1 === false ? m.team1LogoURL : null;
  const won = s?.won ?? null;
  const kda = s && s.kills != null && s.deaths != null && s.assists != null ? `${s.kills}/${s.deaths}/${s.assists}` : "—";
  return (
    <Link href={matchHref(m.id)} className="flex items-center gap-1 px-3 py-2.5 hover:bg-surface/70 transition-colors">
      <span className="w-10 shrink-0 t-label-sm text-muted">{formatUtc(m.playedAt, { month: "short", day: "numeric" })}</span>
      <span className="flex-1 min-w-0 flex items-center gap-1.5">
        {onTeam1 !== null ? <TeamMark name={opponent} logoURL={opponentLogo} size={20} /> : null}
        <span className="t-body-sm text-primary truncate">{opponent}</span>
      </span>
      <span className={clsx("w-6 shrink-0 text-center t-label-md", won === null ? "text-muted" : won ? "text-success" : "text-error")}>{won === null ? "—" : won ? "W" : "L"}</span>
      {showChar ? <span className="w-[56px] md:w-[76px] shrink-0 t-label-sm text-secondary truncate">{s?.characterName ?? "—"}</span> : null}
      <span className="w-[58px] md:w-[66px] shrink-0 text-center t-mono-sm text-primary">{kda}</span>
      <span className="w-9 md:w-11 shrink-0 text-right t-mono-sm text-violet">{headline(m, game)}</span>
    </Link>
  );
}
