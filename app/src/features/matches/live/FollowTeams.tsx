// FollowTeams.tsx — FollowService + FollowButton (compact) for the two
// teams on the match screen. Optimistic toggle: flips locally, POSTs
// /follow or /unfollow { targetType, targetId }, reverts on failure.
// Membership comes from GET /users/me/following?type=team.
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, endpoints } from "@/lib/api";
import { clsx } from "@/lib/format";
import { str, type Json, type Match } from "@/lib/types";

let cachedTeams: Set<string> | null = null;
let cachedPromise: Promise<Set<string>> | null = null;

async function loadFollowedTeams(force = false): Promise<Set<string>> {
  if (cachedTeams && !force) return cachedTeams;
  cachedPromise ??= (async () => {
    try {
      const rows = await api.get<Json>(endpoints.following("me", 500, 0, "team"));
      const arr: Json[] = Array.isArray(rows) ? rows : Array.isArray(rows?.following) ? rows.following : Array.isArray(rows?.data) ? rows.data : [];
      cachedTeams = new Set(arr.map((r) => str(r?.target_id) ?? str(r?.id)).filter((x): x is string => !!x));
    } catch {
      cachedTeams = new Set();
    }
    cachedPromise = null;
    return cachedTeams;
  })();
  return cachedPromise;
}

export function useFollowTeam(teamId: string | null) {
  const [following, setFollowing] = useState(false);
  useEffect(() => {
    let active = true;
    if (!teamId) return;
    void loadFollowedTeams().then((set) => { if (active) setFollowing(set.has(teamId)); });
    return () => { active = false; };
  }, [teamId]);
  const toggle = useCallback(async () => {
    if (!teamId) return;
    const was = following;
    setFollowing(!was);
    if (was) cachedTeams?.delete(teamId); else cachedTeams?.add(teamId);
    try {
      await api.post(was ? endpoints.unfollow : endpoints.follow, { targetType: "team", targetId: teamId });
    } catch {
      setFollowing(was);
      if (was) cachedTeams?.add(teamId); else cachedTeams?.delete(teamId);
    }
  }, [following, teamId]);
  return { following, toggle };
}

export function FollowButton({ teamId, compact = true, className }: { teamId: string | null; compact?: boolean; className?: string }) {
  const { following, toggle } = useFollowTeam(teamId);
  if (!teamId) return null;
  return (
    <button type="button" onClick={() => void toggle()} aria-pressed={following} className={clsx("rounded-full transition-colors", compact ? "px-3.5 py-[7px] t-label-md" : "px-5 py-[9px] t-label-lg", following ? "bg-surface text-secondary hover:text-primary" : "bg-violet text-white hover:brightness-110", className)}>
      {following ? "Following" : "Follow"}
    </button>
  );
}

/** "Follow the teams" strip: one compact follow button per side. */
export function FollowTeamsRow({ match, team1Id, team2Id }: { match: Match; team1Id: string | null; team2Id: string | null }) {
  if (!team1Id && !team2Id) return null;
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="t-label-sm text-muted">Follow the teams</span>
      <span className="flex-1" />
      {team1Id ? <span className="flex items-center gap-1.5"><span className="t-label-sm text-secondary truncate max-w-[90px]">{match.team1Name}</span><FollowButton teamId={team1Id} /></span> : null}
      {team2Id ? <span className="flex items-center gap-1.5"><span className="t-label-sm text-secondary truncate max-w-[90px]">{match.team2Name}</span><FollowButton teamId={team2Id} /></span> : null}
    </div>
  );
}
