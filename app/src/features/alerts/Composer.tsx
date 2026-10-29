// alerts/Composer.tsx — "Set Alert" / "Change Alert" (StatAlerts.swift
// composer). Reads the query `entry.ts` builds (type, id, name, game, stat,
// direction, target, match) or `?edit=<id>` for an alert that exists.
//
//   Header → the target's existing alerts → STAT chips (players: the
//   predictor's stats) or WHAT (teams: Result · Maps · Stats) → TARGET
//   (At least / Under, a stepper from the last-10 average, the chance) →
//   the already-settled check on a live match → WHEN → Set.
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Lock, Minus, Plus } from "lucide-react";
import { api, ApiError, endpoints, errorMessage } from "@/lib/api";
import { clsx } from "@/lib/format";
import { useInterval } from "@/lib/use-fetch";
import { liveMatchById, useLiveMatches } from "@/lib/live-matches";
import { SELECTABLE_GAMES, type Json } from "@/lib/types";
import { EntityHeader } from "@/components/ui/entity-header";
import { EmptyState, Spinner } from "@/components/ui";
import { normalizePrediction, normalizeStatRows, PredictionFormat, PredictionStatCatalog, type MatchStatRow } from "@/features/predictions/types";
import { alertsListHref, type AlertDirection, type AlertTargetType } from "./entry";
import {
  BOTH_WAYS, callText, CUMULATIVE, fmtStat, isCounting, isLiveAlert, mapsToWin, normalizeContext, parseKey, PREMIUM_UPGRADE_HREF,
  RESULT_EVENTS, snapTarget, statLabel, statStep, statWord, whenText, type ActiveAlert, type AlertCall, type AlertContext,
} from "./model";
import { alertsForTarget, createAlert, updateAlert, useAlerts } from "./store";
import { alertHref } from "./AlertsList";
import { AlertList, alertRowClass, AlertsFrame, AlertsOff, Chip, LiveReadout, SectionLabel, Segment, WhenReadout } from "./ui";

type When = "match" | "every";

/** Where the stepper starts when there's no last-10 average to read. */
function defaultTarget(stat: string, targetType: AlertTargetType, game: string): number {
  if (targetType === "team") return stat === "kills" ? (game === "League" ? 15 : 60) : 5;
  switch (stat) {
    case "kills": return game === "League" ? 4 : 15;
    case "deaths": return game === "League" ? 3 : 14;
    case "assists": return game === "League" ? 7 : 5;
    case "acs": return 200;
    case "adr": return game === "CS2" ? 80 : 140;
    case "headshots": return 7;
    case "plus_minus": return 3;
    case "cs_per_min": return 8.5;
    case "gold_earned": return 12000;
    case "vision_score": return 30;
    default: return 10;
  }
}

/** A stat out of a live stat row (GET /matches/:id/stats). */
function rowValue(r: MatchStatRow, stat: string): number | null {
  switch (stat) {
    case "kills": return r.kills; case "deaths": return r.deaths; case "assists": return r.assists;
    case "acs": return r.acs; case "adr": return r.adr; case "headshots": return r.headshots;
    case "plus_minus": return r.plusMinus; case "cs_per_min": return r.csPerMin;
    case "gold_earned": return r.goldEarned; case "vision_score": return r.visionScore;
    default: return null;
  }
}

/** The target's value so far: a player's row, or a team's rows added up the way the server does. */
function liveValueOf(rows: MatchStatRow[], targetType: AlertTargetType, targetId: string, stat: string): number | null {
  if (targetType === "player") {
    const row = rows.find((r) => r.playerId === targetId);
    return row ? rowValue(row, stat) : null;
  }
  const mine = rows.filter((r) => r.teamId === targetId);
  if (!mine.length) return null;
  const vals = mine.map((r) => rowValue(r, stat)).filter((v): v is number => v != null);
  if (!vals.length) return null;
  const sum = vals.reduce((s, v) => s + v, 0);
  return stat === "acs" || stat === "adr" || stat === "cs_per_min" ? sum / vals.length : sum;
}

// ── Screen: resolve what the composer opens with ──────────────────────────
export function ComposerScreen() {
  const sp = useSearchParams();
  const alerts = useAlerts();
  const editId = sp.get("edit");
  const editing = editId ? alerts.active.find((a) => a.id === editId) ?? null : null;
  const title = editId ? "Change Alert" : "Set Alert";

  if (alerts.off) return <AlertsFrame title={title} back={alertsListHref()}><AlertsOff message={alerts.featureMessage} /></AlertsFrame>;

  if (editId) {
    if (!editing) {
      return (
        <AlertsFrame title={title} back={alertsListHref()}>
          {!alerts.loaded ? (
            <div className="grid place-items-center py-16"><Spinner /></div>
          ) : (
            <EmptyState className="!mx-0 mt-6" title="This alert isn't active any more" subtitle="Its result is under History." />
          )}
        </AlertsFrame>
      );
    }
    return (
      <Composer
        key={`edit:${editing.id}`}
        targetType={editing.targetType} targetId={editing.targetId} targetName={editing.targetName} game={editing.game}
        teamName={editing.teamName} imageURL={editing.imageURL}
        initialKey={editing.kind === "stat" ? editing.stat : editing.kind === "map" ? `map_${editing.mapNumber ?? 1}` : editing.event}
        initialDirection={editing.direction} initialTarget={editing.target}
        matchParam={editing.match?.status === "live" ? editing.match.id : null}
        editing={editing}
      />
    );
  }

  const g = sp.get("game");
  const game = g && SELECTABLE_GAMES.some((x) => x.id === g) ? g : "VALORANT";
  const targetType: AlertTargetType = sp.get("type") === "team" ? "team" : "player";
  const t = sp.get("target");
  const targetNum = t != null && t.trim() !== "" && Number.isFinite(Number(t)) ? Number(t) : null;
  const dir = sp.get("direction");
  return (
    <Composer
      key={sp.toString()}
      targetType={targetType} targetId={sp.get("id") ?? ""} targetName={sp.get("name") ?? ""} game={game}
      initialKey={sp.get("stat")} initialDirection={dir === "under" ? "under" : dir === "over" ? "over" : null} initialTarget={targetNum}
      matchParam={sp.get("match")}
      editing={null}
    />
  );
}

// ── The composer ──────────────────────────────────────────────────────────
interface ComposerProps {
  targetType: AlertTargetType; targetId: string; targetName: string; game: string;
  teamName?: string | null; imageURL?: string | null;
  initialKey: string | null; initialDirection: AlertDirection | null; initialTarget: number | null;
  /** The live match the composer was opened for ("This match"). */
  matchParam: string | null;
  editing: ActiveAlert | null;
}

function Composer(p: ComposerProps) {
  const { targetType, targetId, game, editing } = p;
  const router = useRouter();
  const alerts = useAlerts();
  const premium = alerts.isPremium;
  const [name, setName] = useState(p.targetName);
  const displayName = name || p.targetName || (targetType === "team" ? "This team" : "This player");

  const playerStats = useMemo(() => PredictionStatCatalog.playerStats(game), [game]);
  const teamStats = useMemo(() => PredictionStatCatalog.teamStats(game), [game]);
  const validKey = (k: string | null): k is string => {
    if (!k) return false;
    if (targetType === "player") return playerStats.includes(k);
    return teamStats.includes(k) || (RESULT_EVENTS as string[]).includes(k) || /^map_[1-5]$/.test(k);
  };
  const firstKey = validKey(p.initialKey) ? p.initialKey : targetType === "team" ? "win" : playerStats[0] ?? "kills";

  const [key, setKey] = useState<string>(firstKey);
  const [direction, setDirection] = useState<AlertDirection>(p.initialDirection ?? "over");
  // The number the user set (or the prefill). null = follow the last-10 average.
  const [manual, setManual] = useState<{ stat: string; value: number } | null>(
    p.initialTarget != null && validKey(p.initialKey) && parseKey(firstKey).kind === "stat" ? { stat: firstKey, value: p.initialTarget } : null,
  );
  const [when, setWhen] = useState<When>(editing?.repeat ? "every" : "match");

  const parsed = parseKey(key);
  const stat = parsed.kind === "stat" ? parsed.stat : null;

  // ── Context: the match an alert would be for, best_of, maps ──
  const [ctx, setCtx] = useState<AlertContext | null>(null);
  const [ctxTick, setCtxTick] = useState(0);
  const ctxMatchId = p.matchParam ?? (editing && !editing.repeat ? editing.match?.id ?? null : null);
  useEffect(() => {
    if (!targetId) return;
    let on = true;
    api.get<Json>(endpoints.alertsContext(targetType, targetId, ctxMatchId))
      .then((raw) => { if (on) setCtx(normalizeContext(raw)); })
      .catch(() => { if (on) setCtx((c) => c ?? { match: null }); });
    return () => { on = false; };
  }, [targetType, targetId, ctxMatchId, ctxTick]);
  const cm = ctx?.match ?? null;
  const liveMatchId = p.matchParam ?? (cm?.status === "live" ? cm.id : null);
  const forLive = when === "match" && !!liveMatchId && cm?.status === "live";
  const bestOf = cm?.bestOf ?? null;

  // ── Live stat rows (the "so far" number and the settled check) ──
  const [liveStats, setLiveStats] = useState<{ matchId: string; rows: MatchStatRow[] } | null>(null);
  useEffect(() => {
    if (!forLive || !liveMatchId) return;
    let on = true;
    api.get<Json>(endpoints.matchStats(liveMatchId)).then((raw) => { if (on) setLiveStats({ matchId: liveMatchId, rows: normalizeStatRows(raw) }); }).catch(() => {});
    return () => { on = false; };
  }, [forLive, liveMatchId, ctxTick]);
  useInterval(() => setCtxTick((t) => t + 1), forLive ? 15_000 : null);
  const liveRows = forLive && liveStats?.matchId === liveMatchId ? liveStats.rows : null;
  const liveValue = stat && liveRows ? liveValueOf(liveRows, targetType, targetId, stat) : null;

  // ── Last-10 average per stat (the predictor's number; a free account's own last 10) ──
  const [avgs, setAvgs] = useState<Record<string, number | null>>({});
  const avgKnown = stat != null && stat in avgs;
  useEffect(() => {
    if (!stat || avgKnown || !targetId) return;
    let on = true;
    (async () => {
      let avg: number | null = null;
      if (premium) {
        try {
          const r = normalizePrediction(await api.post(endpoints.analyzePrediction, { game, targetType, targetId, stat, window: 10 }));
          avg = r.last10Average ?? r.careerAverage;
        } catch { /* fall through */ }
      }
      if (avg == null && targetType === "player") {
        try {
          const rows = await api.get<Json>(endpoints.playerMatches(targetId, 10));
          const vals = (Array.isArray(rows) ? rows : []).map((r: Json) => Number(r?.[stat])).filter((v: number) => Number.isFinite(v));
          if (vals.length) avg = vals.reduce((s: number, v: number) => s + v, 0) / vals.length;
        } catch { /* default */ }
      }
      if (on) setAvgs((a) => ({ ...a, [stat]: avg }));
    })();
    return () => { on = false; };
  }, [stat, avgKnown, premium, game, targetType, targetId]);
  const avg = stat ? avgs[stat] ?? null : null;
  const target: number | null = stat == null ? null
    : manual && manual.stat === stat ? manual.value
    : avgKnown ? snapTarget(stat, avg ?? defaultTarget(stat, targetType, game)) : null;

  const step = statStep(stat);
  const minTarget = stat === "plus_minus" ? -999 : step;
  const bump = (dir: 1 | -1) => {
    if (!stat || target == null) return;
    const next = Math.round((target + dir * step) * 10) / 10;
    if (next < minTarget || next > 100000) return;
    setManual({ stat, value: next });
  };

  // ── The chance (Premium) ──
  const [chance, setChance] = useState<{ key: string; text: string | null } | null>(null);
  const chanceKey = `${stat}|${direction}|${target}|${forLive ? liveMatchId : ""}`;
  useEffect(() => {
    if (!premium || !stat || target == null || !targetId) return;
    let on = true;
    const timer = setTimeout(async () => {
      const baseline = isCounting(stat) ? target - 0.5 : target;
      try {
        let raw: unknown;
        if (forLive && liveMatchId) {
          raw = targetType === "player"
            ? await api.post(endpoints.livePlayerPrediction, { matchId: liveMatchId, playerId: targetId, stat, baseline, direction })
            : await api.post(endpoints.liveTeamPrediction, { matchId: liveMatchId, teamId: targetId, stat, baseline, direction });
        } else {
          raw = await api.post(endpoints.analyzePrediction, { game, targetType, targetId, stat, window: 10, baseline, direction });
        }
        const r = normalizePrediction(raw);
        const pct = PredictionFormat.percent(r.probabilityExact, r.confidence);
        if (on) setChance({ key: chanceKey, text: pct === "—" ? null : `${pct} chance` });
      } catch {
        if (on) setChance({ key: chanceKey, text: null });
      }
    }, 350);
    return () => { on = false; clearTimeout(timer); };
  }, [premium, stat, target, direction, forLive, liveMatchId, targetType, targetId, game, chanceKey]);
  const chanceText = chance?.key === chanceKey ? chance.text : undefined;   // undefined = loading

  // ── Already settled (a live match) ──
  const settled: string | null = (() => {
    if (!forLive || !cm) return null;
    if (parsed.kind === "stat") {
      if (!stat || !CUMULATIVE.has(stat) || liveValue == null || target == null || liveValue < target) return null;
      const verb = targetType === "team" ? "have" : "has";
      return `${displayName} already ${verb} ${fmtStat(stat, liveValue)} ${statWord(stat)} this match — pick a higher number.`;
    }
    const own = cm.targetScore ?? 0, opp = cm.opponentScore ?? 0;
    if (parsed.kind === "map") {
      const n = parsed.mapNumber ?? 1;
      const row = cm.maps.find((m) => m.number === n);
      if ((row && row.status === "finished") || (!row && own + opp >= n)) return `Map ${n} is already over.`;
      return null;
    }
    if (parsed.event === "sweep" && opp > 0) return `${displayName} has already dropped a map.`;
    if (parsed.event === "distance") {
      const need = mapsToWin(bestOf);
      if (need && own === need - 1 && opp === need - 1) return "The series is already there.";
    }
    return null;
  })();

  // ── Save ──
  const [saving, setSaving] = useState(false);
  // An error belongs to the call it was made for: changing the call clears it.
  const sig = `${key}|${direction}|${target}|${when}`;
  const [failure, setError] = useState<{ sig: string; code: string | null; message: string } | null>(null);
  const error = failure?.sig === sig ? failure : null;
  const [done, setDone] = useState<ActiveAlert | null | "ok">(null);

  const call: AlertCall = { kind: parsed.kind, stat, direction: parsed.kind === "stat" ? direction : null, target: parsed.kind === "stat" ? target : null, event: parsed.event, mapNumber: parsed.mapNumber };
  const words = callText(call, bestOf);
  const serverSettled = error?.code === "ALREADY_REACHED" ? error.message : null;
  const blocked = !!settled || !!serverSettled;
  const canSave = !!targetId && !saving && !blocked && !alerts.degraded && (parsed.kind !== "stat" || target != null);

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setError(null);
    const callBody = {
      kind: parsed.kind,
      stat: parsed.kind === "stat" ? stat : null,
      direction: parsed.kind === "stat" ? direction : null,
      target: parsed.kind === "stat" ? target : null,
      event: parsed.kind === "stat" ? null : parsed.event,
      map: parsed.kind === "map" ? parsed.mapNumber : null,
    };
    try {
      const a = editing
        ? await updateAlert(editing.id, callBody)
        : await createAlert({ game, targetType, targetId, ...callBody, repeat: when === "every", matchId: when === "match" ? liveMatchId : null });
      setDone(a ?? "ok");
    } catch (e) {
      setError({ sig, code: e instanceof ApiError ? e.code : null, message: errorMessage(e, "Couldn't save the alert.") });
    } finally { setSaving(false); }
  };

  // ── Copy ──
  const whenCaption = (() => {
    if (when === "every") return `Every ${displayName} match until you turn it off.`;
    if (liveMatchId) return cm?.status === "live" && cm.opponentName ? `vs ${cm.opponentName} · live now` : "The match happening right now.";
    if (cm && cm.status !== "live" && cm.opponentName) return [`vs ${cm.opponentName}`, whenText(cm.scheduledAt)].filter(Boolean).join(" · ");
    return "Their next scheduled match, picked when you save.";
  })();
  const info = !premium
    ? "Free: one active alert, final result only. Premium: unlimited, live pushes, the chance."
    : parsed.kind === "stat" && stat && BOTH_WAYS.has(stat)
      ? `${statLabel(stat)} moves both ways, so this one is decided when the match ends. You'll see it live here.`
      : parsed.kind === "stat"
        ? "A push the moment it's reached live, and the final number when the match ends."
        : "A push the moment it's decided.";
  const caption = (() => {
    // "Last 10 avg 18": whole numbers, except CS/min.
    const avgPart = avg != null && stat ? `Last 10 avg ${fmtStat(stat, stat === "cs_per_min" ? Math.round(avg * 10) / 10 : Math.round(avg), false)}` : null;
    if (forLive && liveValue != null && stat) return [`${fmtStat(stat, liveValue)} so far this series`, avgPart].filter(Boolean).join(" · ");
    return avgPart ? `${avgPart} · counts the whole series` : "Counts the whole series";
  })();

  const others = alertsForTarget(alerts.active, targetType, targetId).filter((a) => a.id !== editing?.id);
  const liveList = useLiveMatches(others.some(isLiveAlert));
  const title = editing ? "Change Alert" : "Set Alert";

  if (done) {
    const a = done === "ok" ? null : done;
    const opponent = a?.match?.opponentName ?? cm?.opponentName ?? null;
    const line = when === "every" ? `Every ${displayName} match` : `${liveMatchId ? "This match" : "Next match"}${opponent ? ` · vs ${opponent}` : ""}`;
    return (
      <AlertsFrame title={title} back={alertsListHref()}>
        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <span className="grid place-items-center size-14 rounded-full bg-violet/15 text-violet"><Check size={26} strokeWidth={2.5} /></span>
          <span className="t-headline-md text-primary">{editing ? "Alert updated" : "Alert set"}</span>
          <span className="t-body-md text-secondary">{displayName} · {words}</span>
          <span className="t-label-md text-muted">{line}</span>
          <button type="button" onClick={() => router.push(alertsListHref())} className="btn-pill mt-4 min-w-40">Done</button>
        </div>
      </AlertsFrame>
    );
  }

  return (
    <AlertsFrame title={title} back={editing ? alertHref(editing.id) : undefined}>
      <EntityHeader
        type={targetType} id={targetId} name={displayName} game={game}
        imageURL={p.imageURL} teamName={p.teamName}
        matchId={liveMatchId} live={!!p.matchParam}
      />
      {!p.targetName && !name ? <NameLoader targetType={targetType} targetId={targetId} onName={setName} /> : null}

      {others.length ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>{editing ? "ITS OTHER ALERTS" : "ALREADY SET"}</SectionLabel>
          <AlertList>
            {others.map((a) => (
              <div key={a.id} className={alertRowClass + " !pr-3.5"}>
                <Link href={alertHref(a.id)} aria-label={callText(a, a.match?.bestOf)} className="absolute inset-0" />
                <Bell size={15} className="text-violet shrink-0" fill="currentColor" />
                <span className="t-body-md text-primary flex-1 min-w-0 truncate">{callText(a, a.match?.bestOf)}</span>
                {isLiveAlert(a) ? <LiveReadout a={a} live={a.match ? liveMatchById(liveList, a.match.id) : null} /> : <WhenReadout a={a} />}
              </div>
            ))}
          </AlertList>
        </section>
      ) : null}

      {targetType === "player" ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>STAT</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {playerStats.map((s) => <Chip key={s} label={statLabel(s)} selected={key === s} onClick={() => setKey(s)} />)}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <SectionLabel>WHAT</SectionLabel>
          <ChipGroup label="Result">
            {(bestOf === 1 ? (["win", "lose"] as const) : RESULT_EVENTS).map((e) => (
              <Chip key={e} label={e === "win" ? "Wins" : e === "lose" ? "Loses" : e === "sweep" ? "Sweep" : "Goes the distance"} selected={key === e} onClick={() => setKey(e)} />
            ))}
          </ChipGroup>
          <ChipGroup label="Maps">
            {Array.from({ length: Math.min(5, Math.max(1, bestOf ?? 3)) }, (_, i) => i + 1).map((n) => (
              <Chip key={n} label={`Wins map ${n}`} selected={key === `map_${n}`} onClick={() => setKey(`map_${n}`)} />
            ))}
          </ChipGroup>
          <ChipGroup label="Stats">
            {teamStats.map((s) => <Chip key={s} label={statLabel(s)} selected={key === s} onClick={() => setKey(s)} />)}
          </ChipGroup>
        </section>
      )}

      {parsed.kind === "stat" && stat ? (
        <section className="flex flex-col gap-2.5">
          <SectionLabel>TARGET</SectionLabel>
          <div className={clsx("flex flex-col gap-4 p-4 rounded-xl bg-card border transition-colors", blocked ? "border-error" : "border-border-subtle")}>
            <Segment options={[{ label: "At least", value: "over" as AlertDirection }, { label: "Under", value: "under" as AlertDirection }]} value={direction} onChange={setDirection} />
            <div className="flex items-center justify-between gap-3">
              <StepButton label="Lower" onClick={() => bump(-1)} disabled={target == null || target - step < minTarget}><Minus size={18} strokeWidth={2.5} /></StepButton>
              <div className="flex flex-col items-center gap-0.5 min-w-0">
                <span className="text-[36px] leading-none font-bold font-mono tabular-nums text-primary">{target == null ? "…" : fmtStat(stat, target)}</span>
                <span className="t-label-md text-muted">{statLabel(stat)}</span>
              </div>
              <StepButton label="Higher" onClick={() => bump(1)} disabled={target == null}><Plus size={18} strokeWidth={2.5} /></StepButton>
            </div>
            <span className="t-label-sm text-muted text-center">{caption}</span>
            <div className="flex justify-center">
              {premium ? (
                <span className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full t-label-md", chanceText ? "bg-violet/12 text-violet" : "bg-surface text-muted")}>
                  {chanceText === undefined ? <><Spinner size={12} /> Working out the chance</> : chanceText ?? "No chance to show yet"}
                </span>
              ) : (
                <Link href={PREMIUM_UPGRADE_HREF} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full t-label-md bg-gold/12 text-gold hover:bg-gold/20 transition-colors">
                  <Lock size={12} strokeWidth={2.5} />See the chance
                </Link>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {settled || serverSettled ? (
        <div className={clsx("p-3.5 rounded-xl border border-error bg-error/8 t-body-sm text-primary", parsed.kind === "stat" && "-mt-3")}>{settled ?? serverSettled}</div>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionLabel>WHEN</SectionLabel>
        <Segment
          options={[{ label: liveMatchId ? "This match" : "Next match", value: "match" as When }, { label: "Every match", value: "every" as When }]}
          value={when}
          onChange={setWhen}
          disabled={!!editing}
        />
        <span className="t-label-sm text-muted">{whenCaption}</span>
      </section>

      <span className="t-label-sm text-muted">{info}</span>

      {error && error.code !== "ALREADY_REACHED" ? (
        error.code === "ALERT_LIMIT" && !premium ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl bg-card border border-gold/40">
            <span className="t-body-sm text-primary flex-1">Free accounts get one active alert.</span>
            <Link href={PREMIUM_UPGRADE_HREF} className="btn-pill !py-2 shrink-0 self-start sm:self-auto">Get Premium</Link>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-error/10 border border-error/40 t-body-sm text-primary">{error.message}</div>
        )
      ) : null}
      {alerts.degraded ? <div className="p-3.5 rounded-xl bg-gold/10 t-body-sm text-secondary">{alerts.featureMessage ?? "Stat Alerts are read only right now. Try again in a bit."}</div> : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave}
        className={clsx("flex items-center justify-center gap-2 w-full py-4 rounded-[14px] t-label-lg transition-colors mb-2", canSave ? "bg-violet text-white hover:brightness-110" : "bg-surface text-muted cursor-not-allowed")}
      >
        {saving ? <Spinner size={16} className="border-white/40 border-t-white" /> : null}
        <span className="truncate">{editing ? "Update" : "Set alert"} · {words}</span>
      </button>
    </AlertsFrame>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="t-label-sm text-secondary">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function StepButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="grid place-items-center size-12 rounded-full bg-surface border border-border-subtle text-violet hover:border-border-strong disabled:opacity-35 disabled:cursor-not-allowed transition-colors shrink-0">
      {children}
    </button>
  );
}

/** Opened without a name (a bare link): read it once from the player / team. */
function NameLoader({ targetType, targetId, onName }: { targetType: AlertTargetType; targetId: string; onName: (n: string) => void }) {
  useEffect(() => {
    if (!targetId) return;
    let on = true;
    api.get<Json>(targetType === "player" ? endpoints.playerDetail(targetId) : endpoints.teamDetail(targetId))
      .then((raw) => { const n = typeof raw?.name === "string" ? raw.name : null; if (on && n) onName(n); })
      .catch(() => {});
    return () => { on = false; };
  }, [targetType, targetId, onName]);
  return null;
}
