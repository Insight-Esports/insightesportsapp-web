// predictions/Result.tsx — PredictionResultView: renders the /analyze (or
// /live-player · /live-stat) response: probability dial (when a line was
// given), verdict, trend, recent-games chart, career vs recent, standout
// splits. The Last 10 / 15 / 25 switcher lives here and re-runs the analysis.
// On wide screens the full breakdown sits beside the result.
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Hourglass, UserX } from "lucide-react";
import { api, ApiError, endpoints, errorMessage } from "@/lib/api";
import { clsx } from "@/lib/format";
import { gameLabel } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { FilterSegment } from "@/components/ui";
import { PredictScreen } from "./PredictScreen";
import { flowHref, qs, readDirection, readNumber, readTarget, targetParams, PREDICT_BASE } from "./flow";
import { BreakdownPanel } from "./Breakdown";
import { GamesBars, GamesCard, GamesLegend, ProbabilityDial } from "./charts";
import { AccentRead, Caps, Disclaimer, FlowError, LoadingLine, NoteCard, Section, StatRow, StepHeader, WarningCard, type Cell } from "./shared";
import { normalizePrediction, PredictionFormat, PredictionStatCatalog, projectionLabel, type OutlierItem, type PredictionGame, type PredictionResponse } from "./types";

const WINDOW_OPTIONS = [10, 15, 25]; // must match backend VALID_WINDOWS

export function ResultScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const t = readTarget(sp);
  const stat = sp.get("stat");
  const baseline = readNumber(sp, "baseline");
  const direction = readDirection(sp);
  const liveCurrentValueHint = readNumber(sp, "current");
  const contextMap = sp.get("map"), contextAgent = sp.get("agent"), contextOpponent = sp.get("opponent"), contextSide = sp.get("side");
  const windowParam = readNumber(sp, "window");
  const win = windowParam && WINDOW_OPTIONS.includes(windowParam) ? windowParam : 10;

  const { isPremium, hasReachedPredictionLimit, recordPredictionUsed } = useAppState();
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setWindow = (w: number) => {
    const all: Record<string, string> = {};
    sp.forEach((v, k) => { all[k] = v; });
    router.replace(`${PREDICT_BASE}/result${qs({ ...all, window: w })}`);
  };

  // Runs on first appearance AND whenever the window (or any input) changes.
  useEffect(() => {
    if (!stat) { setError("No stat selected."); setLoading(false); return; }
    const ctrl = new AbortController();
    let active = true;
    setLoading(true); setError(null);
    (async () => {
      try {
        let raw: unknown;
        if (t.isLive) {
          // Live predictor requires the match the player is currently in.
          if (!t.matchId) { setError("This player's live match couldn't be identified. Reopen them from the Live list."); setLoading(false); return; }
          const body: Record<string, unknown> = { matchId: t.matchId, playerId: t.targetId, stat };
          if (baseline != null) {
            body.baseline = baseline; body.direction = direction;
            raw = await api.post(endpoints.livePlayerPrediction, body, { signal: ctrl.signal });
          } else {
            raw = await api.post(endpoints.liveStatPrediction, body, { signal: ctrl.signal });
          }
        } else {
          const body: Record<string, unknown> = { game: t.game, targetType: t.targetType, targetId: t.targetId, stat, window: win };
          if (baseline != null) { body.baseline = baseline; body.direction = direction; }
          if (contextMap) body.map = contextMap;
          if (contextAgent) body.agent = contextAgent;
          if (contextOpponent) body.opponent_team = contextOpponent;
          if (contextSide) body.side = contextSide;
          raw = await api.post(endpoints.analyzePrediction, body, { signal: ctrl.signal });
        }
        if (!active) return;
        setResult(normalizePrediction(raw));
        if (!isPremium) recordPredictionUsed();
      } catch (e) {
        if (!active || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof ApiError ? e.message : errorMessage(e, "Something went wrong. Please try again."));
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.game, t.targetType, t.targetId, t.isLive, t.matchId, stat, baseline, direction, win, contextMap, contextAgent, contextOpponent, contextSide]);

  const subtitle = `${gameLabel(t.game)} · ${stat ? PredictionStatCatalog.label(stat) : "Overview"}`;
  const limitReached = !isPremium && hasReachedPredictionLimit && !result;

  const main = (
    <div className="flex flex-col gap-5">
      <StepHeader title={t.targetName} subtitle={subtitle} center />
      {!t.isLive ? (
        <div className="px-4 flex justify-center">
          <FilterSegment options={WINDOW_OPTIONS.map((w) => ({ label: `Last ${w}`, value: w }))} value={win} onChange={(w) => { if (!loading) setWindow(w); }} />
        </div>
      ) : null}
      <div className="px-4 flex flex-col gap-5">
        {limitReached ? (
          <FlowError title="You've used today's free predictions." detail="Insight Pro removes the daily limit." icon={<Hourglass />} />
        ) : loading ? (
          <LoadingLine text="Crunching the numbers…" />
        ) : error ? (
          <ResultError message={error} targetName={t.targetName} isLive={t.isLive} />
        ) : result ? (
          t.isLive ? <LiveResult r={result} hint={liveCurrentValueHint} game={t.game} targetName={t.targetName} /> : <HistoricalResult r={result} game={t.game} targetName={t.targetName} />
        ) : null}
        {limitReached ? <Link href="/premium/upgrade" className="btn-pill self-center">Upgrade to Pro</Link> : null}
      </div>
    </div>
  );

  // Wide screens: the result beside the target's full breakdown.
  return (
    <PredictScreen title="Prediction" back={`${PREDICT_BASE}/stat${qs({ ...targetParams(t), stat, baseline, direction: baseline != null ? direction : null })}`} wide>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)] pt-2">
        <div className="min-w-0">{main}</div>
        {!t.isLive ? (
          <aside className="hidden xl:block min-w-0 border-l border-border-subtle">
            <div className="px-0">
              <Caps className="px-4 pt-3">Full breakdown</Caps>
              <BreakdownPanel target={t} compact />
              <div className="px-4 pt-3"><Link href={flowHref.breakdown(t)} className="t-label-md text-violet hover:underline">Open full breakdown</Link></div>
            </div>
          </aside>
        ) : null}
      </div>
    </PredictScreen>
  );
}

// Interprets known backend errors into helpful states instead of raw messages.
function ResultError({ message, targetName, isLive }: { message: string; targetName: string; isLive: boolean }) {
  const lower = message.toLowerCase();
  const isDataThin = lower.includes("not enough games") || (lower.includes("no") && lower.includes("data found"));
  const isSession = lower.includes("log in");
  if (isDataThin) {
    return <FlowError icon={<Hourglass />} title="Not enough match history yet" detail={isLive
      ? `${targetName} is live right now, but predictions are built from completed matches — and they don't have at least 3 tracked games on record yet. Their history grows as matches finish.`
      : `${targetName} doesn't have at least 3 completed games on record for this stat yet. Predictions unlock once their tracked history builds up.`} />;
  }
  if (isSession) return <FlowError icon={<UserX />} title="Session expired" detail="Your login session is no longer valid. Log out and back in from the Profile tab, then run this prediction again." />;
  return <FlowError title={message} />;
}

// ── Historical result ─────────────────────────────────────────────────────
function HistoricalResult({ r, game, targetName }: { r: PredictionResponse; game: string; targetName: string }) {
  return (
    <>
      <PredictionBlock r={r} isLive={false} hint={null} />
      <StatComparison r={r} />
      {r.last10Games?.length ? <RecentGames games={r.last10Games} baseline={r.baseline} direction={r.direction} /> : null}
      {r.winRate ? (
        <Section title="WIN RATE">
          <StatRow cells={[{ label: "Last 10", value: r.winRate.last10WinRate ?? "—" }, { label: "Recent", value: r.winRate.recentWinRate ?? "—" }, { label: "Overall", value: r.winRate.overallWinRate ?? "—" }]} />
          {r.winRate.last10Summary ? <span className="t-label-sm text-secondary">{r.winRate.last10Summary}</span> : null}
        </Section>
      ) : null}
      {r.teamStrength ? (
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-card border border-border-subtle">
          <Caps>TEAM STRENGTH</Caps>
          <div className="flex items-baseline gap-1.5">
            <span className="t-headline-lg text-violet">{r.teamStrength.score != null ? Math.trunc(r.teamStrength.score) : "—"}</span>
            <span className="t-body-md text-muted">/ 100</span>
            <span className="flex-1" />
            {r.teamStrength.avgPlusMinus != null ? (
              <span className={clsx("t-body-md", r.teamStrength.avgPlusMinus >= 0 ? "text-success" : "text-error")}>{r.teamStrength.avgPlusMinus >= 0 ? "+" : ""}{r.teamStrength.avgPlusMinus.toFixed(1)} +/−</span>
            ) : null}
          </div>
        </div>
      ) : null}
      <Extras r={r} game={game} targetName={targetName} />
    </>
  );
}

// Live result order (per product spec): dial · read · last 10 · last 5 vs
// this opponent · career average · anything else the backend calculated.
function LiveResult({ r, hint, game, targetName }: { r: PredictionResponse; hint: number | null; game: string; targetName: string }) {
  const current = r.liveCurrentValue ?? hint;
  const label = r.stat ? PredictionStatCatalog.label(r.stat) : "this stat";
  return (
    <>
      <PredictionBlock r={r} isLive hint={hint} />
      {r.baseline == null && current != null ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border-subtle">
          <span className="size-[7px] rounded-full bg-live" />
          <span className="t-body-md text-secondary">Current {label.toLowerCase()} this game</span>
          <span className="flex-1" />
          <span className="t-headline-sm text-primary">{PredictionFormat.stat(current)}</span>
        </div>
      ) : null}
      {r.last10Games?.length ? <GamesCard title={`LAST ${r.last10Games.length} GAMES`} games={r.last10Games} baseline={r.baseline} direction={r.direction} average={r.last10Average} /> : null}
      {r.vsOpponentGames?.length ? (
        <GamesCard title={`LAST ${r.vsOpponentGames.length} VS ${(r.opponentName ?? "OPPONENT").toUpperCase()}`} games={r.vsOpponentGames} baseline={r.baseline} direction={r.direction} average={r.vsOpponentAverage} />
      ) : r.vsOpponentSummary ? (
        <NoteCard icon={<UserX />}>{r.vsOpponentSummary}</NoteCard>
      ) : r.opponentName ? (
        <NoteCard icon={<UserX />}>No prior meetings with {r.opponentName} on record</NoteCard>
      ) : null}
      {r.careerAverage != null ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border-subtle">
          <span className="flex flex-col gap-0.5"><Caps>CAREER AVERAGE</Caps><span className="t-label-md text-secondary">{r.stat ? PredictionStatCatalog.label(r.stat) : "This stat"}</span></span>
          <span className="flex-1" />
          <span className="t-headline-md text-violet">{PredictionFormat.stat(r.careerAverage)}</span>
        </div>
      ) : null}
      <Extras r={r} game={game} targetName={targetName} />
    </>
  );
}

function PredictionBlock({ r, isLive, hint }: { r: PredictionResponse; isLive: boolean; hint: number | null }) {
  const current = r.liveCurrentValue ?? hint;
  return (
    <>
      {r.confidence != null && r.prediction && r.baseline != null ? (
        <div className="flex flex-col items-center gap-2">
          <ProbabilityDial confidence={r.confidence} exact={r.probabilityExact} prediction={r.prediction} probabilityText={r.probabilityDisplay ?? r.probabilityText} />
          <div className="flex items-center gap-2">
            <span className="t-body-md text-secondary">{PredictionFormat.line(r.direction, r.baseline, r.stat)}</span>
            {isLive && current != null ? (
              <>
                <span className="t-body-md text-muted">·</span>
                <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-live" /><span className="t-body-md text-primary">{PredictionFormat.stat(current)} so far</span></span>
              </>
            ) : null}
          </div>
          {r.trend ? <TrendBadge trend={r.trend} direction={r.direction} /> : null}
        </div>
      ) : null}
      {r.lowHistory && r.historyWarning ? <AccentRead kicker="LIVE-PACE READ">{r.historyWarning}</AccentRead> : null}
      {r.summary ? <AccentRead kicker="THE READ">{r.summary}</AccentRead> : null}
    </>
  );
}

function TrendBadge({ trend, direction }: { trend: string; direction: string | null }) {
  const isUnder = direction === "under";
  const color = trend === "UP" ? (isUnder ? "text-error" : "text-success") : trend === "DOWN" ? (isUnder ? "text-success" : "text-error") : "text-secondary";
  const Icon = trend === "UP" ? ArrowUpRight : trend === "DOWN" ? ArrowDownRight : ArrowRight;
  const word = trend.charAt(0).toUpperCase() + trend.slice(1).toLowerCase();
  return <span className={clsx("flex items-center gap-1.5 t-label-md", color)}><Icon size={12} strokeWidth={3} />Form {word}</span>;
}

function StatComparison({ r }: { r: PredictionResponse }) {
  const cells: Cell[] = [{ label: "Career Avg", value: r.careerAverage != null ? PredictionFormat.stat(r.careerAverage) : "—" }];
  if (r.last10Average != null) cells.push({ label: "Recent Avg", value: PredictionFormat.stat(r.last10Average), marquee: true });
  if (r.projection?.value != null) cells.push({ label: projectionLabel(r.projection), value: PredictionFormat.stat(r.projection.value), marquee: true });
  if (r.totalGamesAnalyzed != null) cells.push({ label: "Games", value: String(r.totalGamesAnalyzed) });
  return <StatRow cells={cells} />;
}

function RecentGames({ games, baseline, direction }: { games: PredictionGame[]; baseline: number | null; direction: string | null }) {
  return (
    <Section title={`LAST ${games.length} GAMES`}>
      <div className="p-3.5 rounded-xl bg-card border border-border-subtle"><GamesBars games={games} baseline={baseline} direction={direction} /></div>
      <div className="flex justify-between px-1 t-label-sm text-muted"><span>Oldest</span><span>Latest</span></div>
      <GamesLegend baseline={baseline} direction={direction} />
    </Section>
  );
}

function Extras({ r, game, targetName }: { r: PredictionResponse; game: string; targetName: string }) {
  const maps = [...(r.outliers?.maps?.positiveOutliers ?? []), ...(r.outliers?.maps?.negativeOutliers ?? [])];
  const agents = [...(r.outliers?.agents?.positiveOutliers ?? []), ...(r.outliers?.agents?.negativeOutliers ?? [])];
  const statLabel = r.stat ? PredictionStatCatalog.label(r.stat) : "this stat";
  return (
    <>
      {maps.length || agents.length ? (
        <div className="flex flex-col gap-2.5">
          <Caps>STANDOUT SPLITS</Caps>
          <span className="t-label-sm text-secondary">Where {targetName}&apos;s {statLabel} runs hot or cold compared to their career average.</span>
          {maps.length ? <OutlierGroup title="MAPS" items={maps} statLabel={statLabel} /> : null}
          {agents.length ? <OutlierGroup title={game === "League" ? "CHAMPIONS" : "AGENTS"} items={agents} statLabel={statLabel} /> : null}
        </div>
      ) : null}
      {r.accuracyWarning ? <WarningCard>{r.accuracyWarning}</WarningCard> : null}
      {r.disclaimer ? <Disclaimer>{r.disclaimer}</Disclaimer> : null}
    </>
  );
}

function OutlierGroup({ title, items, statLabel }: { title: string; items: OutlierItem[]; statLabel: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Caps tone="violet">{title}</Caps>
      <div className="ledger">
        {items.map((it, i) => (
          <div key={(it.name ?? "") + i} className={clsx("flex items-center gap-2.5 px-3.5 py-2.5", i > 0 && "border-t border-border-subtle")}>
            <span className="flex flex-col gap-0.5"><span className="t-body-md text-primary">{it.name ?? "—"}</span>{it.gamesPlayed != null ? <span className="t-label-sm text-muted">{it.gamesPlayed} games</span> : null}</span>
            <span className="flex-1" />
            <span className="flex flex-col items-end gap-0.5">
              {it.avgStat != null ? <span className="t-label-md text-primary">{PredictionFormat.compact(it.avgStat)} {statLabel}</span> : null}
              {it.percentAbove != null ? <span className="t-label-sm text-success">+{it.percentAbove}% vs career</span> : it.percentBelow != null ? <span className="t-label-sm text-error">−{it.percentBelow}% vs career</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
