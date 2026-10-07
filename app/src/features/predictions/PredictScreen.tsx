// predictions/PredictScreen.tsx — the chrome every predictor sub-screen
// shares: an inline nav row (back + title, the iOS navigationTitle) and
// the premium gate. Content scrolls inside the Page column.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Page } from "@/components/ui";
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
  const router = useRouter();
  const cls = "grid place-items-center size-8 rounded-lg text-secondary hover:text-primary hover:bg-card transition-colors";
  return (
    <div className="flex items-center gap-2 px-3 pt-3 pb-1">
      {back ? (
        <Link href={back} aria-label="Back" className={cls}><ChevronLeft size={20} /></Link>
      ) : (
        <button type="button" onClick={() => router.back()} aria-label="Back" className={cls}><ChevronLeft size={20} /></button>
      )}
      <span className="t-headline-sm text-primary">{title}</span>
      <span className="flex-1" />
      {trailing}
    </div>
  );
}
