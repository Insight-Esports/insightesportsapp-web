// predictions/LiveTeamBreakdown.tsx — LiveTeamBreakdown.swift (parity doc
// 2026-10-28 §11): the current-game breakdown for a TEAM playing right now.
// POST /predictions/live-team-breakdown {matchId, teamId}, refreshed every
// 20 s; a 404 means the match isn't live any more. From the top:
//   1 header (with the live match link)  2 score strip  3 how they're playing
//   4 team line  5 series  6 roster  7 matchup  8 last 10 · kills  9 footer
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Play } from "lucide-react";
import { api, ApiError, endpoints, errorMessage } from "@/lib/api";
import { clsx } from "@/lib/format";
import { liveMatchById, useLiveMatches } from "@/lib/live-matches";
import { useInterval } from "@/lib/use-fetch";
import { InitialAvatar, TeamMark } from "@/components/ui";
import { SkeletonLiveBreakdown } from "@/components/ui/skeletons";
import { EntityHeader, entityHref } from "@/components/ui/entity-header";
import { prefetchPlayer } from "@/features/entity-cache";
import { PredictScreen } from "./PredictScreen";
import { flowHref, readGame } from "./flow";
import { Caps, Disclaimer, FlowError, Section, StripedTable } from "./shared";
import { GameRows, OpponentLink } from "./links";
import { normalizeLiveTeamBreakdown, PredictionFormat, PredictionStatCatalog, type LiveTeamBreakdown, type LiveTeamMap } from "./types";

const REFRESH_MS = 20_000;
const abbr = (name: string | null | undefined) => (name ?? "—").slice(0, 3).toUpperCase();
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

export function LiveTeamBreakdownScreen() {
  const sp = useSearchParams();
  const game = readGame(sp);
  const teamId = sp.get("id") ?? "";
  const teamName = sp.get("name") ?? "";
  const matchId = sp.get("match");
  const t = { game, targetType: "team" as const, targetId: teamId, targetName: teamName, isLive: true, matchId };

  const [data, setData] = useState<LiveTeamBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notLive, setNotLive] = useState(false);

  // POST on open, then every 20 s while the match is live.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!matchId || !teamId) return;
    let on = true;
    (async () => {
      try {
        const raw = await api.post(endpoints.liveTeamBreakdown, { matchId, teamId });
        if (!on) return;
        setData(normalizeLiveTeamBreakdown(raw));
        setError(null); setNotLive(false);
      } catch (e) {
        if (!on) return;
        if (e instanceof ApiError && e.isNotFound) { setNotLive(true); setData(null); }
        else setError(errorMessage(e, "Couldn't load the live game."));
      } finally { if (on) setLoading(false); }
    })();
    return () => { on = false; };
  }, [matchId, teamId, tick]);
  useInterval(() => { if (!notLive) setTick((n) => n + 1); }, REFRESH_MS);
  const missing = !matchId || !teamId;

  // Which side the team is on (for context.score) — from the shared live list.
  const list = useLiveMatches(true);
  const live = liveMatchById(list, matchId);
  const isTeam1 = live ? live.team1Id === teamId : true;

  return (
    <PredictScreen title="Live Breakdown" back={flowHref.options(t)}>
      <div className="flex flex-col gap-4 pt-3 max-w-3xl w-full mx-auto">
        <div className="px-4">
          <EntityHeader type="team" id={teamId} name={teamName} game={game} matchId={matchId} live />
        </div>
        <div className="px-4 flex flex-col gap-5">
          {notLive || missing ? (
            <FlowError icon={<Play />} title="This match isn't live any more." />
          ) : loading && !data ? (
            <SkeletonLiveBreakdown />
          ) : error && !data ? (
            <FlowError title={error} />
          ) : data ? (
            <Body d={data} game={game} teamName={teamName} teamLogo={live ? (isTeam1 ? live.team1LogoURL : live.team2LogoURL) : null} isTeam1={isTeam1} />
          ) : null}
        </div>
      </div>
    </PredictScreen>
  );
}

function Body({ d, game, teamName, teamLogo, isTeam1 }: { d: LiveTeamBreakdown; game: string; teamName: string; teamLogo: string | null; isTeam1: boolean }) {
  const name = d.team ?? teamName;
  const maps = seriesTiles(d);
  const inSeries = (d.series?.bestOf ?? 1) > 1 || (d.series?.maps.length ?? 0) > 1;
  return (
    <>
      <ScoreStrip d={d} name={name} logo={teamLogo} isTeam1={isTeam1} inSeries={inSeries} />

      {d.summary ? (
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-card border border-border-subtle">
          <span className="flex items-center gap-1.5"><Activity size={14} className="text-violet" /><Caps>HOW THEY&apos;RE PLAYING</Caps></span>
          <span className="t-body-md text-secondary">{d.summary}</span>
        </div>
      ) : null}

      {d.stats.length ? (
        <Section title="TEAM LINE">
          <StripedTable
            header={<><span className="flex-1">STAT</span><span className="w-14 text-center">NOW</span><span className="w-14 text-center">USUAL</span><span className="w-14 text-center">PROJ</span><span className="w-[68px] text-right">PACE</span></>}
            rows={d.stats.map((s) => (
              <>
                <span className="flex-1 t-body-sm text-primary truncate">{PredictionStatCatalog.label(s.stat)}</span>
                <span className="w-14 text-center t-mono-sm text-violet">{s.current == null ? "—" : s.stat === "plus_minus" ? signed(s.current) : PredictionFormat.stat(s.current)}</span>
                <span className="w-14 text-center t-mono-sm text-secondary">{s.careerAverage == null ? "—" : PredictionFormat.stat(s.careerAverage)}</span>
                <span className="w-14 text-center t-mono-sm text-primary">{s.projectedFinal == null ? "—" : PredictionFormat.stat(s.projectedFinal)}</span>
                <PaceCell pace={s.vsPace} />
              </>
            ))}
          />
        </Section>
      ) : null}

      {inSeries && maps.length ? (
        <Section title="SERIES" trailing={d.series?.bestOf ? <span className="t-label-sm text-muted">Best of {d.series.bestOf}</span> : null}>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(maps.length, 5)}, minmax(0, 1fr))` }}>
            {maps.map((m) => <MapTile key={m.number} m={m} />)}
          </div>
        </Section>
      ) : null}

      {d.players.length ? (
        <Section title="ROSTER">
          <StripedTable
            header={<><span className="flex-1">PLAYER</span><span className="w-[100px] text-center">K / D / A</span><span className="w-10 text-center">+/−</span>{game === "VALORANT" ? <span className="w-11 text-center">ACS</span> : game === "CS2" ? <span className="w-11 text-center">ADR</span> : null}</>}
            rows={d.players.map((p) => (
              <>
                <span className="flex-1 flex items-center gap-2 min-w-0">
                  {p.playerId ? (
                    <Link href={entityHref("player", p.playerId)} onMouseEnter={() => prefetchPlayer(p.playerId!)} className="flex items-center gap-2 min-w-0 hover:underline underline-offset-2">
                      <InitialAvatar name={p.name} imageURL={p.imageURL} size={24} />
                      <span className="t-body-sm text-primary truncate">{p.name}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 min-w-0"><InitialAvatar name={p.name} imageURL={p.imageURL} size={24} /><span className="t-body-sm text-primary truncate">{p.name}</span></span>
                  )}
                  {game !== "CS2" && p.agent ? <span className="t-label-sm text-muted truncate shrink-[2]">{p.agent}</span> : null}
                </span>
                <span className="w-[100px] text-center t-mono-sm text-primary whitespace-nowrap">{p.kills ?? 0} / {p.deaths ?? 0} / {p.assists ?? 0}</span>
                <span className={clsx("w-10 text-center t-mono-sm", (p.plusMinus ?? 0) > 0 ? "text-success" : (p.plusMinus ?? 0) < 0 ? "text-error" : "text-secondary")}>{p.plusMinus == null ? "—" : signed(p.plusMinus)}</span>
                {game === "VALORANT" ? <span className="w-11 text-center t-mono-sm text-secondary">{p.acs == null ? "—" : Math.round(p.acs)}</span> : game === "CS2" ? <span className="w-11 text-center t-mono-sm text-secondary">{p.adr == null ? "—" : Math.round(p.adr)}</span> : null}
              </>
            ))}
          />
        </Section>
      ) : null}

      <Matchup d={d} name={name} />

      {d.last10Games.length ? (
        <Section title="LAST 10 · KILLS">
          <GameRows games={d.last10Games} />
        </Section>
      ) : null}

      <span className="t-label-sm text-muted text-center">Updates live as the game progresses</span>
      {d.disclaimer ? <Disclaimer>{d.disclaimer}</Disclaimer> : null}
    </>
  );
}

function PaceCell({ pace }: { pace: string | null }) {
  const p = (pace ?? "").toLowerCase();
  const [label, cls] = p === "ahead" ? ["AHEAD", "text-success"] : p === "behind" ? ["BEHIND", "text-error"] : p === "on pace" || p === "on_pace" ? ["ON PACE", "text-secondary"] : ["—", "text-muted"];
  return <span className={clsx("w-[68px] text-right t-label-sm font-semibold tracking-[0.04em]", cls)}>{label}</span>;
}

/** "8 to 5" → [8, 5]. */
function parseRounds(r: string | null): [number, number] | null {
  const m = r ? /(-?\d+)\D+(-?\d+)/.exec(r) : null;
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The series as tiles: the maps the server knows, then NEXT up to best-of. */
function seriesTiles(d: LiveTeamBreakdown): LiveTeamMap[] {
  const known = [...(d.series?.maps ?? [])].sort((a, b) => a.number - b.number);
  // No map rows yet: the map being played is the next one after the decided ones.
  if (known.length === 0) known.push({ number: (d.series?.mapsWon ?? 0) + (d.series?.mapsLost ?? 0) + 1, status: "running", targetWon: null, rounds: null });
  const bestOf = Math.max(d.series?.bestOf ?? 0, known[known.length - 1]?.number ?? 0);
  const out: LiveTeamMap[] = [];
  for (let n = 1; n <= bestOf; n++) out.push(known.find((m) => m.number === n) ?? { number: n, status: "not_started", targetWon: null, rounds: null });
  return out;
}

function MapTile({ m }: { m: LiveTeamMap }) {
  const status = (m.status ?? "").toLowerCase();
  const running = status === "running" || status === "live";
  const kind = m.targetWon === true ? "WON" : m.targetWon === false ? "LOST" : running ? "LIVE" : "NEXT";
  const rounds = parseRounds(m.rounds);
  return (
    <div className={clsx("flex flex-col items-center gap-1 px-2 py-2.5 rounded-[10px] bg-card border", kind === "LIVE" ? "border-violet" : "border-border-subtle")}>
      <span className="t-label-sm text-muted">Map {m.number}</span>
      <span className="t-mono-md text-primary">{rounds ? `${rounds[0]}–${rounds[1]}` : "—"}</span>
      <span className={clsx("t-label-sm font-semibold tracking-[0.06em]", kind === "WON" ? "text-success" : kind === "LOST" ? "text-error" : kind === "LIVE" ? "text-violet" : "text-muted")}>{kind}</span>
    </div>
  );
}

function ScoreStrip({ d, name, logo, isTeam1, inSeries }: { d: LiveTeamBreakdown; name: string; logo: string | null; isTeam1: boolean; inSeries: boolean }) {
  // Round score from the running map's rounds ("8 to 5", already from the
  // team's side), falling back to context.score.
  const running = d.series?.maps.find((m) => { const s = (m.status ?? "").toLowerCase(); return s === "running" || s === "live"; });
  const fromMap = parseRounds(running?.rounds ?? null);
  const sc = d.context?.score;
  const [mine, theirs] = fromMap ?? (sc ? (isTeam1 ? [sc.team1, sc.team2] : [sc.team2, sc.team1]) : [0, 0]);
  const state = mine > theirs ? "Leading" : mine < theirs ? "Trailing" : "Level";
  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[10px] bg-card border border-border-subtle min-w-0">
      <TeamMark name={name} logoURL={logo} size={22} />
      <span className="t-label-md text-primary">{abbr(name)}</span>
      <span className="t-mono-md text-primary">{mine}</span>
      <span className="t-mono-md text-muted">–</span>
      <span className="t-mono-md text-primary">{theirs}</span>
      <OpponentLink id={d.opponentId} name={abbr(d.opponentName)} logoURL={d.opponentLogoUrl} size={22} className="flex-row-reverse" textClassName="t-label-md text-secondary" />
      <span className="flex-1" />
      {inSeries && d.series ? <span className="t-label-sm text-muted shrink-0">{d.series.mapsWon}–{d.series.mapsLost} maps</span> : null}
      <span className={clsx("t-label-sm shrink-0", state === "Leading" ? "text-success" : state === "Trailing" ? "text-error" : "text-secondary")}>{state}</span>
    </div>
  );
}

function Matchup({ d, name }: { d: LiveTeamBreakdown; name: string }) {
  const h = d.headToHead, st = d.strength;
  if (!h && !st) return null;
  const team = st?.team ?? null, opp = st?.opponent ?? null;
  const total = (team ?? 0) + (opp ?? 0);
  const share = total > 0 && team != null ? team / total : 0.5;
  const teamPct = Math.round(share * 100);
  return (
    <Section title="MATCHUP">
      <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-card border border-border-subtle">
        {h ? (
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="t-body-md text-secondary shrink-0">Record vs</span>
            <OpponentLink id={d.opponentId} name={d.opponentName} logoURL={d.opponentLogoUrl} size={18} textClassName="t-body-md text-primary" />
            <span className="flex-1" />
            {h.played > 0 ? (
              <span className="flex items-baseline gap-1.5 shrink-0"><span className="t-mono-md text-violet">{h.wins}–{h.losses}</span><span className="t-label-sm text-muted">in {h.played}</span></span>
            ) : <span className="t-label-sm text-muted shrink-0">First meeting</span>}
          </div>
        ) : null}
        {st && team != null && opp != null ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between t-label-sm">
              <span className="text-violet">{abbr(name)} {teamPct}%</span>
              <span className="text-muted">STRENGTH</span>
              <span className="text-secondary">{100 - teamPct}% {abbr(d.opponentName)}</span>
            </div>
            <div className="flex h-[6px] rounded-full overflow-hidden bg-surface">
              <span className="block h-full bg-violet" style={{ width: `${teamPct}%` }} />
              <span className="block h-full bg-muted/35" style={{ width: `${100 - teamPct}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
