// predictions/HeadToHead.tsx — PredictionTeamViews.swift, head-to-head half:
//   setup  — pick the opponent (+ optional map) → Get Odds
//   result — POST /predictions/head-to-head { game, team1Id, team2Id, map? }
// The result never shows a bare percentage: the split bar, the strength
// table, the actual H2H record ("FACTORED IN"), map records, side win rates.
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CircleCheck, Circle, Sparkles } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { gameLabel, normalizeTeams } from "@/lib/types";
import { useFetch } from "@/lib/use-fetch";
import { FilterChip, LoadFailure, SearchField, SkeletonLedger, TeamMark } from "@/components/ui";
import { PredictScreen } from "./PredictScreen";
import { flowHref, readTarget } from "./flow";
import { Disclaimer, FlowError, LoadingLine, Section, StripedTable, WarningCard } from "./shared";
import { gameMaps, normalizeHeadToHead, type HeadToHeadResponse, type PredictionTargetItem, type SideStats } from "./types";

// MARK: - Step 1 — pick the opponent (+ optional map)
export function HeadToHeadSetupScreen() {
  const sp = useSearchParams();
  const t = readTarget(sp);
  const [query, setQuery] = useState("");
  const [opponent, setOpponent] = useState<PredictionTargetItem | null>(() => {
    const id = sp.get("opponent"), name = sp.get("opponentName");
    return id && name ? { id, name, subtitle: null } : null;
  });
  const [map, setMap] = useState<string | null>(sp.get("map"));
  const maps = gameMaps(t.game);

  const teams = useFetch<PredictionTargetItem[]>(async (signal) => normalizeTeams(await api.get(endpoints.teams(t.game), { signal }))
    .filter((x) => x.id !== t.targetId)
    .map((x) => ({ id: x.id, name: x.name, subtitle: x.region || null, imageURL: x.logoURL })), [t.game, t.targetId]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const all = teams.data ?? [];
    return (term ? all.filter((x) => x.name.toLowerCase().includes(term)) : all).slice(0, 50);
  }, [teams.data, query]);

  return (
    <PredictScreen title="Head-to-Head" back={flowHref.options(t)}>
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex items-center gap-3 px-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="t-headline-md text-primary">Head-to-Head</h1>
            <span className="t-label-md text-violet truncate">{opponent ? `${t.targetName} vs ${opponent.name}` : `${t.targetName} vs …`}</span>
          </div>
          <span className="flex-1" />
          {opponent ? (
            <Link href={flowHref.h2hResult(t, opponent.id, opponent.name, map)} className="btn-pill !py-2 !px-4 t-label-md">Get Odds<Sparkles size={12} /></Link>
          ) : (
            <span className="btn-pill !py-2 !px-4 t-label-md !bg-surface !text-muted cursor-not-allowed" aria-disabled>Get Odds<Sparkles size={12} /></span>
          )}
        </div>

        {maps.length ? (
          <div className="flex flex-col gap-2 px-4">
            <span className="t-label-sm text-muted">MAP (OPTIONAL)</span>
            <div className="flex items-end gap-[22px] overflow-x-auto no-scrollbar">
              <FilterChip label="Any map" selected={map === null} onClick={() => setMap(null)} />
              {maps.map((m) => <FilterChip key={m} label={m} selected={map === m} onClick={() => setMap(m)} />)}
            </div>
          </div>
        ) : null}

        <span className="t-label-sm text-muted px-4">OPPONENT</span>
        <div className="px-4"><SearchField value={query} onChange={setQuery} placeholder="Search teams" /></div>

        <div className="px-4">
          {teams.loading ? <SkeletonLedger rows={8} avatar={44} />
            : teams.error ? <LoadFailure error={teams.error} connectionProblem={teams.connectionProblem} onRetry={teams.reload} />
            : results.length === 0 ? <div className="py-6 text-center t-body-md text-muted">No teams found</div>
            : (
              <div className="ledger" role="radiogroup" aria-label="Opponent">
                {results.map((item, i) => {
                  const selected = opponent?.id === item.id;
                  return (
                    <button key={item.id} type="button" role="radio" aria-checked={selected} onClick={() => setOpponent(item)} className={clsx("flex items-center gap-3.5 w-full px-4 py-3 text-left hover:bg-surface/60 transition-colors", i > 0 && "border-t border-border-subtle")}>
                      <TeamMark name={item.name} logoURL={item.imageURL} color={selected ? "var(--violet)" : "var(--text-muted)"} size={44} />
                      <span className="flex flex-col gap-0.5 min-w-0">
                        <span className="t-body-md text-primary">{item.name}</span>
                        {item.subtitle ? <span className="t-label-sm text-muted">{item.subtitle}</span> : null}
                      </span>
                      <span className="flex-1" />
                      {selected ? <CircleCheck size={20} className="text-violet" /> : <Circle size={20} className="text-muted" />}
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      </div>
    </PredictScreen>
  );
}

// MARK: - Step 2 — the result, with its reasoning
export function HeadToHeadResultScreen() {
  const sp = useSearchParams();
  const t = readTarget(sp);
  const team2Id = sp.get("opponent") ?? "";
  const team2Name = sp.get("opponentName") ?? "";
  const map = sp.get("map");

  const { data: r, loading, error, connectionProblem, reload } = useFetch<HeadToHeadResponse>(async (signal) => {
    if (!team2Id) throw new Error("No opponent selected.");
    const body: Record<string, unknown> = { game: t.game, team1Id: t.targetId, team2Id };
    if (map) body.map = map;
    return normalizeHeadToHead(await api.post(endpoints.headToHead, body, { signal }));
  }, [t.game, t.targetId, team2Id, map]);

  return (
    <PredictScreen title="Win Odds" back={flowHref.h2h(t, team2Id, team2Name, map)} wide>
      <div className="px-4 pt-2 max-w-3xl mx-auto w-full">
        {loading ? <LoadingLine text="Weighing both sides…" />
          : error || !r ? (connectionProblem ? <LoadFailure error={error ?? ""} connectionProblem onRetry={reload} /> : <FlowError title={error ?? "Something went wrong."} />)
          : <H2HResult r={r} game={t.game} team1Name={t.targetName} team2Name={team2Name} />}
      </div>
    </PredictScreen>
  );
}

const hex = (c: string | null) => (c ? "#" + c.replace("#", "") : null);

function H2HResult({ r, game, team1Name, team2Name }: { r: HeadToHeadResponse; game: string; team1Name: string; team2Name: string }) {
  const n1 = r.team1?.name ?? team1Name, n2 = r.team2?.name ?? team2Name;
  const p1 = r.team1?.winProbability ?? 50;
  const p2 = r.team2?.winProbability ?? 100 - p1;
  const c1 = hex(r.team1?.color ?? null), c2 = hex(r.team2?.color ?? null);
  const s1 = r.team1?.strength, s2 = r.team2?.strength;
  const sides1 = r.team1?.sides, sides2 = r.team2?.sides;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-1 text-center pt-1">
        <h1 className="t-headline-md text-primary">{n1} vs {n2}</h1>
        <span className="t-label-md text-violet">{r.map ? `${gameLabel(game)} · ${r.map}` : gameLabel(game)}</span>
      </div>

      {/* The signature visual: one bar split by win probability. */}
      <div className="flex flex-col gap-2.5 p-4 rounded-[14px] bg-card border border-border-subtle">
        <div className="flex justify-between">
          <span className="flex flex-col gap-0.5"><span className="t-label-md text-primary">{n1}</span><span className="t-headline-lg" style={{ color: c1 ?? "var(--violet)" }}>{p1}%</span></span>
          <span className="flex flex-col items-end gap-0.5"><span className="t-label-md text-primary">{n2}</span><span className="t-headline-lg" style={{ color: c2 ?? "var(--text-secondary)" }}>{p2}%</span></span>
        </div>
        <div className="flex h-2.5 rounded-[5px] overflow-hidden">
          <span style={{ width: `${p1}%`, background: c1 ?? "var(--violet)" }} />
          <span className="flex-1" style={{ background: c2 ?? "var(--surface)", opacity: c2 ? 0.85 : 1 }} />
        </div>
      </div>

      {r.summary ? <div className="p-3.5 rounded-xl bg-card border border-border-subtle t-body-md text-secondary">{r.summary}</div> : null}

      <div className="grid gap-5 md:grid-cols-2">
        {s1 && s2 ? (
          <Section title="WHY THESE ODDS" className="md:col-span-2">
            <StripedTable
              header={<><span className="flex-1">STAT</span><span className="w-[84px] text-center truncate" style={{ color: c1 ?? undefined }}>{n1.slice(0, 10)}</span><span className="w-[84px] text-center truncate" style={{ color: c2 ?? undefined }}>{n2.slice(0, 10)}</span></>}
              rows={[
                ["Strength score", s1.score != null ? String(Math.trunc(s1.score)) : "—", s2.score != null ? String(Math.trunc(s2.score)) : "—", (s1.score ?? 0) >= (s2.score ?? 0)],
                ["Overall win rate", s1.overallWinRate != null ? `${s1.overallWinRate}%` : "—", s2.overallWinRate != null ? `${s2.overallWinRate}%` : "—", (s1.overallWinRate ?? 0) >= (s2.overallWinRate ?? 0)],
                ["Last-10 win rate", s1.recentWinRate != null ? `${s1.recentWinRate}%` : "—", s2.recentWinRate != null ? `${s2.recentWinRate}%` : "—", (s1.recentWinRate ?? 0) >= (s2.recentWinRate ?? 0)],
                ["Avg +/−", s1.avgPlusMinus != null ? signed(s1.avgPlusMinus) : "—", s2.avgPlusMinus != null ? signed(s2.avgPlusMinus) : "—", (s1.avgPlusMinus ?? 0) >= (s2.avgPlusMinus ?? 0)],
                ["W/R vs strong teams", s1.opponentQuality != null ? `${s1.opponentQuality}%` : "—", s2.opponentQuality != null ? `${s2.opponentQuality}%` : "—", (s1.opponentQuality ?? 0) >= (s2.opponentQuality ?? 0)],
              ].map(([label, v1, v2, lead]) => (
                <><span className="flex-1 t-body-sm text-primary">{label}</span><span className={clsx("w-[84px] text-center t-mono-sm", lead ? "text-violet" : "text-primary")}>{v1}</span><span className={clsx("w-[84px] text-center t-mono-sm", lead ? "text-primary" : "text-violet")}>{v2}</span></>
              ))}
            />
          </Section>
        ) : null}

        {r.headToHead ? (
          <Section title="HEAD-TO-HEAD RECORD" trailing={<Factored used={r.headToHead.usedInPrediction} />}>
            {(r.headToHead.meetings ?? 0) === 0 ? (
              <span className="t-body-md text-secondary">These teams haven&apos;t met yet — odds are based on overall strength.</span>
            ) : (
              <div className="ledger">
                <div className="flex gap-1.5 px-3 py-1.5 t-label-sm uppercase">
                  <span className="flex-1 text-center truncate" style={{ color: c1 ?? "var(--text-muted)" }}>{n1.slice(0, 10)}</span>
                  <span className="flex-1 text-center text-muted">MEETINGS</span>
                  <span className="flex-1 text-center truncate" style={{ color: c2 ?? "var(--text-muted)" }}>{n2.slice(0, 10)}</span>
                </div>
                <div className="flex gap-1.5 px-3 py-3 bg-card">
                  <span className={clsx("flex-1 text-center t-mono-md", (r.headToHead.team1Wins ?? 0) >= (r.headToHead.team2Wins ?? 0) ? "text-violet" : "text-primary")}>{r.headToHead.team1Wins ?? 0}</span>
                  <span className="flex-1 text-center t-mono-md text-primary">{r.headToHead.meetings ?? 0}</span>
                  <span className={clsx("flex-1 text-center t-mono-md", (r.headToHead.team2Wins ?? 0) > (r.headToHead.team1Wins ?? 0) ? "text-violet" : "text-primary")}>{r.headToHead.team2Wins ?? 0}</span>
                </div>
              </div>
            )}
          </Section>
        ) : null}

        {r.mapBreakdown ? (
          <Section title={`RECORDS ON ${(r.mapBreakdown.map ?? "MAP").toUpperCase()}`} trailing={<Factored used={r.mapBreakdown.usedInPrediction} />}>
            <div className="ledger">
              <div className="flex gap-1.5 px-3 py-1.5 t-label-sm uppercase">
                <span className="flex-1 text-center truncate" style={{ color: c1 ?? "var(--text-muted)" }}>{n1.slice(0, 12)}</span>
                <span className="flex-1 text-center truncate" style={{ color: c2 ?? "var(--text-muted)" }}>{n2.slice(0, 12)}</span>
              </div>
              <div className="flex gap-1.5 px-3 py-3 bg-card">
                <span className="flex-1 text-center t-mono-md text-primary">{r.mapBreakdown.team1Record ?? "—"}</span>
                <span className="flex-1 text-center t-mono-md text-primary">{r.mapBreakdown.team2Record ?? "—"}</span>
              </div>
            </div>
          </Section>
        ) : null}

        {sides1 || sides2 ? (
          <Section title="SIDE WIN RATES" className="md:col-span-2">
            <StripedTable header={<><span className="flex-1">TEAM</span><span className="w-[92px] text-center">BLUE SIDE</span><span className="w-[92px] text-center">RED SIDE</span></>} rows={[
              <><span className="flex-1 t-body-sm truncate" style={{ color: c1 ?? "var(--text-primary)" }}>{n1}</span><span className="w-[92px] text-center t-mono-sm text-primary">{sideCell(sides1?.blue)}</span><span className="w-[92px] text-center t-mono-sm text-primary">{sideCell(sides1?.red)}</span></>,
              <><span className="flex-1 t-body-sm truncate" style={{ color: c2 ?? "var(--text-primary)" }}>{n2}</span><span className="w-[92px] text-center t-mono-sm text-primary">{sideCell(sides2?.blue)}</span><span className="w-[92px] text-center t-mono-sm text-primary">{sideCell(sides2?.red)}</span></>,
            ]} />
          </Section>
        ) : null}
      </div>

      {r.accuracyWarning ? <WarningCard>{r.accuracyWarning}</WarningCard> : null}
      {r.disclaimer ? <Disclaimer>{r.disclaimer}</Disclaimer> : null}
    </div>
  );
}

const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
function sideCell(s: SideStats | null | undefined): string {
  if (!s || !s.games || s.games <= 0) return "—";
  return `${s.winRate ?? "—"} (${s.wins ?? 0}-${s.losses ?? 0})`;
}
function Factored({ used }: { used: boolean }) {
  return <span className={clsx("text-[10px] font-semibold tracking-[0.12em]", used ? "text-violet" : "text-muted")}>{used ? "FACTORED IN" : "NOT FACTORED"}</span>;
}
