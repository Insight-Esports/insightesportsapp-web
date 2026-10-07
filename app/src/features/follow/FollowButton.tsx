// FollowButton — the reusable follow pill (FollowService.swift's FollowButton).
// Drop-in for any screen: <FollowButton targetType="team" targetId={team.id} />
"use client";

import { clsx } from "@/lib/format";
import { useFollow, type FollowTargetType } from "./useFollow";

export function FollowButton({ targetType, targetId, compact = false, className, stopPropagation }: { targetType: FollowTargetType; targetId: string; compact?: boolean; className?: string; /** Set when the button sits inside a link row. */ stopPropagation?: boolean }) {
  const { isFollowing, toggle, busy } = useFollow(targetType, targetId);
  return (
    <button
      type="button"
      aria-pressed={isFollowing}
      disabled={busy || !targetId}
      onClick={(e) => { if (stopPropagation) { e.preventDefault(); e.stopPropagation(); } void toggle(); }}
      className={clsx(
        "inline-flex items-center justify-center rounded-full shrink-0 transition-colors disabled:opacity-60",
        compact ? "t-label-md px-3.5 py-[7px]" : "t-label-lg px-5 py-[9px]",
        isFollowing ? "bg-surface text-secondary hover:text-primary border border-hairline" : "bg-violet text-white hover:brightness-110",
        className,
      )}
    >
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
