// alerts/AlertDetail.tsx — the active alert page ("Alert") and the decided
// result page ("Result"). The alert page refreshes every 10 s while its
// match is live; its header carries the live match link (§7), which
// replaces the old "Watch live" row.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Pencil, RotateCcw, Trash2, Trophy, X } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { clsx } from "@/lib/format";
import { useInterval } from "@/lib/use-fetch";
import { liveMatchById, useLiveMatches } from "@/lib/live-matches";
import { EntityHeader, matchPageHref } from "@/components/ui/entity-header";
import { EmptyState, LoadFailure, SkeletonBar, Toast } from "@/components/ui";
import { alertComposerHref, ALERTS_BASE, alertsListHref } from "./entry";
import { callKey, callText, dayText, fmtStat, isLiveAlert, isReached, whenText, type ActiveAlert, type HistoryAlert } from "./model";
import { clearHistoryRow, deleteAlert, refreshAlerts, useAlerts } from "./store";
import { AlertsFrame, AlertsOff, mapsLine, outcomeClass, outcomeWord, roundScore, SectionLabel } from "./ui";

const LIVE_REFRESH_MS = 10_000;

// ── Alert ─────────────────────────────────────────────────────────────────
export function AlertScreen({ id }: { id: string }) {
  const router = useRouter();
  const alerts = useAlerts({ maxAgeMs: 0 });
  const a = alerts.active.find((x) => x.id === id) ?? null;
  const live = !!a && isLiveAlert(a);
  const liveList = useLiveMatches(live);
  useInterval(() => { void refreshAlerts(); }, live ? LIVE_REFRESH_MS : null);

  // Seen once, then gone from ACTIVE: it finished while open.
  const [seen, setSeen] = useState<ActiveAlert | null>(null);
  if (a && a !== seen) setSeen(a);
  const finished = !a && !!seen && alerts.loaded;

  const [removing, setRemoving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const remove = async () => {
    if (!a || removing) return;
    setRemoving(true);
    try { await deleteAlert(a.id); router.push(alertsListHref()); }
    catch (e) { setToast(errorMessage(e, "Couldn't remove the alert.")); setTimeout(() => setToast(null), 2600); setRemoving(false); }
  };

  const shown = a ?? seen;
  return (
    <AlertsFrame title="Alert" back={ALERTS_BASE}>
      {alerts.off ? <AlertsOff message={alerts.featureMessage} /> : !shown ? (
        !alerts.loaded && !alerts.error ? <DetailSkeleton /> : alerts.error && !alerts.loaded ? (
          <LoadFailure error={alerts.error} connectionProblem={alerts.connectionProblem} onRetry={() => void refreshAlerts()} />
        ) : (
          <EmptyState className="!mx-0 mt-6" title="This alert isn't active" subtitle="Its result, if it has one, is under History." actionTitle="Stat Alerts" onAction={() => router.push(alertsListHref())} />
        )
      ) : (
        <>
          <EntityHeader
            type={shown.targetType} id={shown.targetId} name={shown.targetName} game={shown.game}
            imageURL={shown.imageURL} teamName={shown.teamName}
            matchId={live && shown.match ? shown.match.id : null}
          />

          {finished ? (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border-subtle">
              <span className="t-body-sm text-secondary flex-1">This alert has finished. Its result is under History.</span>
              <Link href={alertsListHref()} className="t-label-md text-violet hover:underline shrink-0">History</Link>
            </div>
          ) : null}

          <section className="flex flex-col gap-2">
            <SectionLabel>ALERT</SectionLabel>
            <AlertReadout a={shown} live={live && shown.match ? liveMatchById(liveList, shown.match.id) : null} isLive={live && !finished} />
          </section>

          {!finished && a ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>GO TO</SectionLabel>
              <div className="ledger">
                {a.match && (a.match.status === "upcoming" || a.match.status === "scheduled") ? (
                  <GoRow href={matchPageHref(a.match.id)} icon={<CalendarClock />} title="Match" subtitle={[a.match.opponentName ? `vs ${a.match.opponentName}` : null, whenText(a.match.scheduledAt)].filter(Boolean).join(" · ")} />
                ) : null}
                <GoRow href={`${ALERTS_BASE}/compose?edit=${encodeURIComponent(a.id)}`} icon={<Pencil />} title="Change alert" subtitle="Stat, number, direction, how often" />
                <GoRow onClick={() => void remove()} icon={<Trash2 />} title={removing ? "Removing…" : "Remove alert"} destructive />
              </div>
            </section>
          ) : null}
        </>
      )}
      <Toast message={toast} kind="error" />
    </AlertsFrame>
  );
}

function AlertReadout({ a, live, isLive }: { a: ActiveAlert; live: ReturnType<typeof liveMatchById>; isLive: boolean }) {
  const call = callText(a, a.match?.bestOf);
  const opponent = a.match?.opponentName;
  if (!isLive) {
    const when = a.repeat
      ? [`Every ${a.targetName} match`, opponent ? `next vs ${opponent}` : null, whenText(a.match?.scheduledAt)].filter(Boolean).join(" · ")
      : [opponent ? `Next match · vs ${opponent}` : "Next match", whenText(a.match?.scheduledAt)].filter(Boolean).join(" · ");
    return (
      <div className="flex flex-col gap-1.5 p-4 rounded-xl bg-card border border-border-subtle">
        <span className="t-headline-md text-primary">{call}</span>
        <span className="t-label-md text-muted">{when}</span>
      </div>
    );
  }
  if (a.kind === "stat") {
    const reached = isReached(a);
    const ratio = a.target ? Math.max(0, Math.min(1, (a.live?.value ?? 0) / a.target)) : 0;
    return (
      <div className="relative flex flex-col gap-2 p-4 rounded-xl bg-card border border-border-subtle overflow-hidden">
        <span className="t-label-md text-secondary">{call}{opponent ? ` · vs ${opponent}` : ""}</span>
        <div className="flex items-baseline gap-3">
          <span className="text-[40px] leading-none font-bold font-mono tabular-nums text-primary">{fmtStat(a.stat, a.live?.value ?? null)} <span className="text-muted">/ {fmtStat(a.stat, a.target, false)}</span></span>
          <span className={clsx("text-[11px] font-semibold tracking-[0.08em]", reached ? "text-success" : "text-violet")}>{reached ? "REACHED" : "LIVE"}</span>
        </div>
        {a.direction !== "under" ? (
          <span aria-hidden className="absolute left-0 right-0 bottom-0 h-[3px] bg-surface"><span className={clsx("block h-full", reached ? "bg-success" : "bg-violet")} style={{ width: `${(reached ? 1 : ratio) * 100}%` }} /></span>
        ) : null}
      </div>
    );
  }
  const score = roundScore(a, live) ?? "–";
  const maps = mapsLine(a);
  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl bg-card border border-border-subtle">
      <span className="t-label-md text-secondary">{call}{opponent ? ` · vs ${opponent}` : ""}</span>
      <div className="flex items-baseline gap-3">
        <span className="text-[40px] leading-none font-bold font-mono tabular-nums text-primary">{score}</span>
        {maps ? <span className="t-mono-sm text-secondary">maps {maps}</span> : null}
        <span className="text-[11px] font-semibold tracking-[0.08em] text-violet">LIVE</span>
      </div>
    </div>
  );
}

// ── Result ────────────────────────────────────────────────────────────────
export function AlertResultScreen({ id }: { id: string }) {
  const router = useRouter();
  const alerts = useAlerts();
  const h = alerts.shownHistory.find((x) => x.id === id) ?? null;

  return (
    <AlertsFrame title="Result" back={ALERTS_BASE}>
      {alerts.off ? <AlertsOff message={alerts.featureMessage} /> : !h ? (
        !alerts.loaded && !alerts.error ? <DetailSkeleton /> : alerts.error && !alerts.loaded ? (
          <LoadFailure error={alerts.error} connectionProblem={alerts.connectionProblem} onRetry={() => void refreshAlerts()} />
        ) : (
          <EmptyState className="!mx-0 mt-6" title="This result isn't here any more" actionTitle="Stat Alerts" onAction={() => router.push(alertsListHref())} />
        )
      ) : (
        <>
          <EntityHeader type={h.targetType} id={h.targetId} name={h.targetName} game={h.game} imageURL={h.imageURL} teamName={h.teamName} />

          <section className="flex flex-col gap-2">
            <SectionLabel>RESULT</SectionLabel>
            <Verdict h={h} />
          </section>

          <section className="flex flex-col gap-2">
            <SectionLabel>GO TO</SectionLabel>
            <div className="ledger">
              {h.match ? <GoRow href={matchPageHref(h.match.id)} icon={<Trophy />} title="Match result" subtitle={[h.match.opponentName ? `vs ${h.match.opponentName}` : null, dayText(h.match.scheduledAt ?? h.finalAt)].filter(Boolean).join(" · ")} /> : null}
              <GoRow
                href={alertComposerHref({ targetType: h.targetType, targetId: h.targetId, targetName: h.targetName, game: h.game, stat: callKey(h), direction: h.kind === "stat" ? h.direction : null, target: h.kind === "stat" ? h.target : null })}
                icon={<RotateCcw />} title="Set it again" subtitle={callText(h, h.match?.bestOf)}
              />
              <GoRow onClick={() => { clearHistoryRow(h.id); router.push(alertsListHref()); }} icon={<X />} title="Remove from history" destructive />
            </div>
          </section>
        </>
      )}
    </AlertsFrame>
  );
}

function Verdict({ h }: { h: HistoryAlert }) {
  const call = callText(h, h.match?.bestOf);
  const value = h.kind === "stat" ? (h.finalValue != null ? fmtStat(h.stat, h.finalValue) : null) : h.finalScore;
  const matchLine = [h.match?.opponentName ? `vs ${h.match.opponentName}` : null, dayText(h.finalAt ?? h.match?.scheduledAt)].filter(Boolean).join(" · ");
  const tone = h.outcome === "hit" ? "border-success/50" : "border-border-subtle";
  return (
    <div className={clsx("flex flex-col gap-2 p-4 rounded-xl bg-card border", tone)}>
      <span className={clsx("text-[13px] font-bold tracking-[0.12em]", outcomeClass(h.outcome))}>{outcomeWord(h.outcome)}</span>
      <span className="t-headline-md text-primary">{call}</span>
      <div className="flex items-baseline gap-2.5">
        {value ? <span className={clsx("text-[40px] leading-none font-bold font-mono tabular-nums", h.outcome === "void" ? "text-muted" : "text-primary")}>{value}</span> : null}
        <span className="t-label-md text-muted">
          {h.outcome === "void" ? "Didn't play" : h.kind === "stat" ? (h.target != null ? `target ${fmtStat(h.stat, h.target, false)}` : null) : h.kind === "map" ? `map ${h.mapNumber ?? ""}`.trim() : "maps"}
        </span>
      </div>
      {matchLine ? <span className="t-label-md text-secondary">{matchLine}</span> : null}
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────
function GoRow({ href, onClick, title, subtitle, destructive, icon }: { href?: string; onClick?: () => void; title: string; subtitle?: string; destructive?: boolean; icon: React.ReactNode }) {
  const body = (
    <>
      <span className={clsx("grid place-items-center size-8 rounded-[9px] bg-surface shrink-0 [&>svg]:size-4", destructive ? "text-error" : "text-violet")}>{icon}</span>
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className={clsx("t-body-md", destructive ? "text-error" : "text-primary")}>{title}</span>
        {subtitle ? <span className="t-label-sm text-muted truncate">{subtitle}</span> : null}
      </span>
    </>
  );
  const cls = "flex items-center gap-3 w-full px-3.5 py-3 text-left hover:bg-surface/50 transition-colors [&+*]:border-t [&+*]:border-border-subtle";
  return href ? <Link href={href} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border-subtle">
        <span className="size-10 rounded-full bg-surface" />
        <div className="flex flex-col gap-1.5"><SkeletonBar width={120} height={12} /><SkeletonBar width={80} height={9} /></div>
      </div>
      <div className="flex flex-col gap-2 p-4 rounded-xl bg-card border border-border-subtle"><SkeletonBar width={160} height={16} /><SkeletonBar width={110} height={10} /></div>
      <div className="ledger">{[0, 1, 2].map((i) => <div key={i} className="ledger-row"><span className="size-8 rounded-[9px] bg-surface" /><SkeletonBar width={120} height={11} /></div>)}</div>
    </div>
  );
}
