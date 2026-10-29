// SetAlertButton — "Set alert" on player and team pages. Outline bell and
// "Set alert" while the target has no active alerts; a filled bell with
// "Alert set" / "N alerts set" once it has. Reads the shared alerts store,
// so it changes the moment the composer saves. Hidden while the
// stat_alerts switch is off.
"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { clsx } from "@/lib/format";
import { alertComposerHref, type AlertTargetType } from "./entry";
import { alertsForTarget, useAlerts } from "./store";

export function SetAlertButton({ targetType, targetId, targetName, game, className }: { targetType: AlertTargetType; targetId: string; targetName?: string | null; game: string; className?: string }) {
  const alerts = useAlerts({ maxAgeMs: 60_000 });
  if (alerts.off || !targetId) return null;
  const count = alertsForTarget(alerts.active, targetType, targetId).length;
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
      <Bell size={14} strokeWidth={2.25} fill={count > 0 ? "currentColor" : "none"} />
      {label}
    </Link>
  );
}
