// predictions/Breakdown.tsx — PredictionBreakdownView, the "Full Breakdown"
// screen on /predictions/player-overview/:id and /team-overview/:id.
//
// Record + win rate across Last 10 / Season / All Time, form pips (Last 10),
// per-stat averages, best game, (players) highs & lows + best/worst,
// map / agent performance tables, (League teams) side performance.
// Nothing is computed client-side except bar scaling.
"use client";

import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { gameLabel } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { FilterSegment, LoadFailure, SkeletonStatRow } from "@/components/ui";
import { PredictScreen } from "./PredictScreen";
import { flowHref, readTarget, type FlowTarget } from "./flow";
import { Disclaimer, FormPips, LoadingLine, Section, StatRow, StepHeader, StripedTable, Track } from "./shared";
import { BREAKDOWN_PERIODS, normalizePlayerOverview, normalizeTeamOverview, overviewLabel, pctDisplay, PredictionFormat, type BreakdownPeriodKey, type NamedHighlight, type OverviewPeriod, type PlayerOverview, type SideStats, type TeamOverview } from "./types";

export function BreakdownScreen() {
  const sp = useSearchParams();
  const t = readTarget(sp);
  return (
    <PredictScreen title="Breakdown" back={flowHref.options(t)} wide>
      <BreakdownPanel target={t} />
    </PredictScreen>
  );
}

interface Overview { player: PlayerOverview | null; team: TeamOverview | null }

export function useOverview(t: FlowTarget) {
  return useFetch<Overview>(async (signal) => {
    if (t.targetType === "player") return { player: normalizePlayerOverview(await api.get(endpoints.playerOverview(t.targetId, t.game), { signal })), team: null };
    return { player: null, team: normalizeTeamOverview(await api.get(endpoints.teamOverview(t.targetId, t.game), { signal })) };
  }, [t.targetType, t.targetId, t.game]);
}

/** The breakdown body. `compact` = the rail version beside a result (fewer columns). */
export function BreakdownPanel({ target: t, compact }: { target: FlowTarget; compact?: boolean }) {
  const { data, loading, error, connectionProblem, reload } = useOverview(t);
  const [period, setPeriod] = useState<BreakdownPeriodKey>("last10");

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-4 pt-3">
        <LoadingLine text="Building the breakdown…" className="py-6" />
        <SkeletonStatRow columns={3} />
        <SkeletonStatRow columns={2} />
      </div>
    );
  }
  if (error || !data) return <LoadFailure error={error ?? "Something went wrong."} connectionProblem={connectionProblem} onRetry={reload} />;

  const po = data.player, to = data.team;
  const currentSeason = po?.currentSeason ?? to?.currentSeason ?? null;
  const subtitle = [gameLabel(t.game), t.targetType === "player" ? po?.team : null, currentSeason].filter(Boolean).join(" · ");
  const periods = { last10: po?.last10 ?? to?.last10 ?? null, season: po?.season ?? to?.season ?? null, allTime: po?.allTime ?? to?.allTime ?? null };
  const p = periods[period];
  const periodLabel = BREAKDOWN_PERIODS.find((x) => x.key === period)!.label;
  const statLabel = (k: string) => overviewLabel(k);

  // Per-stat averages: player order follows the backend's statColumns; team order is game-aware.
  const avgEntries = (() => {
    if (!p?.avgStats) return [] as { label: string; value: string }[];
    const avg = p.avgStats;
    let order: string[];
    if (t.targetType === "player") order = po?.statColumns ?? Object.keys(avg).sort();
    else if (t.game === "VALORANT") order = ["kills", "deaths", "assists", "acs", "adr", "headshots", "plusMinus"];
    else if (t.game === "CS2") order = ["kills", "deaths", "assists", "adr", "headshots", "plusMinus"];
    else if (t.game === "League") order = ["kills", "deaths", "assists", "cs", "csPerMin", "cs_per_min", "gold", "goldEarned", "gold_earned", "visionScore", "vision_score", "plusMinus"];
    else order = ["kills", "deaths", "assists", "plusMinus"];
    return order.flatMap((k) => (avg[k] != null ? [{ label: statLabel(k), value: PredictionFormat.stat(avg[k] as number) }] : []));
  })();

  const highLow = (season: boolean) => {
    const highs = season ? po?.seasonHighs : po?.careerHighs;
    const lows = season ? po?.seasonLows : po?.careerLows;
    if (!highs || !lows) return [] as { label: string; high: string; low: string }[];
    const order = po?.statColumns ?? Object.keys(highs).sort();
    return order.flatMap((k) => (highs[k] != null && lows[k] != null ? [{ label: statLabel(k), high: PredictionFormat.stat(highs[k] as number), low: PredictionFormat.stat(lows[k] as number) }] : []));
  };

  const highlightLabel = (h: NamedHighlight | null): string | null => {
    if (!h?.name) return null;
    if (h.winRate) return `${h.name} · ${h.winRate}`;
    if (h.games != null) return `${h.name} · ${h.games}g`;
    return h.name;
  };
  const bestWorst = po ? [
    { label: t.game === "League" ? "Champion" : "Agent", best: highlightLabel(po.bestAgent), worst: highlightLabel(po.worstAgent) },
    { label: "Map", best: highlightLabel(po.bestMap), worst: highlightLabel(po.worstMap) },
  ].filter((r) => r.best || r.worst) : [];

  const agentBars = (po?.agentBreakdown ?? []).map((a) => ({ name: a.agent ?? "—", value: a.avgStat ?? 0, games: a.gamesPlayed ?? 0, display: null as string | null }));
  const mapBars = t.targetType === "player"
    ? (po?.mapBreakdown ?? []).map((m) => ({ name: m.mapName ?? "—", value: m.avgStat ?? 0, games: m.gamesPlayed ?? 0, display: null as string | null }))
    : (to?.mapBreakdown ?? []).map((m) => ({ name: m.mapName ?? "—", value: m.winRate ?? 0, games: m.gamesPlayed ?? 0, display: pctDisplay(m.winRate) }));
  const sides = to?.sideBreakdown;
  const hasSides = !!sides && ((sides.blue?.games ?? 0) > 0 || (sides.red?.games ?? 0) > 0);
  const disclaimer = po?.disclaimer ?? to?.disclaimer ?? null;

  const periodBlock = (
    <>
      <FilterSegment options={BREAKDOWN_PERIODS.map((x) => ({ label: x.label, value: x.key }))} value={period} onChange={setPeriod} />
      {!p || (p.gamesPlayed ?? 0) === 0 ? (
        <div className="py-8 text-center t-body-md text-muted rounded-xl bg-card border border-border-subtle">No completed games in this period yet.</div>
      ) : (
        <>
          <StatRow cells={[{ label: "Record", value: p.record ?? "—" }, { label: "Win %", value: p.winRate ?? "—", marquee: true }, { label: "Games", value: p.gamesPlayed ?? "—" }]} />
          {period === "last10" && p.recentForm ? (
            <div className="flex flex-col gap-2.5 px-3 py-2.5 rounded-xl bg-card border border-border-subtle">
              <span className="t-label-sm text-muted uppercase">FORM · LAST {p.recentForm.length} GAMES</span>
              <div className="flex items-center justify-between"><FormPips form={p.recentForm} /><span className="t-label-sm text-muted">oldest → latest</span></div>
            </div>
          ) : null}
          {avgEntries.length ? (
            <Section title={`AVERAGES · ${periodLabel}`}>
              <StripedTable header={<><span className="flex-1">STAT</span><span className="w-[72px] text-center">AVG</span></>} rows={avgEntries.map((e) => (
                <><span className="flex-1 t-body-sm text-primary">{e.label}</span><span className="w-[72px] text-center t-mono-sm text-violet">{e.value}</span></>
              ))} />
            </Section>
          ) : null}
          <BestGameCard period={p} order={po?.statColumns ?? null} fallbackLabel={periodLabel} />
        </>
      )}
    </>
  );

  const extras: ReactNode[] = [];
  if (hasSides && sides) extras.push(<Section key="sides" title="SIDE PERFORMANCE"><SideTable blue={sides.blue} red={sides.red} /></Section>);
  if (t.targetType === "player") {
    const sh = highLow(true), ch = highLow(false);
    if (sh.length) extras.push(<HighLowTable key="sh" title="SEASON SINGLE-GAME HIGHS & LOWS" rows={sh} />);
    if (ch.length) extras.push(<HighLowTable key="ch" title="CAREER SINGLE-GAME HIGHS & LOWS" rows={ch} />);
    if (bestWorst.length) extras.push(
      <Section key="bw" title="BEST & WORST">
        <div className="ledger">
          {bestWorst.map((r, i) => (
            <div key={r.label} className={clsx("flex items-center gap-2 px-3.5 py-2.5", i > 0 && "border-t border-border-subtle")}>
              <span className="t-body-md text-primary">{r.label}</span><span className="flex-1" />
              <span className="t-mono-sm text-violet min-w-16 text-right">{r.best ?? "—"}</span>
              <span className="t-mono-sm text-primary min-w-16 text-right">{r.worst ?? "—"}</span>
            </div>
          ))}
        </div>
      </Section>,
    );
    if (agentBars.length) extras.push(<BarsTable key="agents" title={t.game === "League" ? "CHAMPIONS · AVG KILLS" : "AGENTS · AVG KILLS"} items={agentBars} />);
  }
  if (mapBars.length) extras.push(<BarsTable key="maps" title={t.targetType === "player" ? "MAPS · AVG KILLS" : "MAPS · WIN RATE"} items={mapBars} />);
  if (to && (to.bestMap || to.worstMap)) extras.push(
    <Section key="edges" title="MAP EDGES">
      <StatRow cells={[
        { label: "Best map", value: to.bestMap ? `${to.bestMap.mapName ?? "—"} · ${to.bestMap.winRate ?? "—"}` : "—", marquee: true },
        { label: "Worst map", value: to.worstMap ? `${to.worstMap.mapName ?? "—"} · ${to.worstMap.winRate ?? "—"}` : "—" },
      ]} />
    </Section>,
  );

  return (
    <div className="flex flex-col gap-5 pt-2">
      <StepHeader title={t.targetName} subtitle={subtitle} center={!compact} />
      <div className={clsx("px-4 grid gap-5", !compact && "lg:grid-cols-2 lg:gap-x-8")}>
        <div className="flex flex-col gap-4">{periodBlock}</div>
        <div className="flex flex-col gap-5">{extras}</div>
      </div>
      {disclaimer ? <div className="px-4"><Disclaimer>{disclaimer}</Disclaimer></div> : null}
    </div>
  );
}

function BestGameCard({ period, order, fallbackLabel }: { period: OverviewPeriod; order: string[] | null; fallbackLabel: string }) {
  const best = period.bestGame;
  if (!best?.stats || Object.keys(best.stats).length === 0) return null;
  const stats = best.stats;
  const keys = (order ?? Object.keys(stats).sort()).filter((k) => stats[k] != null);
  return (
    <Section title={`BEST GAME · ${(period.label ?? fallbackLabel).toUpperCase()}`}>
      <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-card border border-border-subtle">
        <div className="flex items-center gap-1.5">
          {best.opponent ? <span className="t-body-md text-primary">vs {best.opponent}</span> : null}
          {best.mapName ? <span className="t-label-sm text-muted">· {best.mapName}</span> : null}
          <span className="flex-1" />
          {best.date ? <span className="t-label-sm text-muted">{best.date}</span> : null}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-2">
          {keys.map((k) => (
            <span key={k} className="flex flex-col items-center gap-0.5">
              <span className="t-mono-md text-violet">{PredictionFormat.stat(stats[k] as number)}</span>
              <span className="t-label-sm text-muted">{overviewLabel(k)}</span>
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

function HighLowTable({ title, rows }: { title: string; rows: { label: string; high: string; low: string }[] }) {
  return (
    <Section title={title}>
      <StripedTable header={<><span className="flex-1">STAT</span><span className="w-16 text-center">HIGH</span><span className="w-16 text-center">LOW</span></>} rows={rows.map((r) => (
        <><span className="flex-1 t-body-sm text-primary">{r.label}</span><span className="w-16 text-center t-mono-sm text-violet">{r.high}</span><span className="w-16 text-center t-mono-sm text-primary">{r.low}</span></>
      ))} />
    </Section>
  );
}

/** Striped table with a hairline violet bar under each row, scaled to the column max. */
export function BarsTable({ title, items }: { title: string; items: { name: string; value: number; games: number; display: string | null }[] }) {
  const maxVal = Math.max(...items.map((i) => i.value), 0.001);
  return (
    <Section title={title}>
      <div className="ledger">
        <div className="flex items-center gap-1 px-3 py-1.5 t-label-sm text-muted uppercase"><span className="flex-1">NAME</span><span className="w-[52px] text-center">GAMES</span><span className="w-[60px] text-center">VALUE</span></div>
        {items.map((it, i) => (
          <div key={it.name + i} className={clsx("flex flex-col gap-1.5 px-3 py-2", i % 2 === 0 ? "bg-card" : "bg-surface/50")}>
            <div className="flex items-center gap-1">
              <span className="flex-1 t-body-sm text-primary truncate">{it.name}</span>
              <span className="w-[52px] text-center t-mono-sm text-muted">{it.games}</span>
              <span className="w-[60px] text-center t-mono-sm text-violet">{it.display ?? PredictionFormat.compact(it.value)}</span>
            </div>
            <Track ratio={it.value / maxVal} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function SideTable({ blue, red }: { blue: SideStats | null; red: SideStats | null }) {
  const row = (name: string, s: SideStats | null, even: boolean) => {
    const games = s?.games ?? 0, wins = s?.wins ?? 0, losses = s?.losses ?? games - wins;
    return (
      <div className={clsx("flex flex-col gap-1.5 px-3 py-2", even ? "bg-card" : "bg-surface/50")}>
        <div className="flex items-center gap-1">
          <span className="flex-1 t-body-sm text-primary">{name}</span>
          <span className="w-16 text-center t-mono-sm text-muted">{games > 0 ? `${wins}–${losses}` : "—"}</span>
          <span className="w-14 text-center t-mono-sm text-violet">{games > 0 ? s?.winRate ?? "—" : "—"}</span>
        </div>
        <Track ratio={games > 0 ? wins / games : 0} />
      </div>
    );
  };
  return (
    <div className="ledger">
      <div className="flex items-center gap-1 px-3 py-1.5 t-label-sm text-muted uppercase"><span className="flex-1">SIDE</span><span className="w-16 text-center">RECORD</span><span className="w-14 text-center">WIN %</span></div>
      {row("Blue side", blue, true)}
      {row("Red side", red, false)}
    </div>
  );
}
