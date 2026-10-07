// predictions/StatPicker.tsx — PredictionStatPickerView: pick a stat
// (game/target-aware, matching the backend whitelist), optionally a line +
// over/under, and (pre-match players) the optional context filters. The
// Last 10/15/25 window is chosen on the result screen, not here.
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Target } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { gameLabel, normalizeTeams } from "@/lib/types";
import { Field, FilterChip, FilterSegment, SearchablePickerSheet } from "@/components/ui";
import { PredictScreen } from "./PredictScreen";
import { flowHref, readTarget } from "./flow";
import { BlockButton, StepHeader } from "./shared";
import { CUMULATIVE_STATS, filterAgents, filterMaps, liveStatValue, normalizePredictionFilters, normalizeStatRows, PredictionFormat, PredictionStatCatalog, directionLabel, type PredictionDirection } from "./types";

type SheetKind = "opponent" | "map" | "agent" | "champion" | null;

export function StatPickerScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const t = readTarget(sp);
  const { game, targetType, targetId, targetName, isLive, matchId } = t;

  const stats = targetType === "team" ? PredictionStatCatalog.teamStats(game) : PredictionStatCatalog.playerStats(game);

  const [selectedStat, setSelectedStat] = useState<string | null>(sp.get("stat"));
  const [baselineText, setBaselineText] = useState(sp.get("baseline") ?? "");
  const [direction, setDirection] = useState<PredictionDirection>(sp.get("direction") === "under" ? "under" : "over");
  const [liveCurrentValue, setLiveCurrentValue] = useState<number | null>(null);

  // Optional pre-match context — sharpens the read, fully skippable.
  const [contextMap, setContextMap] = useState<string | null>(null);
  const [contextAgent, setContextAgent] = useState<string | null>(null);
  const [contextOpponent, setContextOpponent] = useState<string | null>(null);
  const [contextSide, setContextSide] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);

  const [opponentOptions, setOpponentOptions] = useState<string[]>([]);
  const [fetchedMaps, setFetchedMaps] = useState<string[] | null>(null);
  const [fetchedAgents, setFetchedAgents] = useState<string[] | null>(null);
  const mapOptions = fetchedMaps ?? filterMaps(game);
  const agentOptions = fetchedAgents ?? filterAgents(game);

  // The backend's played-only filters (most-played first); static catalogs
  // remain the fallback, and the full team list if opponents came back empty.
  useEffect(() => {
    if (targetType !== "player" || isLive) return;
    let active = true;
    (async () => {
      let opponents: string[] = [];
      try {
        const f = normalizePredictionFilters(await api.get(endpoints.predictionFilters(targetId, game)));
        if (!active) return;
        if (f.maps.length) setFetchedMaps(f.maps);
        if (f.agents.length) setFetchedAgents(f.agents);
        opponents = f.opponents;
      } catch { /* static fallback */ }
      if (opponents.length === 0) {
        try {
          const teams = normalizeTeams(await api.get(endpoints.teams(game, null, 50, 0)));
          opponents = teams.map((x) => x.name).sort();
        } catch { /* leave empty */ }
      }
      if (active) setOpponentOptions(opponents);
    })();
    return () => { active = false; };
  }, [game, targetType, targetId, isLive]);

  // Live only: the player's CURRENT value of the selected cumulative stat,
  // so an already-settled line is rejected.
  useEffect(() => {
    setLiveCurrentValue(null);
    if (!isLive || !matchId || !selectedStat || !CUMULATIVE_STATS.has(selectedStat)) return;
    let active = true;
    (async () => {
      try {
        const rows = normalizeStatRows(await api.get(endpoints.matchStats(matchId)));
        const row = rows.find((r) => r.playerId === targetId);
        if (active && row) setLiveCurrentValue(liveStatValue(selectedStat, row));
      } catch { /* no gate */ }
    })();
    return () => { active = false; };
  }, [isLive, matchId, selectedStat, targetId]);

  const trimmed = baselineText.trim();
  const baselineValue = trimmed === "" ? null : Number(trimmed);
  const isCumulative = CUMULATIVE_STATS.has(selectedStat ?? "");
  const alreadyReached = (line: number) => {
    if (!isLive || liveCurrentValue == null || !isCumulative) return false;
    return direction === "over" ? liveCurrentValue > line : liveCurrentValue >= line;
  };
  const baselineValid = (() => {
    if (trimmed === "") return true;
    if (baselineValue == null || !Number.isFinite(baselineValue)) return false;
    if (selectedStat === "plus_minus") return true;
    if (baselineValue <= 0) return false;
    if (alreadyReached(baselineValue)) return false;
    return true;
  })();
  const alreadyReachedMessage = baselineValue != null && Number.isFinite(baselineValue) && liveCurrentValue != null && alreadyReached(baselineValue)
    ? `${targetName} already has ${PredictionFormat.stat(liveCurrentValue)} ${selectedStat ? PredictionStatCatalog.label(selectedStat) : "this stat"} this game. Enter a higher number.`
    : null;

  const helperText = (() => {
    if (!selectedStat) return "Leave empty for a full stat breakdown, or set a line to get hit probability.";
    const label = PredictionStatCatalog.label(selectedStat);
    if (baselineValue != null && Number.isFinite(baselineValue) && baselineValid) {
      if (isLive) return `You'll get the live probability of ${targetName} landing ${directionLabel(direction).toLowerCase()} ${PredictionFormat.stat(baselineValue)} ${label} this game.`;
      return `You'll get the probability of landing ${directionLabel(direction).toLowerCase()} ${PredictionFormat.stat(baselineValue)} ${label}. You can switch between the last 10, 15, and 25 games on the result.`;
    }
    return `Leave empty for a breakdown of ${label}, or enter a line to get hit probability.`;
  })();

  const activeFilterCount = [contextOpponent, contextMap, contextAgent, contextSide].filter(Boolean).length;
  const canRun = !!selectedStat && baselineValid;
  const resultHref = canRun
    ? flowHref.result(t, {
        stat: selectedStat, baseline: baselineValue != null && Number.isFinite(baselineValue) ? baselineValue : null,
        direction: baselineValue != null ? direction : null, current: liveCurrentValue,
        map: contextMap, agent: contextAgent, opponent: contextOpponent, side: contextSide,
      })
    : null;

  return (
    <PredictScreen title="Stat" back={flowHref.options(t)}>
      <div className="flex flex-col gap-6 pt-1 max-w-3xl">
        <StepHeader title="Pick a stat" subtitle={<span className="text-violet">{targetName} · {gameLabel(game)}</span>} />

        {/* Stat choices: the app's underline selection, wrapped. */}
        <div className="flex flex-wrap items-end gap-x-[22px] gap-y-3 px-4">
          {stats.map((s) => <FilterChip key={s} label={PredictionStatCatalog.label(s)} selected={selectedStat === s} onClick={() => setSelectedStat(s)} />)}
        </div>

        <div className="flex flex-col gap-2 px-4">
          <span className="t-label-sm text-muted">LINE (OPTIONAL)</span>
          <form onSubmit={(e) => { e.preventDefault(); if (resultHref) router.push(resultHref); }} className="flex flex-col gap-2.5">
            <Field
              icon={<Target />}
              value={baselineText}
              onChange={(e) => setBaselineText(e.target.value)}
              placeholder={selectedStat ? "e.g. 20" : "Pick a stat first"}
              disabled={!selectedStat}
              inputMode={selectedStat === "plus_minus" ? "text" : "decimal"}
              aria-label="Line"
            />
            {baselineValue != null ? (
              <FilterSegment options={[{ label: "Over", value: "over" as PredictionDirection }, { label: "Under", value: "under" as PredictionDirection }]} value={direction} onChange={setDirection} />
            ) : null}
            <span className="t-label-sm text-muted">{helperText}</span>
            {alreadyReachedMessage ? (
              <span className="t-label-sm text-error">{alreadyReachedMessage}</span>
            ) : !baselineValid ? (
              <span className="t-label-sm text-error">{selectedStat === "plus_minus" ? "Enter a valid number." : "Line must be a positive number."}</span>
            ) : null}
          </form>
        </div>

        {!isLive && targetType === "player" ? (
          <div className="flex flex-col gap-2.5 px-4">
            <button type="button" onClick={() => setFiltersExpanded((v) => !v)} className="flex items-center gap-1.5 text-left" aria-expanded={filtersExpanded}>
              <span className="t-label-md text-secondary">More filters (optional)</span>
              {activeFilterCount > 0 ? <span className="t-label-sm text-violet">{activeFilterCount}</span> : null}
              <span className="flex-1" />
              <ChevronDown size={12} className={clsx("text-muted transition-transform", filtersExpanded && "rotate-180")} />
            </button>
            {filtersExpanded ? (
              <div className="ledger">
                <FilterRowButton title="Opposing team" value={contextOpponent} onClick={() => setSheet("opponent")} />
                {mapOptions.length ? <FilterRowButton title="Map" value={contextMap} onClick={() => setSheet("map")} /> : null}
                {game === "League" ? (
                  <div className="flex items-center gap-2 px-3 py-2 border-t border-border-subtle">
                    <span className="t-label-sm text-muted w-[92px]">Side</span>
                    <div className="flex items-end gap-[22px]">
                      {["Blue", "Red"].map((side) => (
                        <FilterChip key={side} label={side} selected={contextSide === side} onClick={() => setContextSide(contextSide === side ? null : side)} />
                      ))}
                    </div>
                  </div>
                ) : null}
                {agentOptions.length ? <FilterRowButton title={game === "League" ? "Champion" : "Agent"} value={contextAgent} onClick={() => setSheet(game === "League" ? "champion" : "agent")} /> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="px-4">
          <BlockButton href={resultHref ?? undefined} disabled={!canRun}>{baselineValue == null ? "Get Breakdown" : "Get Prediction"}</BlockButton>
        </div>
      </div>

      <SearchablePickerSheet open={sheet === "opponent"} onClose={() => setSheet(null)} title="Opposing team" options={opponentOptions} value={contextOpponent} onChange={setContextOpponent} />
      <SearchablePickerSheet open={sheet === "map"} onClose={() => setSheet(null)} title="Map" options={mapOptions} value={contextMap} onChange={setContextMap} />
      <SearchablePickerSheet open={sheet === "agent" || sheet === "champion"} onClose={() => setSheet(null)} title={sheet === "champion" ? "Champion" : "Agent"} options={agentOptions} value={contextAgent} onChange={setContextAgent} />
    </PredictScreen>
  );
}

function FilterRowButton({ title, value, onClick }: { title: string; value: string | null; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-surface/60 transition-colors [&+*]:border-t [&+*]:border-border-subtle">
      <span className="t-label-sm text-muted w-[92px] shrink-0">{title}</span>
      <span className={clsx("t-label-sm truncate", value ? "text-violet" : "text-muted")}>{value ?? "Any"}</span>
      <span className="flex-1" />
      <ChevronRight size={10} className="text-muted" />
    </button>
  );
}
