// predictions/links.tsx — every name links (parity doc 2026-10-28 §7):
// game rows (last10Games, vsOpponentGames, team-overview games[]) open the
// match by `matchId`; the opponent crest + name opens the team by
// `opponentId` (a null id shows the plain `matchup` text); top-level
// opponents link the same way. Plus "Set alert for this" (§1).
"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Bell, BellOff, ChevronRight } from "lucide-react";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { TeamMark } from "@/components/ui";
import { entityHref, matchPageHref } from "@/components/ui/entity-header";
import { prefetchTeam } from "@/features/entity-cache";
import { featureState } from "@/features/matches/live/feature-status";
import { alertComposerHref, alertTargetFromLine, type AlertTargetType } from "@/features/alerts/entry";
import { isCountingStat, PredictionFormat, type PredictionGame } from "./types";

/** "2026-10-12" (a calendar day) or an ISO time → "Oct 12". */
function dayLabel(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function wl(result: string | null): "W" | "L" | null {
  const r = (result ?? "").toLowerCase();
  if (r === "w" || r === "win" || r === "won") return "W";
  if (r === "l" || r === "loss" || r === "lost") return "L";
  return null;
}

/** Opponent crest + name → their team page; plain text when there's no id. */
export function OpponentLink({ id, name, logoURL, size = 18, className, textClassName = "t-body-sm text-primary" }: { id: string | null; name: string | null; logoURL?: string | null; size?: number; className?: string; textClassName?: string }) {
  const label = name ?? "Opponent";
  const inner = (
    <>
      <TeamMark name={label} logoURL={logoURL} size={size} />
      <span className={clsx("truncate", textClassName)}>{label}</span>
    </>
  );
  if (!id) return <span className={clsx("inline-flex items-center gap-1.5 min-w-0", className)}>{inner}</span>;
  return (
    <Link href={entityHref("team", id)} onMouseEnter={() => prefetchTeam(id)} className={clsx("relative z-[1] inline-flex items-center gap-1.5 min-w-0 hover:underline underline-offset-2", className)}>
      {inner}
    </Link>
  );
}

/**
 * Game rows: date · vs opponent (→ team) · map · W/L · value. The row opens
 * the match (a stretched link under the opponent link, so links never nest).
 * Arrives most-recent first, the backend's order.
 */
export function GameRows({ games, baseline, direction, valueLabel, limit = 10, className }: { games: PredictionGame[]; baseline?: number | null; direction?: string | null; valueLabel?: string; limit?: number; className?: string }) {
  const [all, setAll] = useState(false);
  if (games.length === 0) return null;
  const shown = all ? games : games.slice(0, limit);
  const isUnder = direction === "under";
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <div className="ledger">
        {shown.map((g, i) => {
          const res = wl(g.result);
          const hit = baseline == null ? null : isUnder ? g.statValue < baseline : g.statValue >= baseline;
          return (
            <div key={(g.matchId ?? "") + i} className={clsx("relative flex items-center gap-2.5 px-3 py-2 transition-colors", i % 2 === 0 ? "bg-card" : "bg-surface/50", g.matchId && "hover:bg-surface")}>
              {g.matchId ? <Link href={matchPageHref(g.matchId)} className="absolute inset-0" aria-label={`Open the match${g.opponentName ? ` vs ${g.opponentName}` : ""}`} /> : null}
              <span className="w-[46px] shrink-0 t-label-sm text-muted">{dayLabel(g.matchDate) ?? "—"}</span>
              <span className="flex items-center gap-1.5 min-w-0 flex-1">
                {g.opponentId || g.opponentName ? (
                  <>
                    <span className="t-label-sm text-muted shrink-0">vs</span>
                    <OpponentLink id={g.opponentId} name={g.opponentName} logoURL={g.opponentLogoUrl} />
                  </>
                ) : (
                  <span className="t-body-sm text-secondary truncate">{g.matchup ?? "—"}</span>
                )}
                {g.mapName ? <span className="t-label-sm text-muted truncate shrink-[2]">· {g.mapName}</span> : null}
              </span>
              <span className={clsx("w-4 shrink-0 text-center t-label-sm font-semibold", res === "W" ? "text-success" : res === "L" ? "text-error" : "text-muted")}>{res ?? ""}</span>
              <span className={clsx("w-[52px] shrink-0 text-right t-mono-sm", hit == null ? "text-primary" : hit ? "text-success" : "text-muted")}>
                {PredictionFormat.stat(g.statValue)}{valueLabel ? <span className="t-label-sm text-muted"> {valueLabel}</span> : null}
              </span>
              {g.matchId ? <ChevronRight size={11} className="text-muted shrink-0" /> : <span className="w-[11px] shrink-0" />}
            </div>
          );
        })}
      </div>
      {games.length > limit ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="self-start px-1 t-label-md text-violet hover:underline">
          {all ? "Show fewer" : `Show all ${games.length}`}
        </button>
      ) : null}
    </div>
  );
}

/** Is the stat_alerts switch on? */
export function useStatAlertsOn(): boolean {
  const { status } = useAppState();
  return !featureState(status, "stat_alerts").off;
}

/**
 * "Set alert for this" — the composer prefilled with the stat, the direction
 * and the target (counting stats round the line UP: over 17.5 → at least 18).
 * With no line yet: "Set a line to make it an alert" (the picker's hint).
 */
export function SetAlertForThis({ targetType, targetId, targetName, game, stat, line, direction, matchId, hintWithoutLine = true, className }: { targetType: AlertTargetType; targetId: string; targetName: string; game: string; stat: string | null; line: number | null; direction: "over" | "under"; matchId?: string | null; hintWithoutLine?: boolean; className?: string }) {
  const on = useStatAlertsOn();
  if (!on || !targetId) return null;
  if (!stat || line == null || !Number.isFinite(line)) {
    if (!hintWithoutLine) return null;
    return (
      <span className={clsx("flex items-center justify-center gap-1.5 t-label-md text-muted", className)}>
        <BellOff size={13} />Set a line to make it an alert
      </span>
    );
  }
  const href = alertComposerHref({ targetType, targetId, targetName, game, stat, direction, target: alertTargetFromLine(line, isCountingStat(stat)), matchId: matchId ?? null });
  return <AlertPill href={href} className={className}>Set alert for this</AlertPill>;
}

function AlertPill({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={clsx("inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full border border-violet/45 text-violet t-label-md hover:bg-violet/10 transition-colors self-center", className)}>
      <Bell size={14} strokeWidth={2.25} />{children}
    </Link>
  );
}
