// predictions/TeamMapProfile.tsx — Map Profile rev 2 (parity doc 2026-10-29
// §3): GET /predictions/team-map/:teamId?game=&map= → the team on one map
// against its usual (`overall`, every map) and its recent form there
// (`recentGames`). From the top: the header, the two-row map grid (the map
// being played dotted), then for the chosen map:
//   1 record  2 the call (≥ 3 games, ±5 win-rate points)  3 averages vs all
//   maps  4 recent form on the map.
// URL: ?map= the chosen map, ?liveMap= the map being played (dotted),
// ?from=live → Back is history back (opened from the live team breakdown).
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { useFetch } from "@/lib/use-fetch";
import { LoadFailure, SkeletonBar, SkeletonStatRow } from "@/components/ui";
import { SkeletonStripedTable } from "@/components/ui/skeletons";
import { EntityHeader, matchPageHref } from "@/components/ui/entity-header";
import { PredictScreen } from "./PredictScreen";
import { flowHref, readTarget } from "./flow";
import { OpponentLink } from "./links";
import { MapGrid } from "./MapGrid";
import { Disclaimer, FlowError, Section, StatRow, StripedTable } from "./shared";
import {
  gameMaps, mapCall, mapDeltaText, mapWinRateDelta, normalizeTeamMapProfile, PredictionFormat,
  type MapCall, type PredictionGame, type TeamMapProfile,
} from "./types";

// Display order for the avgStats dictionary.
const STAT_ORDER: [string, string][] = [["kills", "Kills"], ["deaths", "Deaths"], ["assists", "Assists"], ["plusMinus", "+/−"], ["acs", "ACS"], ["adr", "ADR"], ["headshots", "Headshots"], ["gold", "Gold"]];

/** The pool for the grid, with the live map added when the static pool lacks it. */
export function mapPoolWith(game: string, liveMap: string | null | undefined): string[] {
  const pool = gameMaps(game);
  if (liveMap && !pool.some((m) => m.toLowerCase() === liveMap.toLowerCase())) return [...pool, liveMap];
  return pool;
}

export const callTone = (c: MapCall) => (c === "better" ? "text-success" : c === "worse" ? "text-error" : "text-secondary");
const pct = (v: number | null | undefined, fallback: string | null = null) => (v == null ? fallback ?? "—" : `${Math.round(v)}%`);
const signedStat = (v: number) => (v > 0 ? `+${PredictionFormat.stat(v)}` : v < 0 ? `−${PredictionFormat.stat(-v)}` : "0");
const signedInt = (v: number) => (v > 0 ? `+${Math.round(v)}` : v < 0 ? `−${Math.abs(Math.round(v))}` : "0");
function wl(result: string | null): "W" | "L" | null {
  const r = (result ?? "").toLowerCase();
  return r === "w" || r === "win" || r === "won" ? "W" : r === "l" || r === "loss" || r === "lost" ? "L" : null;
}

export function TeamMapProfileScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  // Always a team (older links carried no type).
  const t = { ...readTarget(sp), targetType: "team" as const };
  const map = sp.get("map");
  const liveMap = sp.get("liveMap");
  const fromLive = sp.get("from") === "live";
  const maps = mapPoolWith(t.game, liveMap);

  const { data: r, loading, error, connectionProblem, reload } = useFetch<TeamMapProfile>(
    async (signal) => normalizeTeamMapProfile(await api.get(endpoints.teamMapProfile(t.targetId, t.game, map ?? ""), { signal })),
    [t.targetId, t.game, map],
    { enabled: !!map },
  );

  return (
    <PredictScreen title="Map Profile" back={fromLive ? undefined : flowHref.options(t)}>
      <div className="flex flex-col gap-5 pt-1 max-w-3xl w-full mx-auto">
        <div className="px-4 pt-3">
          <EntityHeader type="team" id={t.targetId} name={t.targetName} game={t.game} />
        </div>
        <div className="px-4">
          <MapGrid
            maps={maps}
            selected={map}
            liveMap={liveMap}
            onSelect={(m) => m && router.replace(flowHref.mapProfile(t, m, { liveMap, fromLive }), { scroll: false })}
          />
        </div>

        <div className="px-4">
          {!map ? (
            <p className="py-8 px-6 text-center t-body-md text-muted">Pick a map to see how {t.targetName} performs on it.</p>
          ) : loading ? (
            <div className="flex flex-col gap-5">
              <SkeletonStatRow columns={3} />
              <div className="h-[74px] rounded-xl bg-card border border-border-subtle" />
              <div className="flex flex-col gap-2.5"><SkeletonBar width={90} height={8} /><SkeletonStripedTable rows={5} columns={4} /></div>
            </div>
          ) : error || !r ? (
            connectionProblem ? <LoadFailure error={error ?? ""} connectionProblem onRetry={reload} /> : <FlowError title={error ?? "Something went wrong."} />
          ) : (
            <ProfileContent r={r} map={map} />
          )}
        </div>
      </div>
    </PredictScreen>
  );
}

function ProfileContent({ r, map }: { r: TeamMapProfile; map: string }) {
  const name = r.map ?? map;
  const MAP = name.toUpperCase();
  const games = r.gamesPlayed ?? 0;
  if (games === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div className="py-8 px-6 text-center t-body-md text-muted rounded-xl bg-card border border-border-subtle">{r.message ?? `No completed matches on ${name} yet.`}</div>
        {r.disclaimer ? <Disclaimer>{r.disclaimer}</Disclaimer> : null}
      </div>
    );
  }
  const wins = r.wins ?? 0, losses = r.losses ?? Math.max(0, games - wins);
  const delta = mapWinRateDelta(games, r.winRateValue, r.overall?.winRateValue ?? null);
  const call = mapCall(games, delta);

  return (
    <div className="flex flex-col gap-5">
      {/* 1 — Record */}
      <StatRow cells={[{ label: "Record", value: `${wins}–${losses}` }, { label: "Win %", value: pct(r.winRateValue, r.winRate), marquee: true }, { label: "Games", value: games }]} />

      {/* 2 — The call */}
      {call !== "too_few_games" && delta != null ? (
        <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-card border border-border-subtle">
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <span className={clsx("text-[11px] leading-tight font-semibold tracking-[0.08em] uppercase", callTone(call))}>
              {call === "better" ? `BETTER ON ${MAP}` : call === "worse" ? `WORSE ON ${MAP}` : `THEIR USUAL ON ${MAP}`}
            </span>
            <span className="t-body-sm text-secondary">{pct(r.winRateValue, r.winRate)} here · {pct(r.overall?.winRateValue, r.overall?.winRate ?? null)} on every map</span>
          </div>
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <span className={clsx("t-mono-lg leading-none", callTone(call))}>{mapDeltaText(delta)}</span>
            <span className="text-[9px] font-semibold tracking-[0.1em] text-muted uppercase">WIN % VS USUAL</span>
          </div>
        </div>
      ) : null}

      {/* 3 — Averages vs every map */}
      <Averages r={r} MAP={MAP} />

      {/* 4 — Recent form on the map */}
      {r.recentGames.length ? <RecentForm games={r.recentGames} MAP={MAP} /> : null}

      {r.disclaimer ? <Disclaimer>{r.disclaimer}</Disclaimer> : null}
    </div>
  );
}

/** ± colour: deaths are better lower; plain within ±1 for +/−, else within max(0.5, 3% of the usual). */
function diffTone(key: string, diff: number, usual: number): string {
  const plain = key === "plusMinus" ? Math.abs(diff) <= 1 : Math.abs(diff) <= Math.max(0.5, Math.abs(usual) * 0.03);
  if (plain) return "text-secondary";
  const better = key === "deaths" ? diff < 0 : diff > 0;
  return better ? "text-success" : "text-error";
}

function Averages({ r, MAP }: { r: TeamMapProfile; MAP: string }) {
  const on = r.avgStats ?? {}, all = r.overall?.avgStats ?? {};
  const rows = STAT_ORDER.flatMap(([k, label]) => {
    const a = on[k];
    if (a == null) return [];
    const b = all[k] ?? null;
    return [{ k, label, a, b, diff: b == null ? null : Math.round((a - b) * 10) / 10 }];
  });
  if (!rows.length) return null;
  return (
    <Section title="AVERAGES">
      <StripedTable
        header={<><span className="flex-1">STAT</span><span className="w-[72px] text-center truncate">{MAP}</span><span className="w-[72px] text-center">ALL MAPS</span><span className="w-[56px] text-right">±</span></>}
        rows={rows.map((x) => (
          <>
            <span className="flex-1 t-body-sm text-primary truncate">{x.label}</span>
            <span className="w-[72px] text-center t-mono-sm text-primary">{x.k === "plusMinus" ? signedStat(x.a) : PredictionFormat.stat(x.a)}</span>
            <span className="w-[72px] text-center t-mono-sm text-secondary">{x.b == null ? "—" : x.k === "plusMinus" ? signedStat(x.b) : PredictionFormat.stat(x.b)}</span>
            <span className={clsx("w-[56px] text-right t-mono-sm", x.diff == null || x.b == null ? "text-muted" : diffTone(x.k, x.diff, x.b))}>{x.diff == null ? "—" : signedStat(x.diff)}</span>
          </>
        ))}
      />
    </Section>
  );
}

function RecentForm({ games, MAP }: { games: PredictionGame[]; MAP: string }) {
  const res = games.map((g) => wl(g.result));
  const w = res.filter((x) => x === "W").length, l = res.filter((x) => x === "L").length;
  const oldestFirst = [...res].reverse();
  return (
    <Section title={`RECENT FORM ON ${MAP}`} trailing={<span className="t-mono-sm text-primary">{w}–{l}</span>}>
      <div className="flex items-center gap-1.5" aria-label={`Oldest to newest: ${oldestFirst.join(" ")}`}>
        {oldestFirst.map((x, i) => <span key={i} className={clsx("size-2 rounded-full", x === "W" ? "bg-success" : x === "L" ? "bg-error" : "bg-muted/35")} />)}
      </div>
      <div className="ledger">
        <div className="flex items-center gap-1 px-3 py-1.5 t-label-sm text-muted uppercase">
          <span className="flex-1">OPPONENT</span><span className="w-14 text-center">RESULT</span><span className="w-12 text-right">+/−</span><span className="w-[11px]" />
        </div>
        {games.map((g, i) => {
          const r = res[i];
          const pm = g.statValue;
          return (
            <div key={(g.matchId ?? "") + i} className={clsx("relative flex items-center gap-1 px-3 py-2.5 transition-colors", i % 2 === 0 ? "bg-card" : "bg-surface/50", g.matchId && "hover:bg-surface")}>
              {g.matchId ? <Link href={matchPageHref(g.matchId)} className="absolute inset-0" aria-label={`Open the match${g.opponentName ? ` vs ${g.opponentName}` : ""}`} /> : null}
              <span className="flex-1 flex items-center min-w-0">
                {g.opponentId || g.opponentName ? (
                  <OpponentLink id={g.opponentId} name={g.opponentName} logoURL={g.opponentLogoUrl} size={20} />
                ) : <span className="t-body-sm text-secondary truncate">{g.matchup ?? "—"}</span>}
              </span>
              <span className={clsx("w-14 text-center t-label-md font-semibold", r === "W" ? "text-success" : r === "L" ? "text-error" : "text-muted")}>{r ?? "—"}</span>
              <span className={clsx("w-12 text-right t-mono-sm", pm > 0 ? "text-success" : pm < 0 ? "text-error" : "text-secondary")}>{signedInt(pm)}</span>
              {g.matchId ? <ChevronRight size={11} className="w-[11px] text-muted shrink-0" /> : <span className="w-[11px] shrink-0" />}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

