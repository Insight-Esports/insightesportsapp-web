// NotificationSettings — NotificationSettingsView.swift. Four controls:
// master switch, scope, grouped event toggles, quiet hours + digest. The
// backend resolves every type to an effective value and merges PATCHes, so
// this screen renders what it's told and sends only what changed.
// iOS-only: the push-permission prompt (web keeps everything in the inbox).
"use client";

import { useCallback, useEffect, useState } from "react";
import { api, endpoints } from "@/lib/api";
import { type Json } from "@/lib/types";
import { LoadFailure, SkeletonLedger } from "@/components/ui";
import { useFetch } from "@/lib/use-fetch";
import { clsx } from "@/lib/format";
import { NOTIFICATION_TYPES, LEADERBOARD_TYPES, normalizePreferences, type NotificationPreferences, type NotificationTypeId } from "@/features/notifications/types";
import { SettingsFrame, SettingsSection, SettingsToggleRow } from "./components";

const GROUPS: { title: string; types: NotificationTypeId[] }[] = [
  { title: "Match Alerts", types: ["followed_starting_soon", "mid_match", "followed_result"] },
  { title: "Your Activity", types: ["prediction_resolved", "poll_resolved", "weekly_report", "streak_milestone"] },
  { title: "Leaderboard", types: LEADERBOARD_TYPES },
  { title: "Social", types: ["new_follower", "followed_news"] },
];

function displayTime(stamp: string) {
  const hour = parseInt(stamp.slice(0, 2), 10) || 0;
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${suffix}`;
}
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
const deviceTZ = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };

export function NotificationSettings() {
  const fetched = useFetch(async (signal) => normalizePreferences(await api.get<Json>(endpoints.notificationPreferences, { signal })), []);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  useEffect(() => { if (fetched.data) setPrefs(fetched.data); }, [fetched.data]);

  // Keep the server's timezone in step with the device.
  useEffect(() => {
    if (fetched.data && fetched.data.timezone !== deviceTZ()) void api.patch(endpoints.notificationPreferences, { timezone: deviceTZ() }).catch(() => {});
  }, [fetched.data]);

  const patch = useCallback((body: Record<string, unknown>) => { void api.patch(endpoints.notificationPreferences, body).catch(() => {}); }, []);
  const update = (next: Partial<NotificationPreferences>, body: Record<string, unknown>) => {
    setPrefs((p) => (p ? { ...p, ...next } : p));
    patch(body);
  };
  const isEnabled = (id: NotificationTypeId) => prefs?.types[id] ?? NOTIFICATION_TYPES[id].defaultEnabled;
  const setEnabled = (id: NotificationTypeId, on: boolean) => update({ types: { ...(prefs?.types ?? {}), [id]: on } }, { types: { [id]: on } });
  const setQuiet = (change: Partial<Pick<NotificationPreferences, "quietHoursEnabled" | "quietStart" | "quietEnd">>) => {
    if (!prefs) return;
    const merged = { ...prefs, ...change };
    update(change, {
      quiet_hours_enabled: merged.quietHoursEnabled, quiet_start: merged.quietStart, quiet_end: merged.quietEnd, timezone: deviceTZ(),
      quietHoursEnabled: merged.quietHoursEnabled, quietStart: merged.quietStart, quietEnd: merged.quietEnd,
    });
  };

  return (
    <SettingsFrame title="Notifications" backHref="/settings">
      {fetched.loading && !prefs ? (
        <SkeletonLedger rows={6} avatar={0} />
      ) : fetched.error && !prefs ? (
        <LoadFailure error={fetched.error} connectionProblem={fetched.connectionProblem} onRetry={fetched.reload} />
      ) : prefs ? (
        <div className="flex flex-col gap-5">
          <div className="ledger">
            <SettingsToggleRow title="Notifications" subtitle="Turn everything on or off" checked={prefs.enabled} onChange={(on) => update({ enabled: on }, { enabled: on })} />
          </div>

          {prefs.enabled ? (
            <>
              <SettingsSection title="Notify me about">
                <ScopeRow title="Teams and players I follow" subtitle="Results and live alerts only for who you follow" selected={prefs.scope === "followed"} onClick={() => update({ scope: "followed" }, { scope: "followed" })} />
                <ScopeRow title="All matches in my games" subtitle="Every match in your primary and favorite games" selected={prefs.scope === "all"} onClick={() => update({ scope: "all" }, { scope: "all" })} />
              </SettingsSection>

              {GROUPS.map((g) => (
                <SettingsSection key={g.title} title={g.title}>
                  {g.types.map((id) => (
                    <SettingsToggleRow key={id} title={NOTIFICATION_TYPES[id].title} subtitle={NOTIFICATION_TYPES[id].subtitle} checked={isEnabled(id)} onChange={(on) => setEnabled(id, on)} />
                  ))}
                </SettingsSection>
              ))}

              <SettingsSection title="Quiet hours">
                <SettingsToggleRow title="Pause notifications overnight" subtitle="You'll still see everything in your inbox" checked={prefs.quietHoursEnabled} onChange={(on) => setQuiet({ quietHoursEnabled: on })} />
                {prefs.quietHoursEnabled ? (
                  <>
                    <TimeRow label="From" value={prefs.quietStart} onChange={(v) => setQuiet({ quietStart: v })} />
                    <TimeRow label="Until" value={prefs.quietEnd} onChange={(v) => setQuiet({ quietEnd: v })} />
                    <SettingsToggleRow title="Morning summary" subtitle="One recap of what you missed overnight" checked={prefs.morningDigest} onChange={(on) => update({ morningDigest: on }, { morningDigest: on })} />
                  </>
                ) : null}
              </SettingsSection>
              <span className="t-label-sm text-muted px-1 -mt-3">Times are in your device&apos;s timezone ({deviceTZ()}).</span>
            </>
          ) : null}
        </div>
      ) : null}
    </SettingsFrame>
  );
}

function ScopeRow({ title, subtitle, selected, onClick }: { title: string; subtitle: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-surface/60 transition-colors">
      <span className="flex flex-col flex-1 gap-0.5">
        <span className="t-body-md text-primary">{title}</span>
        <span className="t-label-sm text-muted">{subtitle}</span>
      </span>
      <span className={clsx("t-label-sm text-violet", !selected && "opacity-0")}>Selected</span>
    </button>
  );
}

function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3 px-4 py-3">
      <span className="t-body-md text-primary flex-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent t-body-md text-violet outline-none cursor-pointer [&>option]:bg-card [&>option]:text-primary">
        {HOURS.map((h) => <option key={h} value={h}>{displayTime(h)}</option>)}
      </select>
    </label>
  );
}
