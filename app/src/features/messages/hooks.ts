// messages/hooks.ts — small hooks the DM screens share: the link state of
// this browser, a minute tick for relative times, the dm_media / dm_video
// feature gates and page visibility (isForeground).
"use client";

import { useEffect, useState } from "react";
import type { AppStatus } from "@/lib/types";
import { useAppState } from "@/store/app-state";
import { currentLinkState, onDM, startDM, type LinkState } from "./service";

/** Starts the DM service for the signed-in user and follows its link state. */
export function useDMLink(): LinkState {
  const { user } = useAppState();
  const userId = user?.id ?? null;
  const [state, setState] = useState<LinkState>(() => currentLinkState());
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const off = onDM("link", ({ state: s }) => { if (active) setState(s); });
    void startDM(userId).then((s) => { if (active) setState(s); });
    return () => { active = false; off(); };
  }, [userId]);
  return state;
}

/** Re-renders every `ms` so "2m" / "Seen 5m ago" tick over (InboxThread.renderKey's minute). */
export function useNow(ms = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** /status → features: a flag is ON only when listed as on (true, "on", {mode:"on"}). */
export function featureOn(status: AppStatus | null, name: string): boolean {
  const f = status?.features?.[name];
  if (f === true) return true;
  if (typeof f === "string") return f.toLowerCase() === "on";
  if (f && typeof f === "object") return (f.mode ?? "").toLowerCase() === "on";
  return false;
}

/** AppStatusService.isOff / isDegraded / message for "dms" (the thread's read-only switch). */
export function dmsReadOnly(status: AppStatus | null): { readOnly: boolean; message: string | null } {
  const f = status?.features?.dms;
  if (f === undefined || f === null || f === true) return { readOnly: false, message: null };
  if (f === false) return { readOnly: true, message: null };
  if (typeof f === "string") { const m = f.toLowerCase(); return { readOnly: m === "off" || m === "degraded" || m === "read_only" || m === "readonly", message: null }; }
  const mode = (f.mode ?? "on").toLowerCase();
  return { readOnly: mode === "off" || mode === "degraded" || mode === "read_only" || mode === "readonly", message: f.message ?? null };
}

export function useMediaFeatures(): { media: boolean; video: boolean } {
  const { status } = useAppState();
  return { media: featureOn(status, "dm_media"), video: featureOn(status, "dm_video") };
}

/** True while the tab is visible (scenePhase == .active). */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => (typeof document === "undefined" ? true : document.visibilityState === "visible"));
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    window.addEventListener("focus", on);
    return () => { document.removeEventListener("visibilitychange", on); window.removeEventListener("focus", on); };
  }, []);
  return visible;
}
