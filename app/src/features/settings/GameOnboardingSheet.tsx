// GameOnboardingSheet — GamePreferencesView(isOnboarding: true).
//
// Shown once when a signed-in user has no primary game yet (the picker the
// app presents right after sign-up). Mount it in the shell:
//   <GameOnboardingSheet />
// It renders nothing until `user.primaryGame` is null, and stays closed for
// the session once dismissed or saved.
"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/store/app-state";
import { Sheet } from "@/components/ui";
import { GamePreferencesForm, useGamePreferencesForm } from "./GamePreferences";

export function GameOnboardingSheet() {
  const { user } = useAppState();
  const form = useGamePreferencesForm();
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user && user.primaryGame === null && !dismissed) setOpen(true);
    if (user && user.primaryGame !== null) setOpen(false);
  }, [user, dismissed]);

  if (!user) return null;
  const close = () => { setDismissed(true); setOpen(false); };
  return (
    <Sheet open={open} onClose={close} title="Favorite Games">
      <GamePreferencesForm form={form} onboarding onDone={close} />
    </Sheet>
  );
}
