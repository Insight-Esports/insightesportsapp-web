// archive/shared.tsx — the archive's routes and the bits every archive screen
// shares: the Premium note and wall, the switch-off state, the load-more
// footer and the year chips.
"use client";

import { useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Crown, Archive as ArchiveIcon } from "lucide-react";
import { EmptyState, ErrorView, FilterChip, Spinner } from "@/components/ui";
import { clsx } from "@/lib/format";
import type { GameId } from "@/lib/types";
import { gameQuery } from "@/features/matches/shared";

// ── Routes ─────────────────────────────────────────────────────────────────
export const archiveHomeHref = (game: GameId = "all") => `/archive${gameQuery(game)}`;
export const archiveYearHref = (year: number, game: GameId = "all") => `/archive/${year}${gameQuery(game)}`;
export const archiveDayHref = (dayKey: string, game: GameId = "all") => `/archive/${dayKey.slice(0, 4)}/${dayKey}${gameQuery(game)}`;
export const teamArchiveHref = (teamId: string) => `/teams/${encodeURIComponent(teamId)}/matches`;
export const playerArchiveHref = (playerId: string) => `/players/${encodeURIComponent(playerId)}/history`;

/** The centered reading column the list screens sit in on wide screens. */
export function ArchiveColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mx-auto w-full max-w-[880px] min-w-0", className)}>{children}</div>;
}

// ── Paywall ────────────────────────────────────────────────────────────────
/** Above a list that fell back to the free window. */
export function PremiumWindowNote({ days, className }: { days: number; className?: string }) {
  return (
    <div className={clsx("mx-4 flex items-start gap-3 px-3.5 py-3 rounded-xl bg-card border border-border-gold", className)}>
      <Crown size={16} className="text-gold fill-gold shrink-0 mt-0.5" />
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="t-body-sm text-secondary">Showing the last {days} days. The full archive back to 2016 is part of Premium.</span>
        <Link href="/premium/upgrade" className="self-start flex items-center gap-1 t-label-lg text-violet hover:underline">Get Premium<ChevronRight size={14} /></Link>
      </div>
    </div>
  );
}

/** When nothing of the request can be shown on a free account. */
export function PremiumWall({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <EmptyState
      icon={<Crown className="text-gold fill-gold" />}
      title="The full archive is Premium"
      subtitle="Every real match back to 2016, by team, player or day."
      actionTitle="Get Premium"
      onAction={() => router.push("/premium/upgrade")}
      className={clsx("mt-4", className)}
    />
  );
}

/** The `match_archive` switch is off. */
export function ArchiveOff({ message }: { message: string }) {
  return <ErrorView message={message} className="pt-16" />;
}

export function ArchiveGlyph({ size = 40, className }: { size?: number; className?: string }) {
  return <ArchiveIcon size={size} className={className} />;
}

// ── Year chips (All, then the years from /archive/years) ───────────────────
export function YearChips({ years, value, onChange, className }: { years: number[]; value: number | null; onChange: (y: number | null) => void; className?: string }) {
  return (
    <div className={clsx("flex items-end gap-6 px-4 overflow-x-auto no-scrollbar", className)}>
      <FilterChip label="All" selected={value === null} onClick={() => onChange(null)} />
      {years.map((y) => <FilterChip key={y} label={String(y)} selected={value === y} onClick={() => onChange(y)} />)}
    </div>
  );
}

// ── Infinite scroll footer ─────────────────────────────────────────────────
/** The bottom row's onAppear: loads the next page as it scrolls into view,
 *  with a spinner while it does and a retry when it fails. */
export function LoadMoreFooter({ reachedEnd, loadingMore, error, onLoadMore, enabled = true }: { reachedEnd: boolean; loadingMore: boolean; error: string | null; onLoadMore: () => void; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useRef(onLoadMore);
  cb.current = onLoadMore;
  const armed = enabled && !reachedEnd && !loadingMore && !error;
  useEffect(() => {
    const el = ref.current;
    if (!el || !armed || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) cb.current(); }, { rootMargin: "320px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [armed]);
  if (reachedEnd) return null;
  return (
    <div ref={ref} className="flex flex-col items-center gap-2 py-4">
      {error ? (
        <>
          <span className="t-body-sm text-muted">{error}</span>
          <button type="button" onClick={onLoadMore} className="btn-ghost !py-2">Try Again</button>
        </>
      ) : <Spinner />}
    </div>
  );
}
