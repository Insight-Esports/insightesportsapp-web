// tournaments/ui.tsx — small pieces the Tournaments list and the bracket
// share: the caps section label, the dashed TBD crest, and "the game on
// now" (a caption over the shared live match link).
"use client";

import type { ReactNode } from "react";
import { LiveMatchLink, useLiveMatchLink } from "@/components/ui/entity-header";
import { clsx } from "@/lib/format";

/** "ON NOW", "PAST EDITIONS", "TITLE ODDS": caps, tracked, quiet. */
export function TourLabel({ children, trailing, className }: { children: ReactNode; trailing?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-baseline gap-2 px-1", className)}>
      <span className="text-[12px] font-semibold tracking-[0.07em] uppercase text-secondary truncate">{children}</span>
      {trailing ? <><span className="flex-1" /><span className="shrink-0 t-label-sm text-muted">{trailing}</span></> : null}
    </div>
  );
}

/** A TBD slot's crest: an empty dashed square. */
export function TbdCrest({ size = 18, className }: { size?: number; className?: string }) {
  return <span aria-hidden className={clsx("inline-block shrink-0 border border-dashed border-border-strong", className)} style={{ width: size, height: size, borderRadius: Math.max(3, size * 0.22) }} />;
}

/** The game on now: "CS2 · QUARTERFINAL · GAME 2" over "● LIVE  SPI 5 – 3 FUT  Watch ›"
 *  (→ the live match, or "Result ›" once it ends). */
export function LiveGameLink({ caption, matchId, className }: { caption?: string | null; matchId: string; className?: string }) {
  const state = useLiveMatchLink({ matchId });
  if (!state.matchId) return null;
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      {caption ? <TourLabel>{caption}</TourLabel> : null}
      <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden">
        <LiveMatchLink state={state} className="py-3" />
      </div>
    </div>
  );
}
