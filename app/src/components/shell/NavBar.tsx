// NavBar — the system navigation bar of a pushed screen, the way the app
// shows it: on phones a 44pt bar with the brand-violet back chevron on the
// left (ContentView tints every back button insightViolet), the inline
// title centered (17pt semibold), the trailing item on the right, the app
// background and a hairline beneath. Desktop keeps the left-aligned
// headline the web screens already use.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { clsx } from "@/lib/format";

export function NavBar({ title, back, onBack, trailing, principal, leading, hideBackOnDesktop, phoneOnly, className }: {
  title?: string;
  /** Where the chevron goes; omitted = history back. */
  back?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  /** Replaces the title (ToolbarItem(placement: .principal)). */
  principal?: ReactNode;
  /** Replaces the chevron (a "Cancel"/"Done" text item). */
  leading?: ReactNode;
  /** Screens the desktop sidebar reaches directly need no chevron there. */
  hideBackOnDesktop?: boolean;
  /** The screen draws its own desktop header. */
  phoneOnly?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const go = () => (onBack ? onBack() : back ? router.push(back) : router.back());
  const chevron = (cls: string) =>
    back && !onBack ? (
      <Link href={back} aria-label="Back" className={cls}><ChevronLeft size={20} strokeWidth={2.5} /></Link>
    ) : (
      <button type="button" onClick={go} aria-label="Back" className={cls}><ChevronLeft size={20} strokeWidth={2.5} /></button>
    );
  return (
    <>
      {/* Phones: the iOS inline navigation bar. */}
      <div className={clsx("md:hidden sticky top-[env(safe-area-inset-top,0px)] z-20 grid grid-cols-[1fr_auto_1fr] items-center h-11 px-1 bg-bg hairline-b", className)}>
        <div className="flex items-center justify-start min-w-0">
          {leading ?? chevron("grid place-items-center size-11 -ml-0.5 text-violet active:opacity-60")}
        </div>
        <div className="flex items-center justify-center min-w-0 max-w-[60vw]">
          {principal ?? <span className="text-[17px] font-semibold tracking-[-0.2px] text-primary truncate">{title}</span>}
        </div>
        <div className="flex items-center justify-end gap-1 min-w-0 pr-2">{trailing}</div>
      </div>
      {/* Desktop: the web's left-aligned headline row. */}
      {phoneOnly ? null : (
      <div className={clsx("hidden md:flex items-center gap-2 px-3 pt-3 pb-1", className)}>
        {hideBackOnDesktop ? null : leading ?? chevron("grid place-items-center size-8 rounded-lg text-secondary hover:text-primary hover:bg-card transition-colors")}
        {principal ?? <span className="t-headline-sm text-primary truncate">{title}</span>}
        <span className="flex-1" />
        {trailing}
      </div>
      )}
    </>
  );
}
