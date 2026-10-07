// feature-status.ts — AppStatusService.isOff / isDegraded / message for
// the kill switches the live screen honors ("polls", "live_chat").
import type { AppStatus } from "@/lib/types";

export interface FeatureState { off: boolean; degraded: boolean; message: string | null }

export function featureState(status: AppStatus | null, name: string): FeatureState {
  const f = status?.features?.[name];
  if (f === undefined || f === null || f === true) return { off: false, degraded: false, message: null };
  if (f === false) return { off: true, degraded: false, message: "This feature is temporarily unavailable." };
  if (typeof f === "string") {
    const m = f.toLowerCase();
    return { off: m === "off", degraded: m === "degraded" || m === "read_only" || m === "readonly", message: null };
  }
  const mode = (f.mode ?? "on").toLowerCase();
  return { off: mode === "off", degraded: mode === "degraded" || mode === "read_only" || mode === "readonly", message: f.message ?? null };
}
