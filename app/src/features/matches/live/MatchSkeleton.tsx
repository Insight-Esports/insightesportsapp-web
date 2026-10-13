// MatchSkeleton.tsx — the /match/[id] screens' silhouettes.
//
// The loader page shows one while it fetches the Match; the live / completed
// / upcoming screens show the SAME one while their own first requests run,
// so the user sees a single uninterrupted skeleton and then the finished
// screen — never a half-filled HUD with stats popping in underneath.
"use client";

import { Page, SkeletonBar, SkeletonLedger, SkeletonStatRow, SplitLayout } from "@/components/ui";
import { SkeletonMatchHero, SkeletonScoreboard, SkeletonScoreHUD, SkeletonTextLines } from "@/components/ui/skeletons";

export type MatchSkeletonVariant = "live" | "completed" | "upcoming";

/** The main column only (no Page / title strip) — for screens that keep their own chrome. */
export function MatchMainSkeleton({ variant, withHUD = true }: { variant: MatchSkeletonVariant; withHUD?: boolean }) {
  if (variant === "upcoming") {
    // UpcomingMatchDetailView.previewSkeleton, shape for shape.
    return (
      <div className="flex flex-col gap-6 pt-2">
        <SkeletonMatchHero />
        <SkeletonStatRow columns={2} />
        <SkeletonLedger rows={4} avatar={0} />
        <SkeletonLedger rows={2} avatar={20} />
        <div className="grid grid-cols-2 gap-2.5"><SkeletonLedger rows={5} avatar={24} /><SkeletonLedger rows={5} avatar={24} /></div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {withHUD ? <SkeletonScoreHUD /> : null}
      {/* Follow row */}
      <div className="flex items-center gap-3 px-1"><SkeletonBar width={120} height={10} /><span className="flex-1" /><SkeletonBar width={64} height={26} /><SkeletonBar width={64} height={26} /></div>
      {/* Round tracker / objectives */}
      <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-card border border-border-subtle">
        <SkeletonBar width={90} height={9} />
        <div className="flex gap-1">{Array.from({ length: 24 }).map((_, i) => <span key={i} className="flex-1 h-5 rounded-[3px] bg-surface" />)}</div>
      </div>
      {variant === "live" ? (
        <div className="flex flex-col gap-2.5 p-3.5 rounded-xl bg-card border border-border-subtle">
          <div className="flex justify-between"><SkeletonBar width={80} height={9} /><SkeletonBar width={80} height={9} /></div>
          <span className="block h-2.5 rounded-[5px] bg-surface" />
        </div>
      ) : null}
      <SkeletonScoreboard columns={5} />
    </div>
  );
}

/** The rail: poll / chat (live) or just the discussion thread. */
export function MatchRailSkeleton({ variant }: { variant: MatchSkeletonVariant }) {
  return (
    <div className="flex flex-col gap-4 lg:pt-2">
      {variant === "live" ? (
        <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-card border border-border-subtle">
          <SkeletonBar width={100} height={9} />
          <SkeletonBar width="80%" height={12} />
          <SkeletonBar height={38} className="!rounded-lg" />
          <SkeletonBar height={38} className="!rounded-lg" />
        </div>
      ) : null}
      {variant === "upcoming" ? (
        <div className="flex flex-col gap-2.5">
          <SkeletonBar width={120} height={12} />
          {[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border-subtle"><SkeletonBar width={30} height={30} className="!rounded-lg" /><div className="flex flex-col gap-1.5 flex-1"><SkeletonBar width={150} height={10} /><SkeletonBar width={200} height={8} /></div></div>)}
        </div>
      ) : null}
      <div className="flex flex-col rounded-xl bg-card border border-border-subtle overflow-hidden">
        <div className="flex items-center gap-2.5 px-3.5 py-3"><SkeletonBar width={17} height={17} /><div className="flex flex-col gap-1.5"><SkeletonBar width={110} height={11} /><SkeletonBar width={80} height={8} /></div></div>
        <div className="px-3.5 pb-3"><SkeletonBar height={40} className="!rounded-[10px]" /></div>
        <div className="hairline-t p-3.5"><SkeletonTextLines lines={3} /></div>
      </div>
    </div>
  );
}

/** Whole screen: title strip + the two columns (what the loader page shows). */
export function MatchScreenSkeleton({ variant = "live" }: { variant?: MatchSkeletonVariant }) {
  return (
    <Page wide>
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-2"><SkeletonBar width={40} height={12} /><SkeletonBar width={160} height={10} /></div>
      <SplitLayout main={<MatchMainSkeleton variant={variant} />} rail={<MatchRailSkeleton variant={variant} />} />
    </Page>
  );
}
