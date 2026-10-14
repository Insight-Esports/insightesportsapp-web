// predictions/PredictScreen.tsx — the chrome every predictor sub-screen
// shares: an inline nav row (back + title, the iOS navigationTitle) and
// the premium gate. Content scrolls inside the Page column.
"use client";

import { type ReactNode } from "react";
import { Page } from "@/components/ui";
import { NavBar } from "@/components/shell/NavBar";
import { PremiumGate } from "@/features/premium/PremiumGate";

export function PredictScreen({ title, back, children, wide }: { title: string; back?: string; children: ReactNode; wide?: boolean }) {
  return (
    <Page wide={wide}>
      <NavRow title={title} back={back} />
      <PremiumGate feature="predictions">{children}</PremiumGate>
    </Page>
  );
}

export function NavRow({ title, back, trailing }: { title: string; back?: string; trailing?: ReactNode }) {
  return <NavBar title={title} back={back} trailing={trailing} centered />;
}
