// FollowButton — FollowService.swift's drop-in button. Solid violet when not
// following, surface-toned "Following" otherwise. Reads/writes the shared
// follow store so Profile, Team/Player detail and the lists stay in sync.
"use client";

import { useEffect } from "react";
import { clsx } from "@/lib/format";
import { loadFollowsIfNeeded, seedFollow, useFollowState, type FollowTargetType } from "./follow-store";

export function FollowButton({ targetType, targetId, compact, initialFollowing, className }: { targetType: FollowTargetType; targetId: string; compact?: boolean; initialFollowing?: boolean; className?: string }) {
  const { following, toggle } = useFollowState(targetType, targetId);
  useEffect(() => {
    if (typeof initialFollowing === "boolean") seedFollow(targetType, targetId, initialFollowing);
    void loadFollowsIfNeeded();
  }, [targetType, targetId, initialFollowing]);
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={following}
      className={clsx(
        "rounded-full transition-colors shrink-0",
        compact ? "px-3.5 py-[7px] t-label-md" : "px-5 py-[9px] t-label-lg",
        following ? "bg-surface text-secondary hover:text-primary" : "bg-violet text-white hover:brightness-110",
        className,
      )}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
