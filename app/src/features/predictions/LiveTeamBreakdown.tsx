// predictions/LiveTeamBreakdown.tsx — LiveTeamBreakdown.swift (parity docs
// 2026-10-28 §11, 2026-10-29 §4): the current-game breakdown for a TEAM
// playing right now. POST /predictions/live-team-breakdown {matchId, teamId}
// (rev 2), refreshed every 20 s; a 404 means the match isn't live any more.
// From the top:
//   1 header (its live match link carries the score — no score strip)
//   2 how they're playing  3 team line (pace colour from rev 2's `good`)
//   4 series  5 map profile (VALORANT/CS2)  6 roster  7 matchup
//   8 last 10 · kills  9 footer
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, ChevronRight, Play } from "lucide-react";
import { api, ApiError, endpoints, errorMessage } from "@/lib/api";
import { clsx } from "@/lib/format";
import { liveMatchById, useLiveMatches } from "@/lib/live-matches";
import { useInterval } from "@/lib/use-fetch";
import { InitialAvatar, SkeletonBar, TeamMark } from "@/components/ui";
import { SkeletonLiveBreakdown } from "@/components/ui/skeletons";
import { EntityHeader, entityHref } from "@/components/ui/entity-header";
import { prefetchPlayer } from "@/features/entity-cache";
import { PredictScreen } from "./PredictScreen";
import { flowHref, readGame } from "./flow";
import { Caps, Disclaimer, FlowError, Section, StripedTable } from "./shared";
import { GameRows, OpponentLink } from "./links";
import { MapGrid } from "./MapGrid";
import { callTone, mapPoolWith } from "./TeamMapProfile";
import {
  mapCall, mapDeltaText, mapWinRateDelta, normalizeLiveTeamBreakdown, normalizeTeamMapProfile, PredictionFormat, PredictionStatCatalog,
  type LiveTeamBreakdown, type LiveTeamMap, type TeamMapProfile,
} from "./types";

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

  // Which side the team is on (for its crest) — from the shared live list.
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
            <Body d={data} game={game} teamId={teamId} teamName={teamName} teamLogo={live ? (isTeam1 ? live.team1LogoURL : live.team2LogoURL) : null} />
          ) : null}
        </div>
      </div>
    </PredictScreen>
  );
}

function Body({ d, game, teamId, teamName, teamLogo }: { d: LiveTeamBreakdown; game: string; teamId: string; teamName: string; teamLogo: string | null }) {
  const name = d.team ?? teamName;
  const maps = seriesTiles(d);
  const inSeries = (d.series?.bestOf ?? 1) > 1 || (d.series?.maps.length ?? 0) > 1;
  const showGold = game === "League" && d.players.some((p) => p.gold != null);
  const lastHeader = game === "VALORANT" ? "ACS" : game === "CS2" ? "ADR" : showGold ? "GOLD" : null;
  return (
    <>

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
                <span className="w-14 text-center t-mono-sm text-violet">{lineValue(s.stat, s.current, true)}</span>
                <span className="w-14 text-center t-mono-sm text-secondary">{lineValue(s.stat, s.careerAverage)}</span>
                <span className="w-14 text-center t-mono-sm text-primary">{lineValue(s.stat, s.projectedFinal)}</span>
                <PaceCell pace={s.vsPace} good={s.good} />
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

      {game !== "League" && teamId && d.opponentId ? (
        <MapProfileCard
          game={game}
          liveMap={d.context?.map ?? null}
          teams={[{ id: d.teamId ?? teamId, name, logo: teamLogo }, { id: d.opponentId, name: d.opponentName ?? "Opponent", logo: d.opponentLogoUrl }]}
        />
      ) : null}

      {d.players.length ? (
        <Section title="ROSTER">
          <StripedTable
            header={<>
              <span className="flex-1 min-w-0">PLAYER</span>
              <span className="w-[22px] text-right">K</span>
              <span className="w-[22px] text-right">D</span>
              <span className="w-[22px] text-right">A</span>
              <span className="w-[34px] text-right">+/−</span>
              {lastHeader ? <span className="w-[44px] text-right">{lastHeader}</span> : null}
            </>}
            rows={d.players.map((p) => (
              <>
                <span className="flex-1 flex items-center gap-2 min-w-0 whitespace-nowrap">
                  {p.playerId ? (
                    <Link href={entityHref("player", p.playerId)} onMouseEnter={() => prefetchPlayer(p.playerId!)} className="flex items-center gap-2 min-w-0 hover:underline underline-offset-2">
                      <InitialAvatar name={p.name} imageURL={p.imageURL} size={24} />
                      <span className="t-body-sm text-primary truncate">{p.name}</span>
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 min-w-0"><InitialAvatar name={p.name} imageURL={p.imageURL} size={24} /><span className="t-body-sm text-primary truncate">{p.name}</span></span>
                  )}
                  {game !== "CS2" && p.agent ? <span className="t-label-sm text-muted truncate shrink-[2] min-w-0">{p.agent}</span> : null}
                </span>
                <span className="w-[22px] shrink-0 text-right t-mono-sm text-primary">{p.kills ?? 0}</span>
                <span className="w-[22px] shrink-0 text-right t-mono-sm text-primary">{p.deaths ?? 0}</span>
                <span className="w-[22px] shrink-0 text-right t-mono-sm text-primary">{p.assists ?? 0}</span>
                <span className={clsx("w-[34px] shrink-0 text-right t-mono-sm whitespace-nowrap", (p.plusMinus ?? 0) > 0 ? "text-success" : (p.plusMinus ?? 0) < 0 ? "text-error" : "text-secondary")}>{p.plusMinus == null ? "—" : signed(p.plusMinus)}</span>
                {lastHeader ? (
                  <span className="w-[44px] shrink-0 text-right t-mono-sm text-secondary whitespace-nowrap">
                    {game === "VALORANT" ? (p.acs == null ? "—" : Math.round(p.acs)) : game === "CS2" ? (p.adr == null ? "—" : Math.round(p.adr)) : p.gold == null ? "—" : compactGold(p.gold)}
                  </span>
                ) : null}
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

/** Pace: rev 2's `good` colours it (green good news, red not — ahead on deaths is red); without it, ahead = green. */
function PaceCell({ pace, good }: { pace: string | null; good: boolean | null }) {
  const p = (pace ?? "").toLowerCase();
  const label = p === "ahead" ? "AHEAD" : p === "behind" ? "BEHIND" : p === "on pace" || p === "on_pace" ? "ON PACE" : "—";
  const cls = label === "—" ? "text-muted"
    : good === true ? "text-success" : good === false ? "text-error"
    : label === "AHEAD" ? "text-success" : label === "BEHIND" ? "text-error" : "text-secondary";
  return <span className={clsx("w-[68px] text-right t-label-sm font-semibold tracking-[0.04em]", cls)}>{label}</span>;
}

/** "12.4k" from 12,400 (League gold). */
function compactGold(v: number): string {
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}
/** A team-line value: +/− signed (the live value), gold compact, the rest the predictor's format. */
function lineValue(stat: string, v: number | null, live = false): string {
  if (v == null) return "—";
  if (stat === "gold_earned") return compactGold(v);
  if (stat === "plus_minus" && live) return signed(v);
  return PredictionFormat.stat(v);
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

// MARK: - MAP PROFILE (VALORANT / CS2)
// The grid with the live map selected and dotted, then both teams on the
// selected map against their usual: TEAM | WIN % | RECORD | VS USUAL. Picking
// another map pins it; picking the live map follows it again (the series
// moving on moves the card with it). GET /predictions/team-map/:teamId once
// per team and map; the 20 s refresh doesn't refetch.
interface CardTeam { id: string; name: string; logo: string | null }
type MapEntry = { state: "loading" } | { state: "error" } | { state: "ok"; r: TeamMapProfile };

function MapProfileCard({ game, liveMap, teams }: { game: string; liveMap: string | null; teams: CardTeam[] }) {
  const [pinned, setPinned] = useState<string | null>(null);
  const selected = pinned ?? liveMap;
  const pool = mapPoolWith(game, liveMap);
  const [cache, setCache] = useState<Record<string, MapEntry>>({});
  const asked = useRef(new Set<string>());
  const keyOf = (teamId: string, map: string) => `${teamId}|${game}|${map.toLowerCase()}`;

  useEffect(() => {
    if (!selected) return;
    for (const t of teams) {
      const key = keyOf(t.id, selected);
      if (asked.current.has(key)) continue;
      asked.current.add(key);
      setCache((c) => ({ ...c, [key]: { state: "loading" } }));
      api.get(endpoints.teamMapProfile(t.id, game, selected))
        .then((raw) => setCache((c) => ({ ...c, [key]: { state: "ok", r: normalizeTeamMapProfile(raw) } })))
        .catch(() => { asked.current.delete(key); setCache((c) => ({ ...c, [key]: { state: "error" } })); });
    }
    // keyOf is derived from game; teams by id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, game, teams.map((t) => t.id).join("|")]);

  const pick = (m: string | null) => {
    if (!m) return;
    setPinned(liveMap && m.toLowerCase() === liveMap.toLowerCase() ? null : m);
  };

  return (
    <Section title="MAP PROFILE">
      <MapGrid maps={pool} selected={selected} liveMap={liveMap} onSelect={pick} />
      {selected ? (
        <div className="ledger mt-1">
          <div className="flex items-center gap-1 px-3 py-1.5 t-label-sm text-muted uppercase">
            <span className="flex-1">TEAM</span><span className="w-[52px] text-center">WIN %</span><span className="w-[52px] text-center">RECORD</span><span className="w-[64px] text-right">VS USUAL</span><span className="w-[11px]" />
          </div>
          {teams.map((t, i) => (
            <MapProfileRow key={t.id} team={t} map={selected} liveMap={liveMap} game={game} entry={cache[keyOf(t.id, selected)]} striped={i % 2 === 1} />
          ))}
        </div>
      ) : (
        <span className="t-label-md text-muted">Pick a map to see both teams on it.</span>
      )}
      <span className="t-label-sm text-muted">Tap a team for its full map profile. Pick another map to look ahead to the next game.</span>
    </Section>
  );
}

function MapProfileRow({ team, map, liveMap, game, entry, striped }: { team: CardTeam; map: string; liveMap: string | null; game: string; entry: MapEntry | undefined; striped: boolean }) {
  const href = flowHref.mapProfile({ game, targetId: team.id, targetName: team.name }, map, { liveMap, fromLive: true });
  const r = entry?.state === "ok" ? entry.r : null;
  const pending = !entry || entry.state === "loading";
  const games = r?.gamesPlayed ?? 0;
  const delta = r ? mapWinRateDelta(games, r.winRateValue, r.overall?.winRateValue ?? null) : null;
  const call = mapCall(games, delta);
  const wins = r?.wins ?? 0, losses = r?.losses ?? Math.max(0, games - wins);
  const cell = (node: ReactNode) => (pending ? <SkeletonBar width={28} height={9} className="mx-auto" /> : node);
  return (
    <Link href={href} className={clsx("flex items-center gap-1 px-3 py-2.5 transition-colors hover:bg-surface", striped ? "bg-surface/50" : "bg-card")}>
      <span className="flex-1 flex items-center gap-2 min-w-0">
        <TeamMark name={team.name} logoURL={team.logo} size={20} />
        <span className="t-body-sm text-primary truncate">{team.name}</span>
      </span>
      <span className="w-[52px] text-center t-mono-sm text-violet">{cell(games > 0 && r?.winRateValue != null ? `${Math.round(r.winRateValue)}%` : "—")}</span>
      <span className="w-[52px] text-center t-mono-sm text-primary whitespace-nowrap">{cell(r ? `${wins}–${losses}` : "—")}</span>
      <span className={clsx("w-[64px] text-right t-mono-sm", call === "too_few_games" ? "text-muted" : callTone(call))}>
        {pending ? <SkeletonBar width={24} height={9} className="ml-auto" /> : call === "too_few_games" || delta == null ? "—" : mapDeltaText(delta)}
      </span>
      <ChevronRight size={11} className="w-[11px] text-muted shrink-0" />
    </Link>
  );
}
