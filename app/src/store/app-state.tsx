// app-state.tsx — AppState.swift + AppStatusService, as a React context.
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, endpoints, onApiEvent, setCachedPremium } from "@/lib/api";
import { normalizeUser, type AppStatus, type InsightUser } from "@/lib/types";
import { resetSocket } from "@/lib/socket";

export type ProfileRoute = "profile" | "messages" | "leaderboard" | "weeklyReport" | "settings" | "premium";

type Gate = { kind: "ok" } | { kind: "maintenance"; message: string | null } | { kind: "unreachable" };

interface AppStateValue {
  user: InsightUser | null;
  isPremium: boolean;
  tokenBalance: number;
  isCheckingAuth: boolean;
  /** Re-fetch GET /users/me (after profile edits, purchases, …). */
  refreshUser: () => Promise<InsightUser | null>;
  setUser: (u: InsightUser | null) => void;
  logout: () => Promise<void>;
  // Global profile side panel (ProfileToolbarButton → SidePanel)
  profilePanelOpen: boolean;
  setProfilePanelOpen: (v: boolean) => void;
  // App status (maintenance / banner / connection trouble)
  status: AppStatus | null;
  gate: Gate;
  connectionTrouble: boolean;
  checkStatus: () => Promise<void>;
  // Unread badges
  unreadNotifications: number;
  unreadDMs: number;
  refreshUnread: () => Promise<void>;
  // Cross-tab handoff (Home's empty state → Schedule with the game filter)
  pendingScheduleGame: string | null;
  setPendingScheduleGame: (g: string | null) => void;
  // CLIENT-SIDE prediction counter (UI only; backend enforces)
  predictionsUsedToday: number;
  recordPredictionUsed: () => void;
  freePredictionLimit: number;
  hasReachedPredictionLimit: boolean;
}

const Ctx = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children, initialUser = null }: { children: ReactNode; initialUser?: InsightUser | null }) {
  const router = useRouter();
  const [user, setUserState] = useState<InsightUser | null>(initialUser);
  const [isCheckingAuth, setChecking] = useState(initialUser === null);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [gate, setGate] = useState<Gate>({ kind: "ok" });
  const [connectionTrouble, setConnectionTrouble] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadDMs, setUnreadDMs] = useState(0);
  const [pendingScheduleGame, setPendingScheduleGame] = useState<string | null>(null);
  const [predictionsUsedToday, setPredictionsUsed] = useState(0);
  const failures = useRef(0);

  const setUser = useCallback((u: InsightUser | null) => {
    setUserState(u);
    setCachedPremium(!!u?.isPremium);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const raw = await api.get<Record<string, unknown>>(endpoints.userProfile);
      const u = normalizeUser(raw);
      setUser(u);
      return u;
    } catch {
      return null;
    }
  }, [setUser]);

  const logout = useCallback(async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    await resetSocket();
    setUser(null);
    setProfilePanelOpen(false);
    router.replace("/login");
  }, [router, setUser]);

  const checkStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      if (!r.ok) throw new Error("status");
      const s = (await r.json()) as AppStatus;
      setStatus(s);
      setGate(s?.maintenance?.active ? { kind: "maintenance", message: s.maintenance.message } : { kind: "ok" });
    } catch {
      // Status is advisory; being unable to read it is not maintenance.
    }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const n = await api.get<{ count?: number; unread?: number }>(endpoints.notificationsUnreadCount);
      setUnreadNotifications(Number(n?.count ?? n?.unread ?? 0));
    } catch { /* ignore */ }
    try {
      const d = await api.get<{ count?: number; unread?: number }>(endpoints.dmUnreadCount);
      setUnreadDMs(Number(d?.count ?? d?.unread ?? 0));
    } catch { /* ignore */ }
  }, []);

  // Launch: validate the session (AppState.checkAuthStatus) + /status.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await checkStatus();
      if (initialUser) { setChecking(false); return; }
      try {
        const r = await fetch("/api/auth/session", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (r.ok && j.user) setUser(j.user as InsightUser);
        else if (r.status === 401 || r.status === 403) { setUser(null); router.replace("/login"); }
        // 503: keep whatever we have; the gate shows connection trouble.
      } catch {
        if (!cancelled) setConnectionTrouble(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) void refreshUnread();
  }, [user, refreshUnread]);

  // AppStatusService.noteFailure/noteSuccess: a run of failures = trouble.
  useEffect(() => {
    return onApiEvent((e) => {
      switch (e.type) {
        case "success":
          failures.current = 0;
          setConnectionTrouble(false);
          if (gate.kind === "unreachable") setGate({ kind: "ok" });
          break;
        case "failure":
          failures.current += 1;
          if (failures.current >= 2) setConnectionTrouble(true);
          if (failures.current >= 5) setGate({ kind: "unreachable" });
          break;
        case "maintenance":
          void checkStatus();
          break;
        case "session-ended":
          setUser(null);
          router.replace("/login?reason=expired");
          break;
        default:
          break;
      }
    });
  }, [checkStatus, gate.kind, router, setUser]);

  // Re-check status whenever the tab returns to the foreground.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") { void checkStatus(); if (user) void refreshUnread(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [checkStatus, refreshUnread, user]);

  const value = useMemo<AppStateValue>(() => ({
    user,
    isPremium: !!user?.isPremium,
    tokenBalance: user?.tokenBalance ?? 0,
    isCheckingAuth,
    refreshUser,
    setUser,
    logout,
    profilePanelOpen,
    setProfilePanelOpen,
    status,
    gate,
    connectionTrouble,
    checkStatus,
    unreadNotifications,
    unreadDMs,
    refreshUnread,
    pendingScheduleGame,
    setPendingScheduleGame,
    predictionsUsedToday,
    recordPredictionUsed: () => setPredictionsUsed((n) => n + 1),
    freePredictionLimit: 3,
    hasReachedPredictionLimit: !user?.isPremium && predictionsUsedToday >= 3,
  }), [user, isCheckingAuth, refreshUser, setUser, logout, profilePanelOpen, status, gate, connectionTrouble, checkStatus, unreadNotifications, unreadDMs, refreshUnread, pendingScheduleGame, predictionsUsedToday]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppState must be used inside <AppStateProvider>");
  return v;
}
