// SetAlertButton — "Set alert" on player and team pages. Outline bell and
// "Set alert" while the target has no active alerts; a filled bell with
// "Alert set" / "N alerts set" once it has. Reads the shared alerts store,
// so it changes the moment the composer saves. Hidden while the
// stat_alerts switch is off.
//
// Set alert ↔ Alert set: the bell is replaced with a small scale + fade
// (`.icon-swap`). The composer is its own page, so the last state each
// target's button showed is remembered for the session: coming back from
// a save swaps the bell in front of you, as the iOS sheet's dismiss does.
"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { Bell } from "lucide-react";
import { clsx } from "@/lib/format";
import { alertComposerHref, type AlertTargetType } from "./entry";
import { alertsForTarget, useAlerts } from "./store";

/** target key → whether its bell was last shown filled. */
const lastShown = new Map<string, boolean>();

export function SetAlertButton({ targetType, targetId, targetName, game, className }: { targetType: AlertTargetType; targetId: string; targetName?: string | null; game: string; className?: string }) {
  const alerts = useAlerts({ maxAgeMs: 60_000 });
  const count = alertsForTarget(alerts.active, targetType, targetId).length;
  const isSet = count > 0;
  const key = `${targetType}:${targetId}`;
  const visible = !alerts.off && !!targetId;
  // Bumps on every swap: re-keys the bell so its replace animation replays.
  const [swaps, setSwaps] = useState(0);
  useLayoutEffect(() => {
    if (!visible || !alerts.loaded) return;
    const before = lastShown.get(key);
    lastShown.set(key, isSet);
    if (before !== undefined && before !== isSet) setSwaps((n) => n + 1);
  }, [key, isSet, visible, alerts.loaded]);

  if (!visible) return null;
  const label = count === 0 ? "Set alert" : count === 1 ? "Alert set" : `${count} alerts set`;
  return (
    <Link
      href={alertComposerHref({ targetType, targetId, targetName, game })}
      aria-label={count === 0 ? `Set alert for ${targetName ?? "this"}` : `${label} for ${targetName ?? "this"}`}
      className={className ?? clsx(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border t-label-md transition-colors whitespace-nowrap",
        count === 0 ? "border-violet/45 text-violet hover:bg-violet/10" : "border-violet bg-violet/12 text-violet hover:bg-violet/20",
      )}
    >
      <Bell key={swaps} size={14} strokeWidth={2.25} fill={isSet ? "currentColor" : "none"} className={swaps > 0 ? "icon-swap" : undefined} />
      {label}
    </Link>
  );
}
