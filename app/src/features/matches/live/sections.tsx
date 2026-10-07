// sections.tsx — LiveMatchSections.swift + ScoreHUD (LiveMatchView.swift).
//
// Game-aware where needed: VALORANT/CS2 share the round-based components;
// League gets objectives, the gold chart (GoldChart.tsx) and its own stat
// columns. Stat columns are trimmed to what the backend actually stores:
//   VALORANT: ACS · K D A +/- · HS% · ADR · FB · CL
//   CS2:      RAT · K D A +/- · ADR · KAST · HS% · FB · CL
//   League:   KDA · K D A +/- · CS/m · Gold · GPM · DMG · DMG% · Vis · KP%
"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Clock, Eye, Flag, MessageCircle, MoveHorizontal } from "lucide-react";
import { AssetIcon, GamePill, InitialAvatar, LiveBadge, TeamMark } from "@/components/ui";
import { clsx } from "@/lib/format";
import { team1Color, team2Color, type Match } from "@/lib/types";
import type { FanPoll, FanPollOption, LeagueObjective, LivePlayerStat, LiveRound } from "./types";

export function teamHref(id: string | null, name: string): string {
  return `/teams/${id ?? encodeURIComponent(name)}`;
}
export function playerHref(id: string, name: string): string {
  return `/players/${id || encodeURIComponent(name)}`;
}
export function abbr(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

/** The bordered section box every live section sits in (InsightCard). */
export function SectionBox({ children, className, live }: { children: ReactNode; className?: string; live?: boolean }) {
  return <div className={clsx("rounded-xl bg-card border p-3.5", live ? "border-live/40" : "border-border-subtle", className)}>{children}</div>;
}

// ── Score HUD ─────────────────────────────────────────────────────────────
export interface ScoreHUDProps {
  match: Match;
  isRoundBased: boolean;
  team1Score: number;
  team2Score: number;
  team1Maps: number;
  team2Maps: number;
  gameTime: string;
  seriesInfo: string;
  viewerCount: string;
  team1Side?: string | null;
  team2Side?: string | null;
  winnerSide?: 1 | 2 | null;
  team1Alive?: number | null;
  team2Alive?: number | null;
  isLive?: boolean;
}

function sideLabel(match: Match, isRoundBased: boolean, raw: string | null | undefined, isTeam1: boolean, team1Score: number, team2Score: number): string | null {
  if (match.game === "League") {
    const u = raw?.toUpperCase();
    if (u?.includes("BLUE")) return "BLUE SIDE";
    if (u?.includes("RED")) return "RED SIDE";
    return isTeam1 ? "BLUE SIDE" : "RED SIDE";
  }
  if (!isRoundBased) return null;
  const label = (attack: boolean) => (match.game === "CS2" ? (attack ? "T SIDE" : "CT SIDE") : attack ? "ATTACK" : "DEFENSE");
  if (raw) {
    const u = raw.toUpperCase();
    const isT = u === "T" || u.includes("ATTACK") || u.includes("ATK");
    const isCT = u === "CT" || u.includes("DEF");
    if (isT || isCT) return label(isT);
  }
  const team1Attacking = team1Score + team2Score < 12;
  return label(isTeam1 ? team1Attacking : !team1Attacking);
}

function sideBadgeColor(label: string, teamColor: string): string {
  if (label.includes("BLUE")) return "var(--team1)";
  if (label.includes("RED")) return "var(--error)";
  if (label.includes("DEF")) return "var(--val-defense)";
  if (label.includes("ATK") || label.includes("ATTACK")) return "var(--val-attack)";
  if (label.includes("CT")) return "var(--cs-ct)";
  if (label.includes("T SIDE")) return "var(--cs-t)";
  return teamColor;
}

function MapDots({ won, bestOf, color }: { won: number; bestOf: number; color: string }) {
  const needed = Math.max(1, Math.floor(bestOf / 2) + 1);
  return (
    <span className="flex gap-1">
      {Array.from({ length: needed }).map((_, i) => (
        <span key={i} className="size-[7px] rounded-full" style={{ background: i < won ? color : "var(--surface)" }} />
      ))}
    </span>
  );
}

function AlivePips({ alive, color }: { alive: number; color: string }) {
  return (
    <span className="flex gap-[3px]" aria-label={`${alive} alive`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="size-[5px] rounded-full" style={{ background: i < alive ? color : "color-mix(in srgb, var(--text-muted) 40%, transparent)" }} />
      ))}
    </span>
  );
}

function HUDTeamColumn({ p, side }: { p: ScoreHUDProps; side: 1 | 2 }) {
  const { match, isRoundBased, winnerSide = null } = p;
  const name = side === 1 ? match.team1Name : match.team2Name;
  const logo = side === 1 ? match.team1LogoURL : match.team2LogoURL;
  const id = side === 1 ? match.team1Id : match.team2Id;
  const color = side === 1 ? team1Color(match) : team2Color(match);
  const maps = side === 1 ? p.team1Maps : p.team2Maps;
  const alive = side === 1 ? p.team1Alive : p.team2Alive;
  const sl = sideLabel(match, isRoundBased, side === 1 ? p.team1Side : p.team2Side, side === 1, p.team1Score, p.team2Score);
  return (
    <div className={clsx("flex-1 min-w-0 flex flex-col items-center gap-1.5", winnerSide && winnerSide !== side && "opacity-60")}>
      <Link href={teamHref(id, name)} className="flex flex-col items-center gap-1.5 min-w-0 max-w-full rounded-lg px-2 py-1 hover:bg-surface/60 transition-colors">
        <TeamMark name={name} logoURL={logo} color={color} size={32} />
        <span className="t-label-md text-primary truncate max-w-full">{name}</span>
      </Link>
      {winnerSide === side ? (
        <span className="t-label-sm text-success">WINNER</span>
      ) : sl ? (
        <span className="text-[9px] font-bold tracking-[0.5px]" style={{ color: sideBadgeColor(sl, color) }}>{sl}</span>
      ) : null}
      <MapDots won={maps} bestOf={match.bestOf} color={color} />
      {isRoundBased && winnerSide === null && alive != null ? <AlivePips alive={alive} color={color} /> : null}
    </div>
  );
}

export function ScoreHUD(p: ScoreHUDProps) {
  const { match, isRoundBased, winnerSide = null } = p;

  return (
    <SectionBox live={p.isLive} className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-1.5">
        <GamePill game={match.game} />
        {isRoundBased ? (
          match.mapName ? <span className="t-label-sm text-muted">{match.mapName}</span> : null
        ) : (
          <span className="inline-flex items-center gap-[3px] t-label-sm text-violet"><Clock size={10} />{p.gameTime}</span>
        )}
        <span className="flex-1" />
        {p.viewerCount !== "—" ? <span className="inline-flex items-center gap-[3px] t-label-sm text-muted"><Eye size={10} />{p.viewerCount}</span> : null}
      </div>
      <div className="flex items-center gap-3">
        <HUDTeamColumn p={p} side={1} />
        <div className="flex items-center gap-2.5">
          <span className={clsx("t-score text-[28px] leading-none", winnerSide === 2 ? "text-muted" : "text-primary")}>{p.team1Score}</span>
          <span className="t-headline-md text-muted">–</span>
          <span className={clsx("t-score text-[28px] leading-none", winnerSide === 1 ? "text-muted" : "text-primary")}>{p.team2Score}</span>
        </div>
        <HUDTeamColumn p={p} side={2} />
      </div>
      {p.seriesInfo ? <span className="t-label-sm text-muted text-center">{p.seriesInfo}</span> : null}
    </SectionBox>
  );
}

/** The compact score strip (the collapsed HUD) — used as the sticky bar on scroll. */
export function CollapsedScoreBar({ match, team1Score, team2Score, isComplete }: { match: Match; team1Score: number; team2Score: number; isComplete: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 rounded-[10px] bg-card border border-border-subtle">
      <span className="t-label-md" style={{ color: team1Color(match) }}>{abbr(match.team1Name)}</span>
      <span className="t-mono-md" style={{ color: team1Color(match) }}>{team1Score}</span>
      <span className="t-mono-md text-muted">–</span>
      <span className="t-mono-md" style={{ color: team2Color(match) }}>{team2Score}</span>
      <span className="t-label-md" style={{ color: team2Color(match) }}>{abbr(match.team2Name)}</span>
      <span className="flex-1" />
      {isComplete ? <span className="t-label-md text-secondary">Final</span> : <LiveBadge />}
    </div>
  );
}

// ── Round Tracker ─────────────────────────────────────────────────────────
export function RoundTracker({ team1Color: c1, team2Color: c2, rounds, isComplete = false }: { team1Color: string; team2Color: string; rounds: LiveRound[]; isComplete?: boolean }) {
  const display = isComplete ? rounds.filter((r) => r.winner !== 0) : rounds;
  const lastPlayedId = [...rounds].reverse().find((r) => r.winner === 1 || r.winner === 2 || r.winner === 3)?.id ?? -1;
  return (
    <SectionBox className="flex flex-col gap-2.5">
      <span className="t-label-md text-muted">Rounds</span>
      <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5">
        {display.map((round) => (
          <span key={round.id} className="contents">
            <RoundChip team1Color={c1} team2Color={c2} round={round} matchComplete={isComplete} isFinalRound={isComplete && round.id === lastPlayedId} />
            {round.id === 12 && display.length > 12 ? <span className="w-px h-[34px] mt-[11px] mx-[3px] bg-border-subtle shrink-0" /> : null}
          </span>
        ))}
      </div>
    </SectionBox>
  );
}

function RoundChip({ team1Color: c1, team2Color: c2, round, matchComplete, isFinalRound }: { team1Color: string; team2Color: string; round: LiveRound; matchComplete: boolean; isFinalRound: boolean }) {
  const isFuture = round.winner === 0 && !round.isCurrent;
  const lane = (side: 1 | 2): string => {
    switch (round.winner) {
      case 1: case 2: return round.winner === side ? (side === 1 ? c1 : c2) : "var(--surface)";
      case 3: return "color-mix(in srgb, var(--text-muted) 25%, transparent)";
      default: return "transparent";
    }
  };
  const pulses = round.isCurrent && !matchComplete;
  return (
    <span className="flex flex-col items-center gap-0.5 shrink-0" title={`Round ${round.id}`}>
      <span className="h-[11px] grid place-items-center">{isFinalRound ? <Flag size={9} className="text-muted" /> : null}</span>
      <span className={clsx("flex flex-col gap-0.5 p-0.5 rounded bg-surface/60 border", pulses ? "border-violet animate-[live-pulse_1.4s_ease-in-out_infinite]" : "border-border-subtle")}>
        <span className="w-[18px] h-3 rounded-sm" style={{ background: lane(1) }} />
        <span className="w-[18px] h-3 rounded-sm" style={{ background: lane(2) }} />
      </span>
      <span className={clsx("w-[22px] text-center text-[8px] font-medium font-mono pt-px", round.isCurrent && !matchComplete ? "text-violet" : isFuture ? "text-muted/50" : "text-muted")}>{round.id}</span>
    </span>
  );
}

// ── League Objectives ─────────────────────────────────────────────────────
function InhibitorPips({ alive, color, trailing }: { alive: number; color: string; trailing?: boolean }) {
  return (
    <span className={clsx("flex gap-1", trailing && "justify-end")} aria-label={`${alive} inhibitors standing`}>
      {Array.from({ length: 3 }).map((_, i) => {
        const up = trailing ? i >= 3 - alive : i < alive;
        return <span key={i} className="size-2 rounded-full border-[1.2px]" style={{ background: up ? color : "transparent", borderColor: up ? color : "color-mix(in srgb, var(--text-muted) 50%, transparent)" }} />;
      })}
    </span>
  );
}

export function LeagueObjectives({ team1Color: c1, team2Color: c2, objectives }: { team1Color: string; team2Color: string; objectives: LeagueObjective[] }) {
  return (
    <SectionBox className="flex flex-col gap-3">
      <span className="t-label-md text-muted">Objectives</span>
      {objectives.length === 0 ? (
        <span className="t-body-sm text-muted">Objective data will appear as the game progresses</span>
      ) : (
        objectives.map((o) => (
          <div key={o.label} className="flex items-center">
            <span className="w-11 flex">{o.icon === "inhibitor" ? <InhibitorPips alive={o.team1Count} color={c1} /> : <span className="t-mono-md" style={{ color: c1 }}>{o.team1Count}</span>}</span>
            <span className="flex-1" />
            <span className="flex items-center gap-1.5">
              <span className="w-6 grid place-items-center"><AssetIcon name={o.icon} height={21} /></span>
              <span className="t-body-sm text-secondary w-[70px]">{o.label}</span>
            </span>
            <span className="flex-1" />
            <span className="w-11 flex justify-end">{o.icon === "inhibitor" ? <InhibitorPips alive={o.team2Count} color={c2} trailing /> : <span className="t-mono-md" style={{ color: c2 }}>{o.team2Count}</span>}</span>
          </div>
        ))
      )}
    </SectionBox>
  );
}

// ── Win Probability Bar (FREE for all users) ──────────────────────────────
export function WinProbabilityBar({ team1Color: c1, team2Color: c2, team1Name, team2Name, team1Probability }: { team1Color: string; team2Color: string; team1Name: string; team2Name: string; team1Probability: number }) {
  const p1 = Math.max(0, Math.min(100, team1Probability));
  const p2 = 100 - p1;
  return (
    <SectionBox className="flex flex-col gap-2">
      <span className="t-label-md text-muted">Win Probability</span>
      <div className="flex justify-between">
        <span className="t-label-md" style={{ color: c1 }}>{abbr(team1Name)} {p1}%</span>
        <span className="t-label-md" style={{ color: c2 }}>{p2}% {abbr(team2Name)}</span>
      </div>
      <div className="flex h-2.5 rounded-[5px] overflow-hidden" role="meter" aria-valuenow={p1} aria-valuemin={0} aria-valuemax={100} aria-label={`${team1Name} win probability`}>
        <span className="h-full transition-[width] duration-700 ease-in-out" style={{ width: `${p1}%`, background: c1 }} />
        <span className="h-full flex-1" style={{ background: c2 }} />
      </div>
    </SectionBox>
  );
}

// ── Stats table ───────────────────────────────────────────────────────────
interface StatColumn { label: string; width: number; kind: "normal" | "primary" | "plusMinus"; value: (s: LivePlayerStat) => string }

const fmt = (v: number | null, dp: number) => (v == null ? "—" : v.toFixed(dp));
const pct = (v: number | null) => (v == null ? "—" : `${Math.trunc(v)}%`);
const intText = (v: number | null) => (v == null ? "—" : String(v));
const goldText = (v: number | null) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));
const pmLabel = (v: number) => (v > 0 ? `+${v}` : String(v));

export function statColumns(game: string): StatColumn[] {
  const kda: StatColumn[] = [
    { label: "K", width: 26, kind: "normal", value: (s) => String(s.kills) },
    { label: "D", width: 26, kind: "normal", value: (s) => String(s.deaths) },
    { label: "A", width: 26, kind: "normal", value: (s) => String(s.assists) },
    { label: "+/–", width: 38, kind: "plusMinus", value: (s) => pmLabel(s.plusMinus) },
  ];
  switch (game) {
    case "VALORANT":
      return [{ label: "ACS", width: 46, kind: "primary", value: (s) => fmt(s.acs, 0) }, ...kda,
        { label: "HS%", width: 44, kind: "normal", value: (s) => pct(s.headshotPct) },
        { label: "ADR", width: 44, kind: "normal", value: (s) => fmt(s.adr, 0) },
        { label: "FB", width: 30, kind: "normal", value: (s) => intText(s.firstBloods) },
        { label: "CL", width: 30, kind: "normal", value: (s) => intText(s.clutches) }];
    case "CS2":
      return [{ label: "RAT", width: 44, kind: "primary", value: (s) => fmt(s.rating, 2) }, ...kda,
        { label: "ADR", width: 44, kind: "normal", value: (s) => fmt(s.adr, 0) },
        { label: "KAST", width: 48, kind: "normal", value: (s) => pct(s.kast) },
        { label: "HS%", width: 44, kind: "normal", value: (s) => pct(s.headshotPct) },
        { label: "FB", width: 30, kind: "normal", value: (s) => intText(s.firstBloods) },
        { label: "CL", width: 30, kind: "normal", value: (s) => intText(s.clutches) }];
    case "League":
      return [{ label: "KDA", width: 46, kind: "primary", value: (s) => fmt(s.kda, 1) }, ...kda,
        { label: "CS/m", width: 44, kind: "normal", value: (s) => fmt(s.csPerMin, 1) },
        { label: "Gold", width: 52, kind: "normal", value: (s) => goldText(s.gold) },
        { label: "GPM", width: 44, kind: "normal", value: (s) => intText(s.goldPerMin) },
        { label: "DMG", width: 56, kind: "normal", value: (s) => goldText(s.damage) },
        { label: "DMG%", width: 48, kind: "normal", value: (s) => pct(s.damagePercent) },
        { label: "Vis", width: 38, kind: "normal", value: (s) => intText(s.vision) },
        { label: "KP%", width: 44, kind: "normal", value: (s) => pct(s.killParticipation) }];
    default:
      return kda;
  }
}

const NAME_COL = 150;
const AGENT_COL = 76;

export function StatsTableSection({ team1Color: c1, team2Color: c2, game, team1Name, team2Name, team1Stats, team2Stats }: { team1Color: string; team2Color: string; game: string; team1Name: string; team2Name: string; team1Stats: LivePlayerStat[]; team2Stats: LivePlayerStat[] }) {
  const columns = statColumns(game);
  const showAgent = game === "VALORANT" || game === "League";
  const agentLabel = game === "VALORANT" ? "Agent" : game === "League" ? "Champ" : "";
  const empty = team1Stats.length === 0 && team2Stats.length === 0;

  const header = (
    <div className="flex items-center py-1.5 t-label-sm text-muted hairline-b">
      <span className="shrink-0" style={{ width: NAME_COL }}>Player</span>
      {showAgent ? <><span className="w-px h-3.5 bg-border-subtle mx-2.5" /><span className="shrink-0" style={{ width: AGENT_COL }}>{agentLabel}</span></> : null}
      <span className="w-px h-3.5 bg-border-subtle mr-1.5" />
      {columns.map((c) => <span key={c.label} className="shrink-0 text-center" style={{ width: c.width }}>{c.label}</span>)}
    </div>
  );

  const skeletonBlock = (name: string, color: string) => (
    <div className="flex flex-col">
      <span className="t-label-md py-1.5" style={{ color }}>{name}</span>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center py-[7px]">
          <span className="flex items-center gap-2 shrink-0" style={{ width: NAME_COL }}>
            <span className="size-[22px] rounded-full bg-surface" />
            <span className="w-[70px] h-2.5 rounded bg-surface" />
          </span>
          {showAgent ? <><span className="w-[21px]" /><span className="t-label-sm text-muted/50 shrink-0" style={{ width: AGENT_COL }}>—</span></> : null}
          <span className="w-[7px]" />
          {columns.map((c) => <span key={c.label} className="t-mono-sm text-muted/50 text-center shrink-0" style={{ width: c.width }}>—</span>)}
        </div>
      ))}
    </div>
  );

  const block = (name: string, color: string, stats: LivePlayerStat[]) => (
    <div className="flex flex-col">
      <span className="t-label-md py-1.5" style={{ color }}>{name}</span>
      {stats.map((st, i) => (
        <LivePlayerRow key={st.id || `${name}-${i}`} stat={st} columns={columns} showAgent={showAgent} />
      ))}
    </div>
  );

  return (
    <SectionBox className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="t-label-md text-muted">Scoreboard</span>
        <span className="inline-flex items-center gap-0.5 t-label-sm text-muted/60 lg:hidden">swipe for more <MoveHorizontal size={8} /></span>
      </div>
      <div className="overflow-x-auto no-scrollbar -mx-3.5 px-3.5">
        <div className="flex flex-col min-w-max">
          {header}
          {empty ? (<>{skeletonBlock(team1Name, c1)}<span className="h-2" />{skeletonBlock(team2Name, c2)}</>) : (<>{block(team1Name, c1, team1Stats)}<span className="h-2" />{block(team2Name, c2, team2Stats)}</>)}
        </div>
      </div>
      {empty ? <span className="t-label-sm text-muted text-center pt-1.5">Live stats fill in as the game runs</span> : null}
    </SectionBox>
  );
}

function LivePlayerRow({ stat, columns, showAgent }: { stat: LivePlayerStat; columns: StatColumn[]; showAgent: boolean }) {
  const colorFor = (c: StatColumn) => {
    if (c.kind === "primary") return "text-violet";
    if (c.kind === "plusMinus") return stat.plusMinus > 0 ? "text-success" : stat.plusMinus < 0 ? "text-error" : "text-muted";
    return "text-secondary";
  };
  const ringClass = stat.isAlive === false ? "ring-[1.5px] ring-error/65" : stat.isAlive === true ? "ring-[1.5px] ring-violet/70" : "";
  return (
    <div className="flex items-center py-1.5 hover:bg-surface/40 rounded-md transition-colors">
      <span className="flex items-center gap-2 shrink-0 min-w-0" style={{ width: NAME_COL }}>
        <span className="relative shrink-0">
          <span className={clsx("inline-block rounded-full", ringClass, stat.isAlive === false && "opacity-55")}>
            <InitialAvatar name={stat.name} imageURL={stat.imageURL} size={38} />
          </span>
          {stat.id ? (
            <Link href={`${playerHref(stat.id, stat.name)}#comments`} aria-label={`Comments on ${stat.name}`} title="Player comments" className="absolute -bottom-[3px] -right-[3px] grid place-items-center size-[18px] rounded-full bg-violet border-2 border-card text-white hover:brightness-110">
              <MessageCircle size={8} className="fill-white" />
            </Link>
          ) : null}
        </span>
        {stat.id ? (
          <Link href={playerHref(stat.id, stat.name)} className="flex flex-col min-w-0 hover:underline underline-offset-2">
            <span className="t-body-sm text-primary truncate">{stat.name}</span>
            {stat.role ? <span className="t-label-sm text-muted truncate">{stat.role}</span> : null}
          </Link>
        ) : (
          <span className="flex flex-col min-w-0">
            <span className="t-body-sm text-primary truncate">{stat.name}</span>
            {stat.role ? <span className="t-label-sm text-muted truncate">{stat.role}</span> : null}
          </span>
        )}
      </span>
      {showAgent ? <><span className="w-px h-7 bg-border-subtle mx-2.5" /><span className="t-label-sm text-secondary truncate shrink-0" style={{ width: AGENT_COL }}>{stat.agent || "—"}</span></> : null}
      <span className="w-px h-7 bg-border-subtle mr-1.5" />
      {columns.map((c) => <span key={c.label} className={clsx("t-mono-sm text-center shrink-0", colorFor(c))} style={{ width: c.width }}>{c.value(stat)}</span>)}
    </div>
  );
}

// ── Prediction Teaser ─────────────────────────────────────────────────────
export function PredictionTeaserSection({ team1Color: c1, team2Color: c2, game, matchId, team1TopPlayer, team2TopPlayer, team1Name, team2Name, isPremium }: { team1Color: string; team2Color: string; game: string; matchId: string; team1TopPlayer: LivePlayerStat | null; team2TopPlayer: LivePlayerStat | null; team1Name: string; team2Name: string; isPremium: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const top = [team1TopPlayer, team2TopPlayer].filter((p): p is LivePlayerStat => !!p).sort((a, b) => b.kills - a.kills)[0] ?? null;
  const hint = top ? `${top.name} · ${top.kills} kills` : null;
  const row = (p: LivePlayerStat, teamName: string, color: string) => (
    <Link key={p.id} href={`/premium/predict?game=${encodeURIComponent(game)}&type=player&id=${encodeURIComponent(p.id)}&name=${encodeURIComponent(p.name)}&live=1&matchId=${encodeURIComponent(matchId)}`} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-surface hover:bg-surface/70 transition-colors">
      <span className="size-[7px] rounded-full shrink-0" style={{ background: color }} />
      <span className="flex flex-col min-w-0">
        <span className="t-body-md text-primary truncate">{p.name}</span>
        <span className="t-label-sm text-muted truncate">{p.kills} kills so far · {teamName}</span>
      </span>
      <span className="flex-1" />
      <ChevronRight size={11} className="text-muted" />
    </Link>
  );
  return (
    <SectionBox>
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="flex items-center gap-2 w-full text-left">
        <span className="t-headline-sm text-primary">Predictions</span>
        {!isPremium ? <span className="text-[9px] font-bold tracking-[0.5px] text-gold">PRO</span> : null}
        <span className="flex-1" />
        {!expanded && hint ? <span className="t-label-sm text-muted truncate">{hint}</span> : null}
        <ChevronDown size={11} className={clsx("text-muted transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded ? (
        <div className="flex flex-col gap-2 pt-3">
          {!isPremium ? (
            <Link href="/premium/upgrade" className="flex items-center gap-2.5 p-3 rounded-[10px] bg-surface hover:bg-surface/70 transition-colors">
              <AssetIcon name="premiumlocked" height={16} />
              <span className="flex flex-col gap-0.5">
                <span className="t-label-md text-primary">Live player predictions are a Pro feature</span>
                <span className="t-label-sm text-muted">Upgrade to unlock them for every match</span>
              </span>
              <span className="flex-1" />
              <ChevronRight size={11} className="text-muted" />
            </Link>
          ) : (
            <>
              {team1TopPlayer ? row(team1TopPlayer, team1Name, c1) : null}
              {team2TopPlayer ? row(team2TopPlayer, team2Name, c2) : null}
              {!team1TopPlayer && !team2TopPlayer ? <span className="t-label-sm text-muted">Available once player stats come in</span> : null}
            </>
          )}
        </div>
      ) : null}
    </SectionBox>
  );
}

// ── Fan Poll ──────────────────────────────────────────────────────────────
function questionOnly(q: string, team1Name: string, team2Name: string): string {
  const t = q.trim();
  const i = t.indexOf("?");
  if (i >= 0) return t.slice(0, i + 1);
  for (const sep of [" vs ", " vs. ", " or "]) {
    const needle = `${team1Name}${sep}${team2Name}`.toLowerCase();
    const at = t.toLowerCase().indexOf(needle);
    if (at >= 0) {
      const head = t.slice(0, at).trim();
      if (head) return head.endsWith(":") ? head.slice(0, -1) : head;
    }
  }
  return t;
}
function estimatedPayout(probability: number): number {
  const p = Math.max(1, Math.min(probability, 99));
  return Math.max(5, Math.round(((100 - p) / p) * 100));
}

export function FanPollSection({ poll, team1Color: c1, team2Color: c2, team1Name, team2Name, team1LogoURL, team2LogoURL, team1Probability, onVote, degradedMessage, voting }: { poll: FanPoll; team1Color: string; team2Color: string; team1Name: string; team2Name: string; team1LogoURL: string | null; team2LogoURL: string | null; team1Probability: number; onVote: (optionId: string) => void; degradedMessage?: string | null; voting?: boolean }) {
  const totalVotes = Math.max(poll.options.reduce((s, o) => s + o.votes, 0), 1);
  const probability = (o: FanPollOption): number | null => {
    if (!poll.isActive && poll.finalOdds && poll.finalOdds[o.id] !== undefined) return poll.finalOdds[o.id];
    const l = o.label.toLowerCase();
    if (l === team1Name.toLowerCase() || l.includes(team1Name.toLowerCase())) return team1Probability;
    if (l === team2Name.toLowerCase() || l.includes(team2Name.toLowerCase())) return 100 - team1Probability;
    return null;
  };
  const locked = poll.hasVoted || !poll.isActive;
  return (
    <SectionBox className="flex flex-col gap-2.5">
      {degradedMessage ? <div className="flex items-center gap-2 px-3 py-2 -mx-3.5 -mt-3.5 mb-1 bg-surface hairline-b t-label-sm text-secondary">{degradedMessage}</div> : null}
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-violet" />
        <span className="t-kicker">Fan Poll</span>
        <span className="flex-1" />
        {!poll.isActive ? <span className="text-[10px] font-semibold tracking-[1.2px] text-muted">CLOSED</span> : !poll.hasVoted ? <span className="text-[10px] font-semibold tracking-[1.2px] text-gold">LIVE ODDS</span> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="t-headline-sm text-primary">{questionOnly(poll.question, team1Name, team2Name)}</span>
        <span className="flex items-center gap-2 min-w-0">
          <TeamMark name={team1Name} logoURL={team1LogoURL} color={c1} size={20} />
          <span className="t-label-md truncate" style={{ color: c1 }}>{team1Name}</span>
          <span className="font-rounded text-[10px] font-black text-muted">VS</span>
          <span className="t-label-md truncate" style={{ color: c2 }}>{team2Name}</span>
          <TeamMark name={team2Name} logoURL={team2LogoURL} color={c2} size={20} />
        </span>
      </div>
      <div className="rounded-[10px] border border-border-subtle overflow-hidden">
        {poll.options.map((o, i) => {
          const isTeam1 = o.label.toLowerCase().includes(team1Name.toLowerCase());
          const isTeam2 = o.label.toLowerCase().includes(team2Name.toLowerCase());
          const color = isTeam1 ? c1 : isTeam2 ? c2 : "var(--violet)";
          const selected = o.id === poll.votedOptionId;
          const share = Math.trunc((o.votes / totalVotes) * 100);
          const odds = probability(o);
          return (
            <button key={o.id} type="button" disabled={locked || voting} onClick={() => onVote(o.id)} className={clsx("w-full text-left bg-card", i > 0 && "border-t border-border-subtle", !locked && "hover:bg-surface/60 transition-colors", locked && "cursor-default")} aria-pressed={selected}>
              <span className="flex items-center gap-2 px-3 py-[11px]">
                <span className="size-1.5 rounded-full border" style={{ background: selected ? color : "transparent", borderColor: selected ? color : "color-mix(in srgb, var(--text-muted) 35%, transparent)" }} />
                <span className={clsx("text-primary truncate", selected ? "t-label-md" : "t-body-sm")}>{o.label}</span>
                <span className="flex-1" />
                {locked ? (
                  <span className={clsx("t-mono-sm w-11 text-right", selected ? "text-primary" : "text-muted")}>{share}%</span>
                ) : odds !== null ? (
                  <>
                    <span className="t-mono-sm text-muted w-11 text-right">{odds}%</span>
                    <span className="t-mono-sm text-gold w-12 text-right">+{estimatedPayout(odds)}</span>
                  </>
                ) : null}
              </span>
              {locked ? (
                <span className="block h-[3px] bg-surface"><span className="block h-full transition-[width] duration-300" style={{ width: `${share}%`, background: color, opacity: selected ? 1 : 0.55 }} /></span>
              ) : null}
            </button>
          );
        })}
      </div>
      {poll.hasVoted && poll.lockedPayout !== null ? (
        <span className="flex items-center gap-1.5 pt-0.5"><span className="t-label-sm text-muted">Payout locked:</span><span className="t-mono-sm text-gold">+{poll.lockedPayout} pts</span><span className="t-label-sm text-muted">if you&apos;re right</span></span>
      ) : poll.hasVoted ? (
        <span className="t-label-sm text-muted pt-0.5">Vote locked in</span>
      ) : poll.isActive ? (
        <span className="t-label-sm text-muted">Payout locks at the odds when you vote — underdogs pay more</span>
      ) : null}
    </SectionBox>
  );
}
