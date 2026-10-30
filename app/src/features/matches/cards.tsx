// features/matches/cards.tsx — the three match cards every screen reuses:
// LiveMatchCard + UpcomingMatchCard (HomeView.swift) and CompletedMatchRow
// (ResultCard in ResultsView.swift). Same silhouette as SkeletonMatchCard:
// card background, hairline, 12pt radius — no shadows, no gradients.
//
// Every card opens /match/[id]; team marks hop to /teams/[id-or-name].
"use client";

import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Calendar, ChevronDown, ChevronRight, CircleHelp, Clock, Eye, Flag, ListOrdered } from "lucide-react";
import { GamePill, LiveBadge, StagePill, TeamMark } from "@/components/ui";
import { clsx, formatTime } from "@/lib/format";
import { matchResultTime, team1Color, team2Color, teamStub, type Match } from "@/lib/types";
import { rememberMatch } from "./match-cache";
import { prefetchTeam, rememberTeam } from "@/features/entity-cache";
import { isGameOpen, previewOpensAfter, seriesLine, TAG_TEXT } from "@/features/tournaments/series/series-logic";

/** The one door to a match, whatever its state (CompletedMatchLoaderView routes by status server-side). */
export function matchHref(id: string): string {
  return `/match/${encodeURIComponent(id)}`;
}
/** Team(name:game:logoURL:id:) → TeamDetail tolerates a name as id, like the app. */
export function teamHref(id: string | null | undefined, name: string): string {
  return `/teams/${encodeURIComponent(id ?? name)}`;
}

const CARD = "rounded-xl bg-card border border-border-subtle";
const CARD_LINK = clsx(CARD, "block hover:border-border-strong transition-colors");

function viewerLabel(count: number | null): string | null {
  if (count == null) return null;
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : String(count);
}

// ── Live ──────────────────────────────────────────────────────────────────
export function LiveMatchCard({ match, className }: { match: Match; className?: string }) {
  const viewers = viewerLabel(match.viewerCount);
  const c1 = team1Color(match);
  const c2 = team2Color(match);
  return (
    <Link href={matchHref(match.id)} onClick={() => rememberMatch(match)} className={clsx(CARD_LINK, "px-3.5 py-3", className)}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <LiveBadge />
          <span className="t-label-sm text-muted truncate min-w-0">{match.tournamentName ?? "Unknown Tournament"}</span>
          {match.stage ? <StagePill stage={match.stage} className="shrink-0" /> : null}
          <span className="flex-1" />
          <GamePill game={match.game} />
          {viewers ? (
            <span className="inline-flex items-center gap-[3px] text-muted shrink-0">
              <Eye size={11} />
              <span className="t-label-sm">{viewers}</span>
            </span>
          ) : null}
        </div>

        {/* Two aligned team rows with a hairline between — a scoreboard. */}
        <div className="flex flex-col">
          <LiveTeamRow name={match.team1Name} logo={match.team1LogoURL} color={c1} score={match.team1Score} leads={match.team1Score >= match.team2Score} />
          <div className="ml-[38px] hairline-b" />
          <LiveTeamRow name={match.team2Name} logo={match.team2LogoURL} color={c2} score={match.team2Score} leads={match.team2Score >= match.team1Score} />
        </div>

        {/* The map line is always laid out (empty for League) so every live
            card is the same height across games. */}
        <div className="flex items-center gap-1.5 min-h-[18px]">
          {match.mapName ? (
            <>
              <span className="text-[9px] font-semibold tracking-[1.2px] text-muted">MAP</span>
              <span className="t-label-sm text-secondary">{match.mapName}</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function LiveTeamRow({ name, logo, color, score, leads }: { name: string; logo: string | null; color: string; score: number; leads: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-[7px] min-w-0">
      <TeamMark name={name} logoURL={logo} color={color} size={28} />
      <span className="t-body-md text-primary truncate">{name}</span>
      <span className="flex-1" />
      <span className={clsx("t-score text-[20px] w-9 text-right", leads ? "text-primary" : "text-muted")}>{score}</span>
    </div>
  );
}

// ── Upcoming (expandable) ─────────────────────────────────────────────────
// A tournament game (match.series) adds the series line under the header
// ("QUARTERFINAL · GAME 3 OF 3 · DECIDER"), the series wins on the team rows
// once the series has started, and — one game ahead — a locked preview row
// until the game before it is over.
export function UpcomingMatchCard({ match, className, defaultExpanded = false, previewHref }: { match: Match; className?: string; defaultExpanded?: boolean; /** Where "Match preview" goes (a series page passes its own `from`). */ previewHref?: string }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = () => setExpanded((v) => !v);
  const time = formatTime(match.scheduledAt);
  const fullDate = `${new Date(match.scheduledAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} • ${time}`;

  const p1raw = match.team1WinProbability;
  const p2raw = match.team2WinProbability;
  const hasOdds = p1raw != null && p2raw != null && p1raw + p2raw > 0;
  const p1 = hasOdds ? (p1raw <= 1 ? p1raw * 100 : p1raw) : 0;
  const p2 = hasOdds ? (p2raw <= 1 ? p2raw * 100 : p2raw) : 0;
  const c1 = team1Color(match);
  const c2 = team2Color(match);

  const series = match.series ?? null;
  const line = series ? seriesLine(series) : null;
  const open = isGameOpen(match);
  const played = series ? series.team1Wins + series.team2Wins : 0;
  // Series wins once the series has started: the leader (both when level) bright.
  const wins = series && played > 0 ? [series.team1Wins, series.team2Wins] as const : null;
  const fullTournamentName = match.tournamentName ?? series?.tournamentName ?? "Unknown Tournament";

  return (
    <div className={clsx(CARD, className)}>
      {/* Header (tap to expand) */}
      <button type="button" onClick={toggle} aria-expanded={expanded} className="w-full flex flex-col gap-1 px-4 pt-4 pb-2.5 text-left min-w-0 hover:bg-surface/40 rounded-t-xl transition-colors">
        <span className="w-full flex items-center gap-2 min-w-0">
          <span className="t-label-sm text-muted truncate min-w-0">{fullTournamentName}</span>
          {match.stage && !series ? <StagePill stage={match.stage} className="shrink-0" /> : null}
          <span className="flex-1" />
          <GamePill game={match.game} />
          <span className="t-label-lg text-violet whitespace-nowrap">{time}</span>
        </span>
        {line && line.text ? (
          <span className="block w-full text-[10px] font-semibold tracking-[0.8px] uppercase whitespace-nowrap overflow-hidden text-ellipsis">
            <span className="text-secondary">{line.text}</span>
            {line.tag ? <span className={line.tag === "decider" ? "text-violet" : "text-muted"}> · {TAG_TEXT[line.tag]}</span> : null}
          </span>
        ) : null}
      </button>

      {/* Team rows — the row hops to the team's page; a hairline between. */}
      <UpcomingTeamRow name={match.team1Name} logo={match.team1LogoURL} id={match.team1Id} game={match.game} wins={wins ? wins[0] : null} leads={!!wins && wins[0] >= wins[1]} />
      <div className="ml-[54px] hairline-b" />
      <UpcomingTeamRow name={match.team2Name} logo={match.team2LogoURL} id={match.team2Id} game={match.game} wins={wins ? wins[1] : null} leads={!!wins && wins[1] >= wins[0]} />

      {/* Dedicated expand affordance */}
      <button type="button" onClick={toggle} aria-label={expanded ? "Hide details" : "Show details"} aria-expanded={expanded} className="w-full flex justify-center py-1.5 text-muted hover:text-primary transition-colors">
        <ChevronDown size={14} className={clsx("transition-transform duration-200", expanded && "rotate-180")} />
      </button>

      {expanded ? (
        <>
          <div className="mx-4 hairline-t" />
          <div className="flex flex-col gap-2.5 p-4">
            <DetailRow icon={<Calendar size={12} />} text={fullDate} />
            <DetailRow icon={<ListOrdered size={12} />} text={series ? `Best of ${series.bestOf} series · Game ${series.gameNumber ?? "?"}` : `Best of ${match.bestOf}`} />
            {line?.tag === "if_necessary" ? <DetailRow icon={<CircleHelp size={12} />} text="Played only if the series isn't decided by then" /> : null}
            {match.stage && !series ? <DetailRow icon={<Flag size={12} />} text={match.stage} /> : null}

            {open ? (
              /* The door to the pre-match hub. */
              <Link href={previewHref ?? matchHref(match.id)} onClick={() => rememberMatch(match)} className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-surface hover:bg-surface/70 transition-colors">
                <span className="t-label-md text-violet">Match preview</span>
                <span className="flex-1" />
                <ChevronRight size={12} className="text-violet" />
              </Link>
            ) : (
              /* One game ahead: the preview opens once the game before is over. */
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-surface" aria-disabled="true">
                <Clock size={12} className="text-muted shrink-0" />
                <span className="t-label-md text-muted">{previewOpensAfter(series!)}</span>
              </div>
            )}

            {open && hasOdds ? (
              <div className="flex flex-col gap-1.5 pt-0.5">
                <div className="flex items-center">
                  <span className="t-label-md" style={{ color: c1 }}>{Math.round(p1)}%</span>
                  <span className="flex-1" />
                  <span className="text-[9px] font-semibold tracking-[1px] text-muted">PRE-MATCH ODDS</span>
                  <span className="flex-1" />
                  <span className="t-label-md" style={{ color: c2 }}>{Math.round(p2)}%</span>
                </div>
                <div className="flex h-2 rounded overflow-hidden">
                  <span style={{ width: `${(p1 / Math.max(1, p1 + p2)) * 100}%`, background: c1 }} />
                  <span className="flex-1" style={{ background: c2, opacity: 0.85 }} />
                </div>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function UpcomingTeamRow({ name, logo, id, game, wins = null, leads = false }: { name: string; logo: string | null; id: string | null; game: string; /** Series wins (tournament games, once the series has started). */ wins?: number | null; leads?: boolean }) {
  return (
    <Link href={teamHref(id, name)} onClick={() => rememberTeam(teamStub(name, game, logo, id))} onMouseEnter={() => prefetchTeam(id)} className="flex items-center gap-2.5 px-4 py-1.5 min-w-0 hover:bg-surface/60 transition-colors">
      <TeamMark name={name} logoURL={logo} size={28} />
      <span className="t-body-md text-primary truncate">{name}</span>
      {wins != null ? (
        <>
          <span className="flex-1" />
          <span className={clsx("t-mono-md w-6 text-right shrink-0", leads ? "text-primary" : "text-muted")}>{wins}</span>
        </>
      ) : null}
    </Link>
  );
}

function DetailRow({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 grid place-items-center text-muted">{icon}</span>
      <span className="t-body-sm text-secondary">{text}</span>
    </div>
  );
}

// ── Completed (ResultCard) ────────────────────────────────────────────────
export function CompletedMatchRow({ match, className }: { match: Match; className?: string }) {
  const team1Won = match.team1Score > match.team2Score;
  const team2Won = match.team2Score > match.team1Score;
  return (
    <Link href={matchHref(match.id)} onClick={() => rememberMatch(match)} className={clsx(CARD_LINK, "p-4", className)}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <GamePill game={match.game} />
          <span className="t-label-sm text-muted truncate min-w-0">{match.tournamentName ?? "Unknown Tournament"}</span>
          {match.stage ? <StagePill stage={match.stage} className="shrink-0" /> : null}
          <span className="flex-1" />
          <FinalPill />
        </div>

        <ResultTeamRow name={match.team1Name} logo={match.team1LogoURL} id={match.team1Id} score={match.team1Score} color={team1Color(match)} won={team1Won} game={match.game} />
        <ResultTeamRow name={match.team2Name} logo={match.team2LogoURL} id={match.team2Id} score={match.team2Score} color={team2Color(match)} won={team2Won} game={match.game} />

        <div className="flex items-center">
          <span className="t-label-sm text-muted">{formatTime(matchResultTime(match))}</span>
          <span className="flex-1" />
          {match.mapName ? <span className="t-label-sm text-muted">{match.mapName}</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function FinalPill({ className }: { className?: string }) {
  return <span className={clsx("text-[9px] font-bold text-muted px-1.5 py-0.5 rounded-full bg-surface", className)}>FINAL</span>;
}

function ResultTeamRow({ name, logo, id, score, color, won, game }: { name: string; logo: string | null; id: string | null; score: number; color: string; won: boolean; game: string }) {
  const router = useRouter();
  const href = teamHref(id, name);
  // The card is one anchor; the mark is a nested hop to the team page.
  const hop = (e: MouseEvent | KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); rememberTeam(teamStub(name, game, logo, id)); router.push(href); };
  return (
    <div className={clsx("flex items-center gap-2.5 min-w-0", !won && "opacity-70")}>
      <span
        role="link"
        tabIndex={0}
        aria-label={`${name} team page`}
        title={name}
        onClick={hop}
        onMouseEnter={() => prefetchTeam(id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") hop(e); }}
        className="rounded-md hover:ring-1 hover:ring-border-strong transition-shadow"
      >
        <TeamMark name={name} logoURL={logo} color={color} size={28} />
      </span>
      <span className={clsx("t-body-lg truncate", won ? "text-primary" : "text-secondary")}>{name}</span>
      {won ? <BadgeCheck size={12} className="text-success shrink-0" /> : null}
      <span className="flex-1" />
      <span className={clsx("t-score text-[18px]", won ? "text-primary" : "text-muted")}>{score}</span>
    </div>
  );
}
