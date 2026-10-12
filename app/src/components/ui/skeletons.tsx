// components/ui/skeletons.tsx — the rest of the app's loading silhouettes.
//
// Components.swift ships four (SkeletonBar, SkeletonLedger, SkeletonMatchCard,
// SkeletonStatRow); every other iOS screen composes its own silhouette from
// those plus a few bespoke shapes (the preview hero, the profile loading
// state, the scoreboard rows). These are those shapes for the web, so a
// screen's skeleton is the exact geometry of what's about to fill it:
// static `bg-surface` bars, striped ledger rows, hairline borders. No
// shimmer, no spinner — the structure is the promise; the data fills it.
"use client";

import { clsx } from "@/lib/format";
import { SkeletonBar, SkeletonLedger, SkeletonStatRow } from "./index";

/** A surface-toned circle (avatar / crest placeholder). */
export function SkeletonCircle({ size = 28, className }: { size?: number; className?: string }) {
  return <span className={clsx("inline-block rounded-full bg-surface shrink-0", className)} style={{ width: size, height: size }} />;
}

/** A surface-toned rounded square (team logo / tile placeholder). */
export function SkeletonTile({ size = 28, radius, className }: { size?: number; radius?: number; className?: string }) {
  return <span className={clsx("inline-block bg-surface shrink-0", className)} style={{ width: size, height: size, borderRadius: radius ?? size * 0.2 }} />;
}

/** Paragraph silhouette: N text lines, the last one shorter. */
export function SkeletonTextLines({ lines = 3, height = 10, className }: { lines?: number; height?: number; className?: string }) {
  const widths = ["100%", "92%", "96%", "84%", "88%"];
  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} width={i === lines - 1 ? "62%" : widths[i % widths.length]} height={height} />
      ))}
    </div>
  );
}

// ── Headers ───────────────────────────────────────────────────────────────

/** Player / team / profile header: big mark, name bar, sub bar(s), centered.
 *  `shape` picks a circle (players, users) or a rounded square (team crests). */
export function SkeletonHero({ size = 80, shape = "circle", lines = 2, className }: { size?: number; shape?: "circle" | "tile"; lines?: 1 | 2 | 3; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center gap-3 px-4 pt-4", className)}>
      {shape === "circle" ? <SkeletonCircle size={size} /> : <SkeletonTile size={size} radius={16} />}
      <SkeletonBar width={140} height={16} />
      {lines >= 2 ? <SkeletonBar width={90} height={10} /> : null}
      {lines >= 3 ? <SkeletonBar width={64} height={10} /> : null}
    </div>
  );
}

/** Two crests facing each other over "VS" — the match preview's hero and
 *  the live / completed HUD's silhouette (UpcomingMatchDetailView.previewSkeleton). */
export function SkeletonMatchHero({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-6 pt-2", className)}>
      <div className="flex items-start px-4">
        <div className="flex-1 flex flex-col items-center gap-2">
          <SkeletonCircle size={64} />
          <SkeletonBar width={88} height={12} />
          <SkeletonBar width={48} height={8} />
        </div>
        <div className="w-14 flex justify-center pt-[26px]"><SkeletonBar width={22} height={10} /></div>
        <div className="flex-1 flex flex-col items-center gap-2">
          <SkeletonCircle size={64} />
          <SkeletonBar width={88} height={12} />
          <SkeletonBar width={48} height={8} />
        </div>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <SkeletonBar width={140} height={10} />
        <SkeletonBar width={180} height={8} />
      </div>
    </div>
  );
}

/** The ScoreHUD at rest: tournament line, two crests with a score column between. */
export function SkeletonScoreHUD({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-4 p-4 rounded-xl bg-card border border-border-subtle", className)}>
      <div className="flex items-center justify-between"><SkeletonBar width={120} height={9} /><SkeletonBar width={48} height={9} /></div>
      <div className="flex items-center">
        <div className="flex-1 flex flex-col items-center gap-2"><SkeletonCircle size={56} /><SkeletonBar width={84} height={11} /></div>
        <div className="flex items-center gap-3 px-3"><SkeletonBar width={30} height={34} /><SkeletonBar width={10} height={14} /><SkeletonBar width={30} height={34} /></div>
        <div className="flex-1 flex flex-col items-center gap-2"><SkeletonCircle size={56} /><SkeletonBar width={84} height={11} /></div>
      </div>
      <div className="flex justify-center"><SkeletonBar width={160} height={9} /></div>
    </div>
  );
}

// ── Tables & grids ────────────────────────────────────────────────────────

/** A StripedTable at rest: muted header cells over N striped rows of dashes;
 *  `avatar` adds a leading mark to every row (rosters, recent games). */
export function SkeletonStripedTable({ rows = 6, columns = 4, avatar = 0, className }: { rows?: number; columns?: number; avatar?: number; className?: string }) {
  const trailing = Math.max(0, columns - 1);
  return (
    <div className={clsx("ledger", className)}>
      <div className="flex items-center gap-1 px-3 py-1.5">
        <span className="flex-1"><SkeletonBar width={54} height={8} /></span>
        {Array.from({ length: trailing }).map((_, i) => <span key={i} className="w-14 flex justify-center"><SkeletonBar width={30} height={8} /></span>)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={clsx("flex items-center gap-1 px-3 py-2.5", i % 2 === 0 ? "bg-card" : "bg-surface/50")}>
          <span className="flex-1 flex items-center gap-2 min-w-0">
            {avatar > 0 ? <SkeletonCircle size={avatar} /> : null}
            <SkeletonBar width={[110, 86, 128, 96][i % 4]} height={10} />
          </span>
          {Array.from({ length: trailing }).map((_, c) => <span key={c} className="w-14 text-center t-mono-sm text-muted/50">—</span>)}
        </div>
      ))}
    </div>
  );
}

/** A grid of StatCards at rest (team statistics, side stats, metrics). */
export function SkeletonStatGrid({ cells = 4, columns = 2, className }: { cells?: number; columns?: 2 | 3; className?: string }) {
  return (
    <div className={clsx("grid gap-2.5", columns === 3 ? "grid-cols-3" : "grid-cols-2", className)}>
      {Array.from({ length: cells }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 p-3 rounded-[10px] bg-surface/60 border border-border-subtle">
          <SkeletonBar width={64} height={8} />
          <SkeletonBar width={44} height={14} />
        </div>
      ))}
    </div>
  );
}

/** The live / final scoreboard: header strip, then two team blocks of five
 *  rows (38pt face, name bar, dashes per stat column). */
export function SkeletonScoreboard({ columns = 5, rows = 5, className }: { columns?: number; rows?: number; className?: string }) {
  const block = (key: string) => (
    <div key={key} className="flex flex-col">
      <span className="py-1.5"><SkeletonBar width={96} height={10} /></span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center py-[7px] gap-2">
          <SkeletonCircle size={38} />
          <span className="w-[90px]"><SkeletonBar width={[78, 64, 84, 70, 60][i % 5]} height={10} /></span>
          <span className="flex-1" />
          {Array.from({ length: columns }).map((_, c) => <span key={c} className="w-11 text-center t-mono-sm text-muted/50">—</span>)}
        </div>
      ))}
    </div>
  );
  return (
    <div className={clsx("flex flex-col gap-2 p-3.5 rounded-xl bg-card border border-border-subtle", className)}>
      <SkeletonBar width={80} height={9} />
      <div className="flex items-center py-1.5 hairline-b gap-2">
        <span className="w-[136px]"><SkeletonBar width={44} height={8} /></span>
        <span className="flex-1" />
        {Array.from({ length: columns }).map((_, c) => <span key={c} className="w-11 flex justify-center"><SkeletonBar width={22} height={8} /></span>)}
      </div>
      {block("t1")}
      <span className="h-2" />
      {block("t2")}
    </div>
  );
}

// ── Lists ─────────────────────────────────────────────────────────────────

/** News list: a featured card (image block + lines) then compact cards. */
export function SkeletonNewsCard({ className }: { className?: string }) {
  return (
    <div className={clsx("flex items-center gap-3 p-3 rounded-xl bg-card border border-border-subtle", className)}>
      <span className="size-20 shrink-0 rounded-lg bg-surface" />
      <div className="flex flex-col gap-2 flex-1"><SkeletonBar height={12} /><SkeletonBar height={12} width="85%" /><SkeletonBar width={80} height={10} /></div>
    </div>
  );
}
export function SkeletonFeaturedNewsCard({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-3 p-3 rounded-[14px] bg-card border border-border-subtle", className)}>
      <span className="block h-[180px] lg:h-[260px] rounded-[10px] bg-surface" />
      <div className="flex flex-col gap-2 px-1 pb-1">
        <SkeletonBar width={140} height={9} />
        <SkeletonBar height={16} />
        <SkeletonBar width="80%" height={16} />
        <SkeletonBar width="92%" height={10} />
        <SkeletonBar width={36} height={9} />
      </div>
    </div>
  );
}

/** Search / people rows: round mark + a name bar (SearchView's loading rows). */
export function SkeletonPeopleRows({ rows = 6, avatar = 40, className }: { rows?: number; avatar?: number; className?: string }) {
  return (
    <div className={clsx("flex flex-col pt-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <SkeletonCircle size={avatar} />
          <div className="flex flex-col gap-1.5 flex-1"><SkeletonBar width={[140, 110, 160, 124][i % 4]} height={12} /><SkeletonBar width={70} height={9} /></div>
        </div>
      ))}
    </div>
  );
}

/** Messages inbox rows: 48pt avatar, name + preview, a time stamp. */
export function SkeletonThreadRows({ rows = 7, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx("flex flex-col", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 pl-4 pr-14 py-2.5 hairline-b">
          <SkeletonCircle size={48} />
          <div className="flex flex-col gap-2 flex-1 min-w-0"><SkeletonBar width={[120, 96, 150, 110][i % 4]} height={12} /><SkeletonBar width={[200, 160, 180, 140][i % 4]} height={10} /></div>
          <SkeletonBar width={28} height={9} />
        </div>
      ))}
    </div>
  );
}

/** A conversation at rest: a handful of bubbles, theirs left, yours right. */
export function SkeletonBubbles({ className }: { className?: string }) {
  const bubbles: { mine: boolean; width: number }[] = [
    { mine: false, width: 180 }, { mine: false, width: 120 }, { mine: true, width: 210 }, { mine: false, width: 150 }, { mine: true, width: 90 }, { mine: true, width: 170 },
  ];
  return (
    <div className={clsx("flex flex-col gap-1.5 max-w-[860px] pt-4", className)}>
      {bubbles.map((b, i) => (
        <div key={i} className={clsx("flex items-end gap-2", b.mine ? "justify-end" : "justify-start")}>
          {!b.mine ? <SkeletonCircle size={24} /> : null}
          <span className={clsx("block h-9 rounded-[18px] bg-surface", b.mine && "opacity-70")} style={{ width: b.width }} />
        </div>
      ))}
    </div>
  );
}

/** Notifications inbox rows: a 40pt mark, title and time bars. */
export function SkeletonNotificationRows({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx("flex flex-col", className)}>
      <span className="block pt-[18px] pb-1.5"><SkeletonBar width={48} height={8} /></span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <SkeletonCircle size={40} />
          <span className="flex flex-col gap-1.5 flex-1"><SkeletonBar width={[180, 220, 160, 200][i % 4]} height={12} /><SkeletonBar width={120} height={10} /></span>
        </div>
      ))}
    </div>
  );
}

/** Leaderboard: the three-column podium then ranked rows. */
export function SkeletonLeaderboard({ rows = 7, className }: { rows?: number; className?: string }) {
  const col = (height: number, size: number, key: string) => (
    <div key={key} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
      <SkeletonCircle size={size} />
      <SkeletonBar width={64} height={10} />
      <SkeletonBar width={36} height={9} />
      <span className="w-full rounded-lg bg-surface/60 border border-border-subtle" style={{ height }} />
    </div>
  );
  return (
    <div className={clsx("flex flex-col gap-3", className)}>
      <div className="flex items-end gap-2.5 pt-3 pb-2">{col(92, 50, "2")}{col(116, 60, "1")}{col(76, 50, "3")}</div>
      <div className="ledger">
        <div className="flex items-center gap-1 px-3 py-1.5 bg-surface/40 hairline-b">
          <span className="w-7 flex justify-center"><SkeletonBar width={10} height={8} /></span>
          <span className="w-5" />
          <span className="flex-1"><SkeletonBar width={48} height={8} /></span>
          <span className="w-16 flex justify-center"><SkeletonBar width={24} height={8} /></span>
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={clsx("flex items-center gap-1 px-3 py-[9px]", i % 2 === 0 ? "bg-card" : "bg-surface/50")}>
            <span className="w-7 flex justify-center"><SkeletonBar width={14} height={10} /></span>
            <span className="w-5" />
            <span className="flex items-center gap-2 flex-1"><SkeletonCircle size={28} /><SkeletonBar width={[110, 90, 130, 100][i % 4]} height={10} /></span>
            <span className="w-16 flex justify-center"><SkeletonBar width={30} height={10} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Whole-screen silhouettes ──────────────────────────────────────────────

/** ProfileLoadingState: avatar, name, the stat strip, the record card. */
export function SkeletonProfile({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center gap-4 px-4 pt-14", className)}>
      <SkeletonCircle size={92} />
      <SkeletonBar width={140} height={20} />
      <span className="w-full h-[70px] rounded-xl bg-surface/70" />
      <span className="w-full h-[120px] rounded-xl bg-surface/70" />
    </div>
  );
}

/** The weekly report at rest: the header tile + three section cards of prose. */
export function SkeletonReport({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-4 pt-3 max-w-[720px]", className)}>
      <div className="flex items-center gap-2.5">
        <SkeletonTile size={44} radius={12} />
        <div className="flex flex-col gap-1.5"><SkeletonBar width={150} height={13} /><SkeletonBar width={22} height={2} /><SkeletonBar width={110} height={8} /></div>
      </div>
      <div className="flex flex-col gap-2 pb-1"><SkeletonBar width={120} height={8} /><SkeletonBar width="88%" height={20} /><SkeletonBar width={28} height={2} /></div>
      {[4, 3, 5].map((lines, i) => (
        <div key={i} className="flex items-stretch p-4 rounded-[14px] bg-card border border-border-subtle">
          <span className="w-[3px] rounded-[2px] bg-surface shrink-0 my-0.5" />
          <div className="flex flex-col gap-2.5 pl-3 flex-1">
            <SkeletonBar width={90} height={8} />
            <SkeletonBar width="70%" height={15} />
            <SkeletonTextLines lines={lines} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** PredictionResultView at rest: the probability dial, its line, the
 *  career-vs-recent row and the last-games bar chart. */
export function SkeletonPredictionResult({ dial = true, className }: { dial?: boolean; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-5", className)}>
      {dial ? (
        <div className="flex flex-col items-center gap-3">
          <span className="block size-[150px] rounded-full border-[10px] border-surface" />
          <SkeletonBar width={160} height={10} />
          <SkeletonBar width={90} height={9} />
        </div>
      ) : null}
      <div className="flex items-stretch gap-3 py-0.5">
        <span className="w-[3px] rounded-[1px] bg-surface shrink-0" />
        <div className="flex flex-col gap-2 flex-1"><SkeletonBar width={64} height={8} /><SkeletonTextLines lines={2} /></div>
      </div>
      <SkeletonStatRow columns={4} />
      <div className="flex flex-col gap-2.5">
        <SkeletonBar width={100} height={8} />
        <div className="flex items-end gap-1.5 h-[120px] p-3.5 rounded-xl bg-card border border-border-subtle">
          {[46, 70, 58, 84, 40, 66, 92, 52, 74, 60].map((h, i) => <span key={i} className="flex-1 rounded-sm bg-surface" style={{ height: `${h}%` }} />)}
        </div>
      </div>
    </div>
  );
}

/** Head-to-head odds at rest: the split bar card and the strength table. */
export function SkeletonHeadToHead({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-5", className)}>
      <div className="flex flex-col items-center gap-2 pt-1"><SkeletonBar width={200} height={16} /><SkeletonBar width={90} height={9} /></div>
      <div className="flex flex-col gap-3 p-4 rounded-[14px] bg-card border border-border-subtle">
        <div className="flex justify-between">
          <div className="flex flex-col gap-1.5"><SkeletonBar width={80} height={10} /><SkeletonBar width={56} height={22} /></div>
          <div className="flex flex-col items-end gap-1.5"><SkeletonBar width={80} height={10} /><SkeletonBar width={56} height={22} /></div>
        </div>
        <span className="block h-2.5 rounded-[5px] bg-surface" />
      </div>
      <div className="p-3.5 rounded-xl bg-card border border-border-subtle"><SkeletonTextLines lines={2} /></div>
      <SkeletonStripedTable rows={5} columns={3} />
    </div>
  );
}

/** Breakdown / map profile at rest: a period row, the record strip, an averages table. */
export function SkeletonBreakdown({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-5", className)}>
      <div className="flex items-end gap-[22px]"><SkeletonBar width={52} height={11} /><SkeletonBar width={48} height={11} /><SkeletonBar width={56} height={11} /></div>
      <SkeletonStatRow columns={3} />
      <div className="flex flex-col gap-2.5 px-3 py-2.5 rounded-xl bg-card border border-border-subtle">
        <SkeletonBar width={120} height={8} />
        <div className="flex gap-[5px]">{Array.from({ length: 10 }).map((_, i) => <SkeletonCircle key={i} size={8} />)}</div>
      </div>
      <div className="flex flex-col gap-2.5"><SkeletonBar width={110} height={8} /><SkeletonStripedTable rows={6} columns={2} /></div>
    </div>
  );
}

/** Live player breakdown at rest: score strip, the read, metrics, rank row. */
export function SkeletonLiveBreakdown({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-4", className)}>
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-card border border-border-subtle">
        <SkeletonCircle size={28} /><SkeletonBar width={90} height={10} /><span className="flex-1" /><SkeletonBar width={48} height={18} /><span className="flex-1" /><SkeletonBar width={90} height={10} /><SkeletonCircle size={28} />
      </div>
      <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-card border border-border-subtle"><SkeletonBar width={120} height={8} /><SkeletonTextLines lines={2} /></div>
      <SkeletonStatRow columns={3} />
      <SkeletonStatRow columns={3} />
      <div className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl bg-card border border-border-subtle"><SkeletonBar width={28} height={14} /><div className="flex flex-col gap-1.5"><SkeletonBar width={150} height={10} /><SkeletonBar width={80} height={8} /></div></div>
    </div>
  );
}

/** PlayerDetailView at rest: header, Recent Form row, All-Time rows, the recent-games table. */
export function SkeletonPlayerDetail({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col", className)}>
      <SkeletonHero size={80} />
      <div className="pt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:pr-4">
        <div className="flex flex-col gap-5">
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={100} height={14} /><SkeletonStatRow columns={5} /></div>
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={72} height={14} /><SkeletonStatRow columns={5} /><SkeletonStatRow columns={3} /></div>
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={110} height={14} /><SkeletonStripedTable rows={6} columns={5} avatar={20} /></div>
        </div>
        <div className="flex flex-col gap-5 lg:row-start-1 lg:col-start-2">
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={96} height={14} /><SkeletonStripedTable rows={4} columns={4} /></div>
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={80} height={14} /><SkeletonLedger rows={3} avatar={20} /></div>
        </div>
      </div>
    </div>
  );
}

/** TeamDetailView at rest: crest header, Season row, map pool, roster, recent games. */
export function SkeletonTeamDetail({ className }: { className?: string }) {
  return (
    <div className={clsx("flex flex-col", className)}>
      <SkeletonHero size={80} shape="tile" lines={3} />
      <div className="pt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:pr-4">
        <div className="flex flex-col gap-5">
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={64} height={14} /><SkeletonStatRow columns={4} /></div>
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={80} height={14} /><SkeletonLedger rows={3} avatar={0} /></div>
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={56} height={14} /><SkeletonStripedTable rows={5} columns={3} avatar={24} /></div>
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={110} height={14} /><SkeletonStripedTable rows={6} columns={4} avatar={20} /></div>
        </div>
        <div className="flex flex-col gap-5 lg:row-start-1 lg:col-start-2">
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={80} height={14} /><SkeletonLedger rows={3} avatar={20} /></div>
          <div className="px-4 flex flex-col gap-3"><SkeletonBar width={120} height={14} /><SkeletonStatGrid cells={4} /></div>
        </div>
      </div>
    </div>
  );
}
