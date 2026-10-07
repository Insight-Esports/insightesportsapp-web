// GamePreferences — GamePreferencesView.swift. Pick a PRIMARY game plus any
// additional games. Saved via PATCH /users/me { primaryGame, favoriteGames }.
// The same form serves Settings → Favorite Games and the first-launch
// onboarding sheet (GameOnboardingSheet).
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, endpoints, ApiError } from "@/lib/api";
import { normalizeUser, SELECTABLE_GAMES, gameLabel, type Json } from "@/lib/types";
import { clsx } from "@/lib/format";
import { useAppState } from "@/store/app-state";
import { Spinner } from "@/components/ui";
import { SettingsFrame, SettingsSection } from "./components";

const GAMES = SELECTABLE_GAMES.map((g) => g.id as string);

export function useGamePreferencesForm() {
  const { user, setUser, refreshUser } = useAppState();
  const [primaryGame, setPrimaryGame] = useState("VALORANT");
  const [additional, setAdditional] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed from the current user (server values via AppState).
  useEffect(() => {
    if (!user) return;
    const primary = user.primaryGame ?? user.favoriteGames[0] ?? "VALORANT";
    setPrimaryGame(primary);
    setAdditional(new Set(user.favoriteGames.filter((g) => g !== primary)));
  }, [user]);

  // Promoting an "additional" game to primary removes it from extras; the
  // old primary is NOT auto-added — the user decides.
  const setPrimary = (g: string) => { setAdditional((s) => { const n = new Set(s); n.delete(g); return n; }); setPrimaryGame(g); };
  const toggleAdditional = (g: string) => setAdditional((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });

  // favoriteGames always includes the primary — one list to filter by.
  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    const favorites = [primaryGame, ...Array.from(additional).sort()];
    try {
      const updated = await api.patch<Json>(endpoints.updateProfile, { primaryGame, favoriteGames: favorites });
      if (updated && typeof updated === "object" && updated.id != null) setUser(normalizeUser(updated));
      else await refreshUser();
      return true;
    } catch (e) {
      setError(e instanceof ApiError && e.status < 500 ? e.message : "Couldn't save your games. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { primaryGame, additional, setPrimary, toggleAdditional, save, saving, error };
}

export function GamePreferencesForm({ form, onboarding, onDone }: { form: ReturnType<typeof useGamePreferencesForm>; onboarding?: boolean; onDone?: () => void }) {
  const others = GAMES.filter((g) => g !== form.primaryGame);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.saving) return;
    if (await form.save()) onDone?.();
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {onboarding ? (
        <div className="flex flex-col gap-1.5">
          <span className="t-headline-md text-primary">What do you watch?</span>
          <span className="t-body-sm text-muted">Pick your main game and anything else you follow. Your weekly report and recommendations are built around these.</span>
        </div>
      ) : null}
      <SettingsSection title="Main game">
        {GAMES.map((g) => <GameRow key={g} game={g} selected={form.primaryGame === g} selectionLabel="Main" onClick={() => form.setPrimary(g)} />)}
      </SettingsSection>
      <SettingsSection title="Also interested in">
        {others.map((g) => <GameRow key={g} game={g} selected={form.additional.has(g)} selectionLabel="Added" onClick={() => form.toggleAdditional(g)} />)}
      </SettingsSection>
      {form.error ? <span className="t-label-sm text-error">{form.error}</span> : null}
      {onboarding ? (
        <button type="submit" disabled={form.saving} className="w-full py-[15px] rounded-xl bg-violet text-white t-label-lg hover:brightness-110 disabled:opacity-60">
          {form.saving ? <Spinner size={16} className="border-white/40 border-t-white" /> : "Continue"}
        </button>
      ) : null}
      {/* Enter submits even without the onboarding button. */}
      {!onboarding ? <button type="submit" className="hidden" aria-hidden /> : null}
    </form>
  );
}

function GameRow({ game, selected, selectionLabel, onClick }: { game: string; selected: boolean; selectionLabel: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="flex items-center gap-3 px-4 py-3.5 w-full text-left hover:bg-surface/60 transition-colors">
      <span className="t-body-md text-primary flex-1">{gameLabel(game)}</span>
      <span className={clsx("t-label-sm text-violet", !selected && "opacity-0")}>{selectionLabel}</span>
    </button>
  );
}

/** Settings → Favorite Games (the route). */
export function GamePreferences() {
  const router = useRouter();
  const form = useGamePreferencesForm();
  return (
    <SettingsFrame
      title="Favorite Games"
      backHref="/settings"
      trailing={
        <button type="button" disabled={form.saving} onClick={async () => { if (await form.save()) router.push("/settings"); }} className="t-label-lg text-violet disabled:opacity-60 min-w-12 text-right">
          {form.saving ? <Spinner size={16} className="inline-block" /> : "Save"}
        </button>
      }
    >
      <GamePreferencesForm form={form} onDone={() => router.push("/settings")} />
    </SettingsFrame>
  );
}
