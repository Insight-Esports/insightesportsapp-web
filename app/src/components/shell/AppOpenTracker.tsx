// AppOpenTracker — Events.swift's `app_open`: once per signed-in account per
// UTC day (lib/events.ts remembers the day). Renders nothing; mounted once
// by the signed-in layout. Re-checks when the tab comes back to the front,
// so a tab left open past midnight UTC still counts the new day.
"use client";

import { useEffect } from "react";
import { useAppState } from "@/store/app-state";
import { trackAppOpen } from "@/lib/events";

export function AppOpenTracker() {
  const { user } = useAppState();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    trackAppOpen(userId);
    const onVisible = () => { if (document.visibilityState === "visible") trackAppOpen(userId); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId]);
  return null;
}
