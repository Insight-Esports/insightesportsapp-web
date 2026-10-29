// alerts/AlertsList.tsx — "Stat Alerts" (StatAlerts.swift list). ACTIVE rows
// with their live readout (which opens the live match) or when they're
// for; HISTORY with HIT / MISS / DIDN'T PLAY, "Clear all" and per-row
// "✕ Clear" (a local cut until the server can clear history). While
// anything is live, GET /alerts and the shared live list refresh every 15 s.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { useInterval } from "@/lib/use-fetch";
import { liveMatchById, refreshLiveMatches, useLiveMatches } from "@/lib/live-matches";
import { InitialAvatar, LoadFailure, SkeletonLedger, TeamMark, Toast } from "@/components/ui";
import { alertsNewHref } from "./entry";
import { callText, dayText, isLiveAlert, PREMIUM_UPGRADE_HREF, type ActiveAlert, type AlertBase, type HistoryAlert } from "./model";
import { clearAllHistory, clearHistoryRow, deleteAlert, refreshAlerts, useAlerts } from "./store";
import { AlertList, alertRowClass, AlertsFrame, AlertsOff, ConfirmPopover, HistoryReadout, LiveReadout, ProgressLine, RowMenu, SectionLabel, WhenReadout } from "./ui";

const LIVE_REFRESH_MS = 15_000;

export const alertHref = (id: string) => `/alerts/${encodeURIComponent(id)}`;
export const resultHref = (id: string) => `/alerts/${encodeURIComponent(id)}/result`;

export function AlertsListScreen() {
  const router = useRouter();
  const alerts = useAlerts({ maxAgeMs: 0 });
  const anyLive = alerts.active.some(isLiveAlert);
  const liveList = useLiveMatches(anyLive);
  useInterval(() => { void refreshAlerts(); void refreshLiveMatches(LIVE_REFRESH_MS - 1_000); }, anyLive ? LIVE_REFRESH_MS : null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const remove = async (a: ActiveAlert) => {
    try { await deleteAlert(a.id); } catch (e) { flash(errorMessage(e, "Couldn't remove that alert.")); }
  };

  const history = alerts.shownHistory;
  const empty = alerts.loaded && alerts.active.length === 0 && history.length === 0;

  return (
    <AlertsFrame
      title="Stat Alerts"
      trailing={alerts.off ? null : (
        <Link href={alertsNewHref()} aria-label="New alert" title="New alert" className="grid place-items-center size-8 rounded-lg text-violet hover:bg-card transition-colors">
          <Plus size={20} strokeWidth={2.5} />
        </Link>
      )}
    >
      {alerts.off ? (
        <AlertsOff message={alerts.featureMessage} />
      ) : !alerts.loaded && !alerts.error ? (
        <SkeletonLedger rows={4} avatar={40} />
      ) : alerts.error && !alerts.loaded ? (
        <LoadFailure error={alerts.error} connectionProblem={alerts.connectionProblem} onRetry={() => void refreshAlerts()} />
      ) : empty ? (
        <EmptyAlerts onNew={() => router.push(alertsNewHref())} />
      ) : (
        <>
          {alerts.active.length ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>ACTIVE</SectionLabel>
              <AlertList>
                {alerts.active.map((a) => (
                  <ActiveRow key={a.id} a={a} live={isLiveAlert(a) && a.match ? liveMatchById(liveList, a.match.id) : null} onRemove={() => void remove(a)} />
                ))}
              </AlertList>
            </section>
          ) : null}

          {history.length ? (
            <section className="flex flex-col gap-2">
              <SectionLabel trailing={
                <ConfirmPopover trigger="Clear all" title="Clear alert history?" message="Past results leave this list. Your active alerts keep running." confirmTitle="Clear" onConfirm={clearAllHistory} />
              }>HISTORY</SectionLabel>
              <AlertList>
                {history.map((h) => <HistoryRow key={h.id} h={h} onClear={() => clearHistoryRow(h.id)} />)}
              </AlertList>
            </section>
          ) : null}
        </>
      )}

      {!alerts.off && alerts.loaded && !alerts.isPremium ? <FreeFooter /> : null}
      <Toast message={toast} kind="error" />
    </AlertsFrame>
  );
}

// ── Rows ──────────────────────────────────────────────────────────────────
export function TargetAvatar({ a, size = 40 }: { a: Pick<AlertBase, "targetType" | "targetName" | "imageURL">; size?: number }) {
  return a.targetType === "team"
    ? <TeamMark name={a.targetName || "?"} logoURL={a.imageURL} size={size} />
    : <InitialAvatar name={a.targetName || "?"} imageURL={a.imageURL} size={size} />;
}

function ActiveRow({ a, live, onRemove }: { a: ActiveAlert; live: ReturnType<typeof liveMatchById>; onRemove: () => void }) {
  const call = callText(a, a.match?.bestOf);
  return (
    <div className={alertRowClass}>
      <Link href={alertHref(a.id)} aria-label={`${a.targetName}: ${call}`} className="absolute inset-0" />
      <TargetAvatar a={a} />
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="t-body-md font-semibold text-primary truncate">{a.targetName}</span>
        <span className="t-label-md text-secondary truncate">{call}</span>
      </span>
      {isLiveAlert(a) ? <LiveReadout a={a} live={live} /> : <WhenReadout a={a} />}
      <RowMenu label={`More for ${a.targetName}`} items={[{ label: "Remove", destructive: true, onSelect: onRemove }]} />
      <ProgressLine a={a} />
    </div>
  );
}

function HistoryRow({ h, onClear }: { h: HistoryAlert; onClear: () => void }) {
  const call = callText(h, h.match?.bestOf);
  const day = dayText(h.finalAt ?? h.match?.scheduledAt);
  const matchLine = [h.match?.opponentName ? `vs ${h.match.opponentName}` : null, day].filter(Boolean).join(" · ");
  return (
    <div className={alertRowClass}>
      <Link href={resultHref(h.id)} aria-label={`${h.targetName}: ${call}`} className="absolute inset-0" />
      <TargetAvatar a={h} />
      <span className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="t-body-md font-semibold text-primary truncate">{h.targetName}</span>
        <span className="t-label-md text-secondary truncate">{call}</span>
        {matchLine ? <span className="t-label-sm text-muted truncate">{matchLine}</span> : null}
      </span>
      <HistoryReadout h={h} />
      <RowMenu label={`More for ${h.targetName}`} items={[{ label: "✕ Clear", onSelect: onClear }]} />
    </div>
  );
}

// ── Empty + free footer ───────────────────────────────────────────────────
function EmptyAlerts({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 pt-6 text-center">
      {/* A sample row: what an alert looks like once it's running. */}
      <div aria-hidden className="w-full max-w-md ledger opacity-70 pointer-events-none select-none text-left">
        <div className="relative flex items-center gap-3 px-3.5 py-3 bg-card">
          <InitialAvatar name="TenZ" size={40} />
          <span className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="t-body-md font-semibold text-primary">TenZ</span>
            <span className="t-label-md text-secondary">At least 20 kills</span>
          </span>
          <span className="flex flex-col items-end gap-0.5 px-2 py-1 -my-1 rounded-[8px] bg-violet/12">
            <span className="text-[15px] font-semibold font-mono tabular-nums text-primary leading-tight">12 / 20</span>
            <span className="text-[10px] font-semibold tracking-[0.08em] leading-none text-violet">LIVE</span>
          </span>
          <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-surface"><span className="block h-full bg-violet" style={{ width: "60%" }} /></span>
        </div>
      </div>
      <span className="t-headline-sm text-primary pt-2">No alerts yet</span>
      <span className="t-body-sm text-muted max-w-sm">A player or team, a stat, a number. We push you the moment it&apos;s reached.</span>
      <button type="button" onClick={onNew} className="btn-pill mt-1">New alert</button>
    </div>
  );
}

function FreeFooter() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl bg-card border border-border-subtle">
      <span className="t-body-sm text-secondary flex-1">Free accounts get one active alert. Premium: unlimited, with live pushes and the chance.</span>
      <Link href={PREMIUM_UPGRADE_HREF} className="btn-pill !py-2 shrink-0 self-start sm:self-auto">Get Premium</Link>
    </div>
  );
}
