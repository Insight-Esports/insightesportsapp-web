// NavBar — the system navigation bar of a pushed screen, the way the app
// shows it: on phones a 44pt bar with the brand-violet back chevron on the
// left (ContentView tints every back button insightViolet), the inline
// title centered (17pt semibold), the trailing item on the right, the app
// background and a hairline beneath. Desktop keeps the left-aligned
// headline the web screens already use, with the same chevron before it.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { clsx } from "@/lib/format";

/** History back — or home when this tab has nowhere to go back to (a deep link). */
export function useGoBack(): () => void {
  const router = useRouter();
  return () => {
    if (typeof window !== "undefined" && window.history.length <= 1) router.push("/");
    else router.back();
  };
}

/** The violet back chevron every pushed screen shows at its top-left. */
export function BackButton({ href, onClick, className }: { href?: string; onClick?: () => void; /** Replaces the default 32pt box. */ className?: string }) {
  const goBack = useGoBack();
  const cls = clsx("grid place-items-center text-violet transition-colors active:opacity-60", className ?? "size-8 rounded-lg hover:bg-card");
  const icon = <ChevronLeft size={20} strokeWidth={2.5} />;
  return href && !onClick ? (
    <Link href={href} aria-label="Back" className={cls}>{icon}</Link>
  ) : (
    <button type="button" onClick={onClick ?? goBack} aria-label="Back" className={cls}>{icon}</button>
  );
}

export function NavBar({ title, back, onBack, trailing, principal, leading, phoneOnly, className }: {
  title?: string;
  /** Where the chevron goes; omitted = history back. */
  back?: string;
  onBack?: () => void;
  trailing?: ReactNode;
  /** Replaces the title (ToolbarItem(placement: .principal)). */
  principal?: ReactNode;
  /** Replaces the chevron (a "Cancel"/"Done" text item). */
  leading?: ReactNode;
  /** The screen draws its own desktop header. */
  phoneOnly?: boolean;
  className?: string;
}) {
  const chevron = (cls?: string) => <BackButton href={back} onClick={onBack} className={cls} />;
  return (
    <>
      {/* Phones: the iOS inline navigation bar. */}
      <div className={clsx("md:hidden sticky top-[env(safe-area-inset-top,0px)] z-20 grid grid-cols-[1fr_auto_1fr] items-center h-11 px-1 bg-bg hairline-b", className)}>
        <div className="flex items-center justify-start min-w-0">
          {leading ?? chevron("size-11 -ml-0.5")}
        </div>
        <div className="flex items-center justify-center min-w-0 max-w-[60vw]">
          {principal ?? <span className="text-[17px] font-semibold tracking-[-0.2px] text-primary truncate">{title}</span>}
        </div>
        <div className="flex items-center justify-end gap-1 min-w-0 pr-2">{trailing}</div>
      </div>
      {/* Desktop: the web's left-aligned headline row. */}
      {phoneOnly ? null : (
      <div className={clsx("hidden md:flex items-center gap-2 px-3 pt-3 pb-1", className)}>
        {leading ?? chevron()}
        {principal ?? <span className="t-headline-sm text-primary truncate">{title}</span>}
        <span className="flex-1" />
        {trailing}
      </div>
      )}
    </>
  );
}
