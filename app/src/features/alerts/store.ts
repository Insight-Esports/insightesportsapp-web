// alerts/store.ts — the app's one copy of GET /alerts ({active, history}),
// shared by the list, the alert pages, the composer, the Premium tab row
// and every "Set alert" button (so a button reads "Alert set" the moment
// the composer saves). Plus the local history cut (rev 6): the newest
// final_at cleared and the ids removed, kept per account in localStorage
// until the server has a clear-history endpoint.
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError, endpoints, errorMessage } from "@/lib/api";
import { useAppState } from "@/store/app-state";
import { featureState } from "@/features/matches/live/feature-status";
import { normalizeActive, normalizeAlertList, type ActiveAlert, type HistoryAlert } from "./model";
import type { AlertTargetType } from "./entry";

export interface HistoryCut { before: string | null; ids: string[] }

interface AlertsSnapshot {
  userId: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  connectionProblem: boolean;
  /** The server answered 503 FEATURE_DISABLED for stat_alerts. */
  disabled: boolean;
  active: ActiveAlert[];
  history: HistoryAlert[];
  loadedAt: number;
  cut: HistoryCut;
}

const EMPTY_CUT: HistoryCut = { before: null, ids: [] };
const empty = (userId: string | null): AlertsSnapshot => ({
  userId, loaded: false, loading: false, error: null, connectionProblem: false, disabled: false,
  active: [], history: [], loadedAt: 0, cut: readCut(userId),
});

let state: AlertsSnapshot = { ...empty(null), cut: EMPTY_CUT };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<AlertsSnapshot>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

// ── Local history cut ─────────────────────────────────────────────────────
const cutKey = (userId: string) => `insight.alerts.historyCut.${userId}`;
function readCut(userId: string | null): HistoryCut {
  if (!userId || typeof window === "undefined") return EMPTY_CUT;
  try {
    const raw = window.localStorage.getItem(cutKey(userId));
    if (!raw) return EMPTY_CUT;
    const v = JSON.parse(raw);
    return { before: typeof v?.before === "string" ? v.before : null, ids: Array.isArray(v?.ids) ? v.ids.map(String).slice(-500) : [] };
  } catch { return EMPTY_CUT; }
}
function writeCut(cut: HistoryCut) {
  if (!state.userId || typeof window === "undefined") return;
  try { window.localStorage.setItem(cutKey(state.userId), JSON.stringify(cut)); } catch { /* private mode */ }
}

/** History minus what this account cleared. */
export function visibleHistory(history: HistoryAlert[], cut: HistoryCut): HistoryAlert[] {
  const before = cut.before ? Date.parse(cut.before) : null;
  const ids = new Set(cut.ids);
  return history.filter((h) => {
    if (ids.has(h.id)) return false;
    if (before != null && h.finalAt && Date.parse(h.finalAt) <= before) return false;
    return true;
  });
}

/** "✕ Clear" on one history row. */
export function clearHistoryRow(id: string) {
  if (state.cut.ids.includes(id)) return;
  const cut = { before: state.cut.before, ids: [...state.cut.ids, id].slice(-500) };
  writeCut(cut);
  set({ cut });
}

/** "Clear all": everything decided up to the newest row on screen. */
export function clearAllHistory() {
  const newest = state.history.reduce<number | null>((m, h) => {
    const t = h.finalAt ? Date.parse(h.finalAt) : NaN;
    return Number.isFinite(t) && (m == null || t > m) ? t : m;
  }, state.cut.before ? Date.parse(state.cut.before) : null);
  const before = newest != null ? new Date(newest).toISOString() : state.cut.before;
  // Ids older than the cut are covered by it.
  const keep = state.history.filter((h) => state.cut.ids.includes(h.id) && h.finalAt && before && Date.parse(h.finalAt) > Date.parse(before)).map((h) => h.id);
  const cut = { before, ids: keep };
  writeCut(cut);
  set({ cut });
}

// ── Loading ───────────────────────────────────────────────────────────────
function bindUser(userId: string | null) {
  if (state.userId === userId) return;
  inFlight = null;
  set(empty(userId));
}

/** GET /alerts now (deduped while one is running). */
export function refreshAlerts(): Promise<void> {
  if (!state.userId) return Promise.resolve();
  if (inFlight) return inFlight;
  const forUser = state.userId;
  set({ loading: true });
  inFlight = api.get(endpoints.alerts)
    .then((raw) => {
      if (state.userId !== forUser) return;
      const { active, history } = normalizeAlertList(raw);
      set({ active, history, loaded: true, loading: false, error: null, connectionProblem: false, disabled: false, loadedAt: Date.now() });
    })
    .catch((e) => {
      if (state.userId !== forUser) return;
      const disabled = e instanceof ApiError && e.code === "FEATURE_DISABLED";
      set({ loading: false, loaded: state.loaded || disabled, disabled, error: disabled ? null : errorMessage(e), connectionProblem: e instanceof ApiError && e.isConnectionProblem });
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}

function ensureLoaded(maxAgeMs: number) {
  if (!state.userId) return;
  if (state.loaded && Date.now() - state.loadedAt < maxAgeMs) return;
  void refreshAlerts();
}

// ── Mutations ─────────────────────────────────────────────────────────────
export interface CreateAlertBody {
  game: string; targetType: AlertTargetType; targetId: string;
  kind: string; stat?: string | null; direction?: string | null; target?: number | null; event?: string | null; map?: number | null;
  repeat: boolean; matchId?: string | null;
}
export type PatchAlertBody = Partial<Pick<CreateAlertBody, "kind" | "stat" | "direction" | "target" | "event" | "map">>;

function upsert(a: ActiveAlert) {
  set({ active: [a, ...state.active.filter((x) => x.id !== a.id)] });
}

export async function createAlert(body: CreateAlertBody): Promise<ActiveAlert | null> {
  const raw = await api.post(endpoints.alerts, body);
  const a = raw && typeof raw === "object" && (raw as { id?: unknown }).id != null ? normalizeActive(raw) : null;
  if (a) upsert(a);
  void refreshAlerts();
  return a;
}

export async function updateAlert(id: string, body: PatchAlertBody): Promise<ActiveAlert | null> {
  const raw = await api.patch(endpoints.alert(id), body);
  const a = raw && typeof raw === "object" && (raw as { id?: unknown }).id != null ? normalizeActive(raw) : null;
  if (a) set({ active: state.active.map((x) => (x.id === id ? a : x)) });
  void refreshAlerts();
  return a;
}

export async function deleteAlert(id: string): Promise<void> {
  await api.delete(endpoints.alert(id));
  set({ active: state.active.filter((x) => x.id !== id) });
}

// ── Hooks ─────────────────────────────────────────────────────────────────
function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
const getSnapshot = () => state;

export interface AlertsView extends AlertsSnapshot {
  /** The stat_alerts switch is off (status) or the server said so. */
  off: boolean;
  /** Read only / degraded: lists show, nothing new can be set. */
  degraded: boolean;
  featureMessage: string | null;
  isPremium: boolean;
  /** History minus the local cut. */
  shownHistory: HistoryAlert[];
}

/** The shared alerts list. `maxAgeMs` = how stale a copy may be before mounting refetches it. */
export function useAlerts({ autoload = true, maxAgeMs = 30_000 }: { autoload?: boolean; maxAgeMs?: number } = {}): AlertsView {
  const { user, status } = useAppState();
  const userId = user?.id ?? null;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const feature = featureState(status, "stat_alerts");
  useEffect(() => {
    bindUser(userId);
    if (autoload && userId && !feature.off) ensureLoaded(maxAgeMs);
  }, [userId, autoload, maxAgeMs, feature.off]);
  const mine = snap.userId === userId ? snap : { ...empty(userId), cut: EMPTY_CUT };
  return {
    ...mine,
    off: feature.off || mine.disabled,
    degraded: feature.degraded,
    featureMessage: feature.message,
    isPremium: !!user?.isPremium,
    shownHistory: visibleHistory(mine.history, mine.cut),
  };
}

/** Active alerts on one player or team. */
export function alertsForTarget(active: ActiveAlert[], targetType: AlertTargetType, targetId: string): ActiveAlert[] {
  return active.filter((a) => a.targetType === targetType && a.targetId === targetId);
}
