// predictions/playing-now.tsx — live reads from the all-games screens
// (Nov 5 §7; iOS PredictionTargetSelectView.swift PlayingNow / OptionsKicker
// / PlayingNowOffer).
//
// A player or team picked from "All" (a profile, a link) who is in a live
// match right now gets that match's reads on the spot. "Right now" is the
// header's Live badge rule: the team, or the player's team, is on the app's
// one shared GET /matches/live (polled every 10 s while a screen watches).
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { liveMatchForTeam, useLiveMatches } from "@/lib/live-matches";
import { normalizePlayer, type Match } from "@/lib/types";
import { recallPlayer, rememberPlayer } from "@/features/entity-cache";
import type { PredictionTargetType } from "./types";

// A player's team, once per player id (the remembered row first, else one GET /players/:id).
const teamLookups = new Map<string, Promise<string | null>>();
function playerTeamId(id: string): Promise<string | null> {
  const known = recallPlayer(id)?.teamId;
  if (known) return Promise.resolve(known);
  let p = teamLookups.get(id);
  if (!p) {
    p = api.get(endpoints.playerDetail(id))
      .then((raw) => { const pl = normalizePlayer(raw); rememberPlayer(pl); return pl.teamId ?? null; })
      .catch(() => { teamLookups.delete(id); return null; });
    teamLookups.set(id, p);
  }
  return p;
}

/** The live match this player (their team) or team is playing right now, else null. */
export function usePlayingNow(type: PredictionTargetType, id: string, enabled = true): Match | null {
  const [resolved, setResolved] = useState<{ id: string; teamId: string | null } | null>(null);
  useEffect(() => {
    if (!enabled || !id || type === "team") return;
    let on = true;
    void playerTeamId(id).then((teamId) => { if (on) setResolved({ id, teamId }); });
    return () => { on = false; };
  }, [enabled, type, id]);
  const teamId = !enabled || !id ? null : type === "team" ? id : resolved?.id === id ? resolved.teamId : null;
  const list = useLiveMatches(!!teamId);
  return liveMatchForTeam(list, teamId);
}

/** "● THIS MATCH" (red dot) / "● ALL GAMES" (violet dot): the small label over a group of option rows. */
export function OptionsKicker({ text, live, className }: { text: string; live?: boolean; className?: string }) {
  return (
    <div className={clsx("flex items-center gap-2 px-1", className)}>
      <span className={clsx("size-1.5 rounded-full shrink-0", live ? "bg-live" : "bg-violet")} />
      <span className="text-[11px] font-semibold tracking-[0.127em] text-muted">{text}</span>
    </div>
  );
}

/** One violet-bordered row offering the live version of the screen it sits on
 *  (the all-games breakdown → Current Game Breakdown; Pick a Stat → Live Stat Line). */
export function PlayingNowOffer({ href, title }: { href: string; title: string }) {
  return (
    <Link href={href} className="pressable flex items-center gap-3 p-3.5 rounded-xl bg-card border border-violet/55 hover:border-violet hover:bg-surface/40 transition-colors">
      <span className="flex flex-col gap-1.5 min-w-0">
        <OptionsKicker text="THIS MATCH" live className="!px-0" />
        <span className="t-headline-sm text-primary">{title}</span>
      </span>
      <span className="flex-1" />
      <ChevronRight size={13} className="text-muted shrink-0" />
    </Link>
  );
}
