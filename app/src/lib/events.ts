// lib/events.ts — Events.swift for the web: POST /api/events
// {session_id, app_version, events: [{name, at, props}]}. Fire and forget:
// one request per event, no retries, no errors surfaced (the backend always
// answers 202 and drops unknown names/props itself).
//
//   app_open    once per account per UTC day — feeds the Regular badge.
//   stream_open {id: <match id>} when a LIVE stream opens in the in-app
//               player (not a watch-back) — feeds Ringside.
"use client";

import { api, endpoints } from "./api";

export type EventName = "app_open" | "stream_open";

/** A random id per page load: the web's "session". */
let sessionId: string | null = null;
function session(): string {
  if (!sessionId) {
    try { sessionId = crypto.randomUUID(); } catch { sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36); }
  }
  return sessionId;
}

export function track(name: EventName, props?: Record<string, string | number | boolean | null>): void {
  try {
    const event: { name: string; at: string; props?: Record<string, unknown> } = { name, at: new Date().toISOString() };
    if (props) event.props = props;
    void api.post(endpoints.events, { session_id: session(), app_version: "web", events: [event] }).catch(() => {});
  } catch { /* analytics never breaks the app */ }
}

/** `app_open`, at most once per account per UTC day (the day is remembered in localStorage). */
export function trackAppOpen(userId: string): void {
  if (!userId) return;
  const key = `insight.appOpen.${userId}`;
  const today = new Date().toISOString().slice(0, 10);   // UTC yyyy-mm-dd
  try {
    if (localStorage.getItem(key) === today) return;
    localStorage.setItem(key, today);
  } catch { /* private window: still send, the server counts a day once */ }
  track("app_open");
}
